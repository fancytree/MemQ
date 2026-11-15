/** Server-side Supabase OAuth credentials. Never return these values to an MCP client. */
export interface UpstreamSession {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
export interface UpstreamConfig {
  supabaseUrl: string;
  publicKey: string;
  clientId: string;
  redirectUri: string;
}
export type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export class UpstreamAuthError extends Error {
  constructor(readonly kind: 'invalid_grant' | 'temporarily_unavailable') {
    super(kind);
  }
}

function endpoint(base: string, path: string): URL {
  const root = new URL(base);
  const localHttp = root.protocol === 'http:' && ['localhost', '127.0.0.1', 'kong'].includes(root.hostname);
  if ((root.protocol !== 'https:' && !localHttp) || root.username || root.password) {
    throw new Error('Invalid Supabase URL');
  }
  return new URL(path, root.origin);
}

async function getJson(response: Response): Promise<unknown> {
  // Supabase Auth responses should be small; reject oversized or unexpected bodies.
  const length = response.headers.get('content-length');
  if (length && Number(length) > 65536) throw new UpstreamAuthError('temporarily_unavailable');
  if (!response.body) throw new UpstreamAuthError('temporarily_unavailable');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) {
        await reader.cancel();
        throw new UpstreamAuthError('temporarily_unavailable');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw new UpstreamAuthError('temporarily_unavailable'); }
}
function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** Exchange or rotate an upstream credential, then verify its user via Supabase Auth. */
export async function exchangeUpstream(
  config: UpstreamConfig,
  grant: { code: string; verifier: string } | { refreshToken: string; expectedUserId: string },
  fetcher: Fetch = fetch,
  now: () => number = Date.now,
): Promise<UpstreamSession> {
  const params = new URLSearchParams({ client_id: config.clientId });
  if ('code' in grant) {
    params.set('grant_type', 'authorization_code');
    params.set('code', grant.code);
    params.set('code_verifier', grant.verifier);
    params.set('redirect_uri', config.redirectUri);
  } else {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', grant.refreshToken);
  }
  let response: Response;
  try {
    response = await fetcher(endpoint(config.supabaseUrl, '/auth/v1/oauth/token'), {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', apikey: config.publicKey },
      body: params, redirect: 'manual',
    });
  } catch (error) { console.error(JSON.stringify({ event: 'upstream_token_fetch_failed', type: error instanceof Error ? error.name : 'unknown' })); throw new UpstreamAuthError('temporarily_unavailable'); }
  if (!response.ok) {
    // Only treat an explicit OAuth invalid_grant as revocation. Other 4xx responses
    // can be configuration errors and should not destroy an existing grant.
    const payload = object(await getJson(response));
    console.error(JSON.stringify({ event: 'upstream_token_rejected', status: response.status, error: payload?.error === 'invalid_grant' ? 'invalid_grant' : 'other' }));
    throw new UpstreamAuthError(payload?.error === 'invalid_grant' ? 'invalid_grant' : 'temporarily_unavailable');
  }
  const body = object(await getJson(response));
  if (!body || typeof body.access_token !== 'string' || !body.access_token || typeof body.refresh_token !== 'string' || !body.refresh_token ||
      typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) {
    throw new UpstreamAuthError('temporarily_unavailable');
  }
  let userResponse: Response;
  try {
    userResponse = await fetcher(endpoint(config.supabaseUrl, '/auth/v1/user'), {
      headers: { apikey: config.publicKey, authorization: `Bearer ${body.access_token}` }, redirect: 'manual',
    });
  } catch { console.error('upstream_user_fetch_failed'); throw new UpstreamAuthError('temporarily_unavailable'); }
  if (!userResponse.ok) throw new UpstreamAuthError('temporarily_unavailable');
  const user = object(await getJson(userResponse));
  if (!user || typeof user.id !== 'string' || !user.id) throw new UpstreamAuthError('temporarily_unavailable');
  if ('expectedUserId' in grant && user.id !== grant.expectedUserId) throw new UpstreamAuthError('invalid_grant');
  return { userId: user.id, accessToken: body.access_token, refreshToken: body.refresh_token, expiresAt: now() + body.expires_in * 1000 };
}
