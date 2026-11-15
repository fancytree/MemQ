import OAuthProvider, { AuthorizationError, CimdFetchError, OAuthError, authorizationErrorRedirect, type OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import { createClient } from '@supabase/supabase-js';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { createMemqServer } from './tools.js';
import { consentPage } from './consent.js';
import { localCimdAllowed, localCoordinatorTestAllowed, validSessionEncryptionKey, validateBrokerRuntime } from './runtime.js';
import { handleConnections } from './connections.js';
import { connectionsCors } from './connectionsCors.js';
import { exchangeUpstream, UpstreamAuthError, type UpstreamSession } from './upstream.js';
import { GrantCoordinator } from './grantCoordinator.js';
import { coordinatedExchange } from './coordinatedExchange.js';
import { authorizedSession } from './authorizedSession.js';
import { localRevocation } from './localRevocationGuard.js';
import { recordIssuedTokens } from './recordIssuedTokens.js';
import { initializeCoordinatedGrant } from './coordinatedGrant.js';
import { AssertionReplay } from './assertionReplay.js';
import { assertionReplayKv } from './assertionReplayKv.js';

export { GrantCoordinator, AssertionReplay };

type BrokerEnv = Cloudflare.Env & { OAUTH_PROVIDER: OAuthHelpers; COORDINATED_LOCAL_TEST?: string; LOCAL_ASSERTION_REPLAY_TEST?: string; LOCAL_CIMD_TEST?: string; ASSERTION_REPLAY?: DurableObjectNamespace<AssertionReplay>; SESSION_ENCRYPTION_KEY?: string; GRANT_COORDINATORS?: DurableObjectNamespace<GrantCoordinator> };
const callbackUri = (env: BrokerEnv) => `${env.BROKER_ORIGIN}/oauth/callback`;
const config = (env: BrokerEnv) => ({ supabaseUrl: env.SUPABASE_URL, publicKey: env.SUPABASE_ANON_KEY, clientId: env.SUPABASE_OAUTH_CLIENT_ID, redirectUri: callbackUri(env) });
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function isSession(value: unknown): value is UpstreamSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.userId === 'string' && !!v.userId && typeof v.accessToken === 'string' && !!v.accessToken && typeof v.refreshToken === 'string' && !!v.refreshToken && typeof v.expiresAt === 'number';
}
function unavailable(): Response { return new Response('Authorization unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
const authHandler = {
  async fetch(req: Request, env: BrokerEnv): Promise<Response> {
    const path = new URL(req.url).pathname;
    const oauth = env.OAUTH_PROVIDER;
    try {
      if (path === '/connections' || path.startsWith('/connections/')) {
        const cors = connectionsCors(req, (env as BrokerEnv & { APP_WEB_ORIGIN?: string }).APP_WEB_ORIGIN);
        if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors ?? undefined });
        const response = await handleConnections(req, env, oauth,
          env.COORDINATED_LOCAL_TEST === 'true' ? (grant, owner) => env.GRANT_COORDINATORS!.getByName(grant).revoke(owner) : undefined);
        if (!cors) return response;
        cors.forEach((value, key) => response.headers.set(key, value));
        return response;
      }
      if (path === '/authorize' && req.method === 'GET') {
        const request = await oauth.parseAuthRequest(req);
        const details = await oauth.describeConsent(request);
        const consent = await oauth.beginConsent(request);
        consent.headers.set('Content-Type', 'text/html; charset=utf-8');
        return new Response(consentPage(details, consent.handle), { headers: consent.headers });
      }
      if (path === '/authorize' && req.method === 'POST') {
        const form = await req.formData();
        const handle = String(form.get('handle') || '');
        if (form.get('decision') !== 'approve') {
          const denied = await oauth.denyConsent(req, handle);
          return new Response(null, { status: 302, headers: denied.headers });
        }
        const approved = await oauth.approveConsent(req, handle);
        const verifier = b64(crypto.getRandomValues(new Uint8Array(48)));
        const challenge = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
        const upstream = await oauth.beginUpstream(approved.request, { data: { verifier }, headers: approved.headers });
        const target = new URL('/auth/v1/oauth/authorize', env.SUPABASE_URL);
        target.search = new URLSearchParams({ client_id: env.SUPABASE_OAUTH_CLIENT_ID, redirect_uri: callbackUri(env), response_type: 'code', scope: 'openid offline_access', code_challenge: challenge, code_challenge_method: 'S256', state: upstream.state }).toString();
        upstream.headers.set('Location', target.toString());
        return new Response(null, { status: 302, headers: upstream.headers });
      }
      if (path === '/oauth/callback' && req.method === 'GET') {
        const upstream = await oauth.finishUpstream<{ verifier: string }>(req);
        const url = new URL(req.url);
        if (url.searchParams.has('error')) {
          upstream.headers.set('Location', authorizationErrorRedirect(upstream.request, 'access_denied'));
          return new Response(null, { status: 302, headers: upstream.headers });
        }
        const code = url.searchParams.get('code');
        if (!code || !upstream.data?.verifier) return unavailable();
        const session = await exchangeUpstream(config(env), { code, verifier: upstream.data.verifier });
        const completed = await oauth.completeAuthorization({ request: upstream.request, userId: session.userId, metadata: {}, scope: upstream.request.scope, props: session, ...(env.COORDINATED_LOCAL_TEST === 'true' ? { revokeExistingGrants: false } : {}) });
        if (env.COORDINATED_LOCAL_TEST === 'true') {
          // This code comes directly from the provider, never from a client.
          const codeParts = new URL(completed.redirectTo).searchParams.get('code')?.split(':');
          const grant = codeParts?.length === 3 && codeParts[0] === session.userId && /^[A-Za-z0-9_-]{1,128}$/.test(codeParts[1]) && codeParts[2] ? codeParts[1] : null;
          if (!grant || !upstream.request.clientId || !await initializeCoordinatedGrant(env.GRANT_COORDINATORS!.getByName(grant), env.SESSION_ENCRYPTION_KEY || '', session.userId, grant, session, upstream.request.clientId, true)) {
            if (grant) await oauth.revokeGrant(grant, session.userId);
            return unavailable();
          }
        }
        upstream.headers.set('Location', completed.redirectTo);
        return new Response(null, { status: 302, headers: upstream.headers });
      }
      return new Response('Not found', { status: 404 });
    } catch (error) {
      if (error instanceof AuthorizationError && error.redirectTo) return Response.redirect(error.redirectTo, 302);
      if (error instanceof AuthorizationError || error instanceof CimdFetchError) return new Response('Authorization request is invalid or expired.', { status: 400, headers: { 'Cache-Control': 'no-store' } });
      console.error(JSON.stringify({ event: 'broker_authorization_failed', kind: error instanceof UpstreamAuthError ? error.kind : 'unexpected' }));
      return unavailable();
    }
  },
};
const apiHandler = {
  async fetch(req: Request, env: BrokerEnv, ctx: ExecutionContext): Promise<Response> {
    const session: unknown = env.COORDINATED_LOCAL_TEST === 'true'
      ? await authorizedSession((ctx as ExecutionContext & { auth?: { userId?: string } }).auth, ctx.props,
        (grant) => env.GRANT_COORDINATORS!.getByName(grant), env.SESSION_ENCRYPTION_KEY || '')
      : ctx.props;
    if (!isSession(session) || session.expiresAt <= Date.now()) return new Response('Unauthorized', { status: 401 });
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${session.accessToken}` } }, auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user || user.id !== session.userId) return new Response('Unauthorized', { status: 401 });
    return createMcpHandler(() => createMemqServer(client, user.id)).fetch(req);
  },
};

function createProvider(origin: string, enableLocalCimd = false) {
  return new OAuthProvider<BrokerEnv>({
  apiRoute: '/mcp', apiHandler, defaultHandler: authHandler,
  authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token', clientRegistrationEndpoint: '/oauth/register',
  resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
  scopesSupported: ['offline_access'],
  clientIdMetadataDocumentEnabled: enableLocalCimd,
  accessTokenTTL: 300, refreshTokenTTL: 2592000,
  tokenExchangeCallback: async ({ grantType, props, env, userId, grantId, clientId }) => {
    if (env.COORDINATED_LOCAL_TEST === 'true') {
      const result = await coordinatedExchange({ grantType, props, userId, grantId, clientId },
        (grant) => env.GRANT_COORDINATORS!.getByName(grant), env.SESSION_ENCRYPTION_KEY || '',
        (previous) => exchangeUpstream(config(env), { refreshToken: previous.refreshToken, expectedUserId: userId }));
      if (!result) throw new OAuthError('temporarily_unavailable', { statusCode: 503, description: 'The connection is unavailable or needs to be reconnected.' });
      return result;
    }
    if (grantType !== 'refresh_token') return;
    if (!isSession(props)) throw new OAuthError('invalid_grant', { description: 'The connection is invalid.' });
    try {
      const session = await exchangeUpstream(config(env), { refreshToken: props.refreshToken, expectedUserId: props.userId });
      return { newProps: session };
    } catch (error) {
      if (error instanceof UpstreamAuthError && error.kind === 'invalid_grant') throw new OAuthError('invalid_grant', { description: 'The connection has expired.' });
      throw new OAuthError('temporarily_unavailable', { statusCode: 503, description: 'The connection is temporarily unavailable.' });
    }
  },
  });
}
// The broker remains off until explicit, validated configuration is supplied.
export default {
  async fetch(req: Request, env: BrokerEnv, ctx: ExecutionContext): Promise<Response> {
    const origin = validateBrokerRuntime(env as BrokerEnv & { BROKER_TEST_ONLY_ALLOW_EVENTUAL_CONSISTENCY?: string }, req.url);
    if (!origin || !env.OAUTH_KV) return unavailable();
    if (env.LOCAL_CIMD_TEST === 'true' && !localCimdAllowed(env.COORDINATED_LOCAL_TEST === 'true', env.LOCAL_ASSERTION_REPLAY_TEST === 'true', Cloudflare.compatibilityFlags.global_fetch_strictly_public === true)) return unavailable();
    if (env.COORDINATED_LOCAL_TEST === 'true') {
      if (!localCoordinatorTestAllowed(origin, env.SUPABASE_URL, !!env.GRANT_COORDINATORS, validSessionEncryptionKey(env.SESSION_ENCRYPTION_KEY))) return unavailable();
      if (env.LOCAL_ASSERTION_REPLAY_TEST === 'true') {
        if (!env.ASSERTION_REPLAY) return unavailable();
        const namespace = env.ASSERTION_REPLAY;
        env = { ...env, OAUTH_KV: assertionReplayKv(env.OAUTH_KV, (key) => namespace.getByName(key).claim()) };
      }
      const provider = createProvider(origin, env.LOCAL_CIMD_TEST === 'true');
      const response = await localRevocation(req, (request) => provider.fetch(request, env, ctx),
        (grant, owner) => env.GRANT_COORDINATORS!.getByName(grant).revoke(owner),
        (grant, owner, digest, client) => env.GRANT_COORDINATORS!.getByName(grant).hasIssuedToken(owner, client, digest));
      if (response) return response;
      const tokenRequestStartedAt = Date.now();
      const providerResponse = await provider.fetch(req, env, ctx);
      return recordIssuedTokens(req, providerResponse, (grant) => env.GRANT_COORDINATORS!.getByName(grant), tokenRequestStartedAt);
    }
    return createProvider(origin).fetch(req, env, ctx);
  },
};
