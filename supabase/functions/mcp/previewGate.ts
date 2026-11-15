/** The Supabase OAuth prototype exposes a bearer token to Auth APIs; local tests only. */
export function isLocalPreviewEnabled(flag: string | undefined, supabaseUrl: string | undefined): boolean {
  if (flag !== 'true' || !supabaseUrl) return false;
  try {
    const url = new URL(supabaseUrl);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', 'kong', 'host.docker.internal'].includes(url.hostname);
  } catch {
    return false;
  }
}
