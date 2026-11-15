const unavailable = () => Response.json({ error: 'temporarily_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

/**
 * Experimental local-only adapter for public and client-secret OAuth clients. The provider still
 * authenticates the client. A durable issued-token registry identifies the
 * grant, which is revoked before success is sent. NOT production ready.
 */
function unverifiedAssertionIssuer(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || value.length > 16384) return null;
  try {
    const parts = value.split('.');
    if (parts.length !== 3 || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(payload + '='.repeat((4 - payload.length % 4) % 4)), c => c.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!claims || typeof claims !== 'object') return null;
    const iss = (claims as Record<string, unknown>).iss;
    return typeof iss === 'string' && !!iss && iss.length <= 2048 ? iss : null;
  } catch { return null; }
}
export async function localRevocation(
  request: Request,
  provider: (request: Request) => Promise<Response>,
  revoke: (grant: string, owner: string) => Promise<boolean>,
  wasIssued: (grant: string, owner: string, digest: string, client: string) => Promise<boolean>,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/oauth/token' || request.method !== 'POST') return null;
  if ((request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return null;
  let form: FormData;
  try { form = await request.clone().formData(); } catch { return Response.json({ error: 'invalid_request' }, { status: 400 }); }
  if (!form.has('token')) return null;
  if (form.has('grant_type')) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const tokens = form.getAll('token'), clients = form.getAll('client_id');
  if (tokens.length !== 1 || clients.length > 1 || typeof tokens[0] !== 'string' || (clients.length && typeof clients[0] !== 'string')) return Response.json({ error: 'invalid_request' }, { status: 400 });
  let clientId = clients.length ? String(clients[0]) : '';
  const authorization = request.headers.get('authorization');
  if (authorization) {
    try {
      if (authorization.length > 8192 || !/^Basic\s+\S+$/i.test(authorization)) return unavailable();
      const raw = atob(authorization.replace(/^Basic\s+/i, ''));
      const separator = raw.indexOf(':');
      if (separator < 0) return unavailable();
      clientId = decodeURIComponent(raw.slice(0, separator).replace(/\+/g, ' '));
    } catch { return unavailable(); }
  }
  if (!clientId && form.has('client_assertion')) {
    if (form.getAll('client_assertion').length !== 1) return unavailable();
    // Used only for routing after provider authentication, never as evidence.
    clientId = unverifiedAssertionIssuer(form.get('client_assertion')) || '';
  }
  const token = tokens[0];
  if (!clientId) return unavailable();
  if (token.length > 4096 || clientId.length > 2048) return Response.json({ error: 'invalid_request' }, { status: 400 });
  const parts = token.split(':');
  try {
    // The provider verifies the client before returning. Unknown tokens also
    // return 200, as required by RFC 7009; only registry matches revoke a grant.
    const response = await provider(request);
    if (!response.ok) return response;
    if (parts.length === 3 && /^[A-Za-z0-9_-]{1,128}$/.test(parts[0]) && /^[A-Za-z0-9_-]{1,128}$/.test(parts[1]) && parts[2]) {
      const [owner, grant] = parts;
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
      const id = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
      if (await wasIssued(grant, owner, id, clientId) && !await revoke(grant, owner)) return unavailable();
    }
    return response;
  } catch { return unavailable(); }
}
