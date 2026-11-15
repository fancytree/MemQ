import { env } from 'cloudflare:workers';
import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { describe, expect, it, vi } from 'vitest';
import { assertionReplayKv } from '../../src/assertionReplayKv.js';
import broker from '../../src/index.js';

const encode = (value) => btoa(String.fromCharCode(...value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const json = (value) => encode(new TextEncoder().encode(JSON.stringify(value)));
const clientId = 'https://client.example/metadata.json';
const issuer = 'https://broker.example';

async function assertion(privateKey, jti, subject = clientId, audience = issuer) {
  const rsa = privateKey.algorithm.name === 'RSASSA-PKCS1-v1_5';
  const head = json({ alg: rsa ? 'RS256' : 'ES256', typ: 'JWT', ...(rsa ? { kid: 'synthetic-key' } : {}) });
  const body = json({ iss: subject, sub: subject, aud: audience, exp: Math.floor(Date.now() / 1000) + 300, jti });
  const input = `${head}.${body}`;
  const signature = await crypto.subtle.sign(rsa ? 'RSASSA-PKCS1-v1_5' : { name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(input));
  return `${input}.${encode(new Uint8Array(signature))}`;
}

describe('pinned provider assertion verifier integration', () => {
  it('runs the broker consent, upstream callback and coordinated signed token lifecycle', async () => {
    const origin = 'http://127.0.0.1:18791';
    const client = `https://client.example/${crypto.randomUUID()}`;
    const otherClient = `https://client.example/${crypto.randomUUID()}`;
    const algorithm = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
    const keys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    const otherKeys = await crypto.subtle.generateKey(algorithm, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    const otherJwk = await crypto.subtle.exportKey('jwk', otherKeys.publicKey);
    const bindings = { OAUTH_KV: env.OAUTH_KV, BROKER_ENABLED: 'true', BROKER_ORIGIN: origin, SUPABASE_URL: 'http://127.0.0.1:55421', SUPABASE_OAUTH_CLIENT_ID: 'synthetic-client', SUPABASE_ANON_KEY: 'synthetic-key', SESSION_ENCRYPTION_KEY: encode(new Uint8Array(32)), GRANT_COORDINATORS: env.GRANTS, ASSERTION_REPLAY: env.REPLAY, COORDINATED_LOCAL_TEST: 'true', LOCAL_ASSERTION_REPLAY_TEST: 'true', LOCAL_CIMD_TEST: 'true' };
    const ctx = { waitUntil() {} };
    let upstreamRefreshes = 0;
    vi.stubGlobal('fetch', async (input, init) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.href === client || url.href === otherClient) return Response.json({ client_id: url.href, client_name: 'Synthetic client', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'], token_endpoint_auth_signing_alg: 'RS256', jwks_uri: `${url.href}/jwks.json` });
      if (url.href === `${client}/jwks.json` || url.href === `${otherClient}/jwks.json`) return Response.json({ keys: [{ ...(url.href === `${client}/jwks.json` ? jwk : otherJwk), kid: 'synthetic-key', alg: 'RS256', use: 'sig' }] });
      if (url.pathname === '/auth/v1/oauth/token') {
        const params = new URLSearchParams(init.body);
        if (params.get('grant_type') === 'refresh_token') upstreamRefreshes++;
        return Response.json({ access_token: 'synthetic-upstream-access', refresh_token: `synthetic-upstream-refresh-${upstreamRefreshes}`, expires_in: 3600 });
      }
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'synthetic-user' });
      throw new Error(`Unexpected synthetic endpoint: ${url.pathname}`);
    });
    try {
      const discovery = await broker.fetch(new Request(`${origin}/.well-known/oauth-authorization-server`), bindings, ctx);
      const metadata = await discovery.json();
      expect(metadata.issuer).toBe(origin);
      expect(metadata.code_challenge_methods_supported).toContain('S256');
      expect(metadata.token_endpoint_auth_methods_supported).toContain('private_key_jwt');
      const protectedMetadata = await broker.fetch(new Request(`${origin}/.well-known/oauth-protected-resource/mcp`), bindings, ctx);
      const protectedResource = await protectedMetadata.json();
      expect(protectedResource.resource).toBe(`${origin}/mcp`);
      expect(protectedResource.authorization_servers).toContain(origin);
      const challengeResponse = await broker.fetch(new Request(`${origin}/mcp`), bindings, ctx);
      expect(challengeResponse.status).toBe(401);
      expect(challengeResponse.headers.get('www-authenticate')).toContain('resource_metadata=');
      const verifier = 'z'.repeat(64);
      const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const params = new URLSearchParams({ client_id: client, redirect_uri: 'https://client.example/callback', response_type: 'code', scope: 'offline_access', resource: `${origin}/mcp`, code_challenge: challenge, code_challenge_method: 'S256', state: 'synthetic-state' });
      const wrongResource = new URLSearchParams(params);
      wrongResource.set('resource', `${origin}/another-resource`);
      const rejected = await broker.fetch(new Request(`${origin}/authorize?${wrongResource}`), bindings, ctx);
      expect(rejected.status).not.toBe(200);
      const consent = await broker.fetch(new Request(`${origin}/authorize?${params}`), bindings, ctx);
      expect(consent.status).toBe(200);
      const html = await consent.text();
      const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
      expect(handle).toBeTruthy();
      const cookie = consent.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
      const approved = await broker.fetch(new Request(`${origin}/authorize`, { method: 'POST', headers: { cookie }, body: new URLSearchParams({ handle, decision: 'approve' }) }), bindings, ctx);
      expect(approved.status).toBe(302);
      const upstream = new URL(approved.headers.get('location'));
      const callback = new URL(`${origin}/oauth/callback`);
      callback.searchParams.set('state', upstream.searchParams.get('state'));
      callback.searchParams.set('code', 'synthetic-upstream-code');
      const callbackCookie = approved.headers.getSetCookie().map((entry) => entry.split(';')[0]).join('; ');
      const completed = await broker.fetch(new Request(callback, { headers: { cookie: callbackCookie } }), bindings, ctx);
      expect(completed.status).toBe(302);
      const redirect = new URL(completed.headers.get('location'));
      expect(redirect.searchParams.get('state')).toBe('synthetic-state');
      const signed = async () => assertion(keys.privateKey, crypto.randomUUID(), client, origin);
      const tokenForm = new URLSearchParams({ grant_type: 'authorization_code', code: redirect.searchParams.get('code'), redirect_uri: 'https://client.example/callback', code_verifier: verifier, resource: `${origin}/mcp`, client_id: client, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await signed() });
      const wrongTokenResource = new URLSearchParams(tokenForm);
      wrongTokenResource.set('resource', `${origin}/another-resource`);
      const wrongTokenExchange = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: wrongTokenResource }), bindings, ctx);
      expect(wrongTokenExchange.status).not.toBe(200);
      expect((await wrongTokenExchange.json()).error).toBe('invalid_target');
      tokenForm.set('client_assertion', await signed());
      const exchange = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: tokenForm }), bindings, ctx);
      const tokens = await exchange.json();
      expect(exchange.status, JSON.stringify(tokens)).toBe(200);
      expect(tokens.refresh_token).toBeTruthy();
      const foreignRevoke = new URLSearchParams({ token: tokens.refresh_token, client_id: otherClient, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(otherKeys.privateKey, crypto.randomUUID(), otherClient, origin) });
      expect((await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: foreignRevoke }), bindings, ctx)).status).toBe(200);
      const forgedRevoke = new URLSearchParams({ token: tokens.refresh_token, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(otherKeys.privateKey, crypto.randomUUID(), client, origin) });
      const forged = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: forgedRevoke }), bindings, ctx);
      expect((await forged.json()).error).toBe('invalid_client');
      const refreshForm = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, resource: `${origin}/mcp`, client_id: client, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await signed() });
      const wrongRefreshResource = new URLSearchParams(refreshForm);
      wrongRefreshResource.set('resource', `${origin}/another-resource`);
      const wrongRefresh = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: wrongRefreshResource }), bindings, ctx);
      expect(wrongRefresh.status).not.toBe(200);
      expect((await wrongRefresh.json()).error).toBe('invalid_target');
      expect(upstreamRefreshes).toBe(0);
      refreshForm.set('client_assertion', await signed());
      const refresh = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: refreshForm }), bindings, ctx);
      const rotated = await refresh.json();
      expect(refresh.status, JSON.stringify(rotated)).toBe(200);
      expect(upstreamRefreshes).toBe(1);
      const replay = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: refreshForm }), bindings, ctx);
      expect((await replay.json()).error).toBe('invalid_client');
      // Client identity is taken from the assertion only after provider verification.
      const revokeForm = new URLSearchParams({ token: rotated.refresh_token, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await signed() });
      const revoke = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: revokeForm }), bindings, ctx);
      expect(revoke.status).toBe(200);
      const after = await broker.fetch(new Request(`${origin}/mcp`, { headers: { authorization: `Bearer ${rotated.access_token}` } }), bindings, ctx);
      expect(after.status).toBe(401);
      const afterRevokeForm = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rotated.refresh_token, client_id: client, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await signed() });
      const afterRevoke = await broker.fetch(new Request(`${origin}/oauth/token`, { method: 'POST', body: afterRevokeForm }), bindings, ctx);
      expect(afterRevoke.status).not.toBe(200);
      expect(upstreamRefreshes).toBe(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('enables client metadata only on the guarded local broker with replay protection', async () => {
    const localOrigin = 'http://127.0.0.1:18791';
    const localClient = `https://client.example/${crypto.randomUUID()}`;
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    const bindings = { OAUTH_KV: env.OAUTH_KV, BROKER_ENABLED: 'true', BROKER_ORIGIN: localOrigin, SUPABASE_URL: 'http://127.0.0.1:55421', SUPABASE_OAUTH_CLIENT_ID: 'synthetic-client', SUPABASE_ANON_KEY: 'synthetic-key', SESSION_ENCRYPTION_KEY: encode(new Uint8Array(32)), GRANT_COORDINATORS: env.GRANTS, ASSERTION_REPLAY: env.REPLAY, COORDINATED_LOCAL_TEST: 'true', LOCAL_ASSERTION_REPLAY_TEST: 'true', LOCAL_CIMD_TEST: 'true' };
    const context = { waitUntil() {} };
    vi.stubGlobal('fetch', async () => Response.json({ client_id: localClient, client_name: 'Synthetic test', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_signing_alg: 'ES256', jwks: { keys: [jwk] } }));
    try {
      const discovery = await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), bindings, context);
      expect((await discovery.json()).client_id_metadata_document_supported).toBe(true);
      const signed = await assertion(keys.privateKey, crypto.randomUUID(), localClient, localOrigin);
      const form = new URLSearchParams({ grant_type: 'authorization_code', code: 'synthetic-invalid-code', client_id: localClient, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: signed });
      const attempt = async () => (await broker.fetch(new Request(`${localOrigin}/oauth/token`, { method: 'POST', body: form }), bindings, context)).json();
      const results = await Promise.all(Array.from({ length: 20 }, attempt));
      expect(results.filter((result) => result.error === 'invalid_grant')).toHaveLength(1);
      expect(results.filter((result) => result.error === 'invalid_client')).toHaveLength(19);
      expect((await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), { ...bindings, LOCAL_ASSERTION_REPLAY_TEST: 'false' }, context)).status).toBe(503);
      expect((await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), { ...bindings, ASSERTION_REPLAY: undefined }, context)).status).toBe(503);
      expect((await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), { ...bindings, SESSION_ENCRYPTION_KEY: 'invalid' }, context)).status).toBe(503);
      expect((await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), { ...bindings, OAUTH_KV: undefined }, context)).status).toBe(503);
      expect((await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), { ...bindings, BROKER_ENABLED: 'false' }, context)).status).toBe(503);
      expect((await broker.fetch(new Request(`${localOrigin}/.well-known/oauth-authorization-server`), { ...bindings, SUPABASE_URL: 'https://hosted.example' }, context)).status).toBe(503);
    } finally { vi.unstubAllGlobals(); }
  });
  it('verifies signatures before claiming and accepts a signed assertion only once', async () => {
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const otherKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', keys.publicKey);
    const api = { fetch: (_req, _env, ctx) => Response.json({ owner: ctx.props.owner }) };
    // This handler skips UI consent exclusively in the isolated test fixture.
    const authorize = { async fetch(req, authEnv) {
      const request = await authEnv.OAUTH_PROVIDER.parseAuthRequest(req);
      const result = await authEnv.OAUTH_PROVIDER.completeAuthorization({ request, userId: 'synthetic-user', scope: request.scope, metadata: {}, props: { owner: 'synthetic-user' }, revokeExistingGrants: false });
      return Response.redirect(result.redirectTo, 302);
    } };
    const provider = new OAuthProvider({ apiRoute: '/mcp', apiHandler: api, defaultHandler: authorize, authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token', clientIdMetadataDocumentEnabled: true, resourceMetadata: { resource: `${issuer}/mcp` }, scopesSupported: ['offline_access'] });
    const kv = assertionReplayKv(env.OAUTH_KV, (key) => env.REPLAY.getByName(key).claim());
    const jti = crypto.randomUUID();
    vi.stubGlobal('fetch', async () => Response.json({ client_id: clientId, client_name: 'Synthetic test', redirect_uris: ['https://client.example/callback'], token_endpoint_auth_method: 'private_key_jwt', token_endpoint_auth_signing_alg: 'ES256', jwks: { keys: [jwk] } }));
    const verify = async (token) => {
      const form = new URLSearchParams({ grant_type: 'authorization_code', code: 'synthetic-invalid-code', client_id: clientId, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: token });
      const response = await provider.fetch(new Request(`${issuer}/oauth/token`, { method: 'POST', body: form }), { OAUTH_KV: kv }, { waitUntil() {} });
      return response.json();
    };
    try {
      const invalid = await verify(await assertion(otherKeys.privateKey, jti));
      expect(invalid.error).toBe('invalid_client');
      const valid = await assertion(keys.privateKey, jti);
      const results = await Promise.all(Array.from({ length: 20 }, () => verify(valid)));
      expect(results.filter((result) => result.error === 'invalid_grant')).toHaveLength(1);
      expect(results.filter((result) => result.error === 'invalid_client')).toHaveLength(19);

      const verifier = 'a'.repeat(64);
      const challenge = encode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
      const query = new URLSearchParams({ client_id: clientId, redirect_uri: 'https://client.example/callback', response_type: 'code', scope: 'offline_access', resource: `${issuer}/mcp`, code_challenge: challenge, code_challenge_method: 'S256' });
      const auth = await provider.fetch(new Request(`${issuer}/authorize?${query}`), { OAUTH_KV: kv }, { waitUntil() {} });
      expect(auth.status).toBe(302);
      const code = new URL(auth.headers.get('location')).searchParams.get('code');
      const tokenForm = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'https://client.example/callback', code_verifier: verifier, client_id: clientId, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(keys.privateKey, crypto.randomUUID()) });
      const tokenResponse = await provider.fetch(new Request(`${issuer}/oauth/token`, { method: 'POST', body: tokenForm }), { OAUTH_KV: kv }, { waitUntil() {} });
      const tokens = await tokenResponse.json();
      expect(tokenResponse.status, JSON.stringify(tokens)).toBe(200);
      expect(tokens.access_token).toBeTruthy();
      expect(tokens.refresh_token).toBeTruthy();
      const resource = await provider.fetch(new Request(`${issuer}/mcp`, { headers: { authorization: `Bearer ${tokens.access_token}` } }), { OAUTH_KV: kv }, { waitUntil() {} });
      expect(await resource.json()).toEqual({ owner: 'synthetic-user' });
      const refreshAssertion = await assertion(keys.privateKey, crypto.randomUUID());
      const refreshForm = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: clientId, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: refreshAssertion });
      const refresh = await provider.fetch(new Request(`${issuer}/oauth/token`, { method: 'POST', body: refreshForm }), { OAUTH_KV: kv }, { waitUntil() {} });
      const refreshed = await refresh.json();
      expect(refresh.status, JSON.stringify(refreshed)).toBe(200);
      expect(refreshed.access_token).toBeTruthy();
      const replay = await provider.fetch(new Request(`${issuer}/oauth/token`, { method: 'POST', body: refreshForm }), { OAUTH_KV: kv }, { waitUntil() {} });
      expect((await replay.json()).error).toBe('invalid_client');
      const revokeForm = new URLSearchParams({ token: refreshed.refresh_token, client_id: clientId, client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer', client_assertion: await assertion(keys.privateKey, crypto.randomUUID()) });
      const revoke = await provider.fetch(new Request(`${issuer}/oauth/token`, { method: 'POST', body: revokeForm }), { OAUTH_KV: kv }, { waitUntil() {} });
      expect(revoke.status).toBe(200);
      const revokedResource = await provider.fetch(new Request(`${issuer}/mcp`, { headers: { authorization: `Bearer ${refreshed.access_token}` } }), { OAUTH_KV: kv }, { waitUntil() {} });
      expect(revokedResource.status).toBe(401);
    } finally { vi.unstubAllGlobals(); }
  });
});
