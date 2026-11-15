type Registry = { registerIssuedTokens(owner: string, tokens: { digest: string; expires: number; retained: number; kind: 'access' | 'refresh' }[]): Promise<boolean> };
const unavailable = () => Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

/** Local-only: record provider-issued token hashes before returning them. */
export async function recordIssuedTokens(request: Request, response: Response, resolve: (grant: string) => Registry, requestStartedAt = Date.now()): Promise<Response> {
  if (new URL(request.url).pathname !== '/oauth/token' || request.method !== 'POST' || !response.ok) return response;
  try {
    const payload = await response.clone().json() as Record<string, unknown>;
    if (typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number' || !Number.isSafeInteger(payload.expires_in) || payload.expires_in < 60 || payload.expires_in > 30 * 86400) return unavailable();
    const tokens = [payload.access_token];
    if (payload.refresh_token !== undefined) {
      if (typeof payload.refresh_token !== 'string') return unavailable();
      tokens.push(payload.refresh_token);
    }
    const parts = tokens.map(token => token.split(':'));
    if (parts.some(item => item.length !== 3 || !/^[A-Za-z0-9_-]{1,128}$/.test(item[0]) || !/^[A-Za-z0-9_-]{1,128}$/.test(item[1]) || !item[2]) ||
        parts.some(item => item[0] !== parts[0][0] || item[1] !== parts[0][1])) return unavailable();
    const digests = await Promise.all(tokens.map(async token => {
      const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    }));
    const now = Date.now();
    // Using the request start bounds provider issuance from below, including
    // slow responses. Never recognize a token after its provider expiry.
    const accessExpiry = (Math.floor(requestStartedAt / 1000) + payload.expires_in - 1) * 1000;
    const accessRetained = (Math.floor(now / 1000) + payload.expires_in + 1) * 1000;
    const records = digests.map((digest, index) => ({ digest, kind: index === 0 ? 'access' as const : 'refresh' as const,
      expires: index === 0 ? accessExpiry : (Math.floor(requestStartedAt / 1000) + 30 * 86400 - 1) * 1000,
      retained: index === 0 ? accessRetained : (Math.floor(now / 1000) + 30 * 86400 + 1) * 1000 }));
    const ok = await resolve(parts[0][1]).registerIssuedTokens(parts[0][0], records);
    return ok ? response : unavailable();
  } catch { return unavailable(); }
}
