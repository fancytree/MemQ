/** Grant-management CORS is opt-in and restricted to one explicitly configured web app origin. */
export function connectionsCors(req: Request, configuredOrigin?: string): Headers | null {
  const requested = req.headers.get('Origin');
  if (!requested || !configuredOrigin) return null;
  try {
    const allowed = new URL(configuredOrigin);
    const local = allowed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(allowed.hostname);
    if ((!local && allowed.protocol !== 'https:') || allowed.origin !== configuredOrigin || requested !== allowed.origin) return null;
    return new Headers({
      'Access-Control-Allow-Origin': allowed.origin,
      'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization',
      'Vary': 'Origin',
    });
  } catch { return null; }
}
