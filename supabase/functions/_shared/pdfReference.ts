/** Resolve a PDF owned by this user without trusting the caller's URL token. */
export function ownedPdfPath(reference: unknown, supabaseUrl: string, userId: string, publicUrl?: string): string | null {
  if (typeof reference !== 'string' || !reference || reference.length > 8192 || !userId) return null;
  try {
    const source = new URL(reference);
    const root = new URL(supabaseUrl);
    const publicOrigin = publicUrl ? new URL(publicUrl).origin : root.origin;
    if (![root.origin, publicOrigin].includes(source.origin) || source.username || source.password || source.hash) return null;
    const prefixes = ['/storage/v1/object/public/pdfs/', '/storage/v1/object/sign/pdfs/'];
    const prefix = prefixes.find((value) => source.pathname.startsWith(value));
    if (!prefix) return null;
    const path = decodeURIComponent(source.pathname.slice(prefix.length));
    const parts = path.split('/');
    if (parts.length < 2 || parts[0] !== userId || parts.some((part) => !part || part === '.' || part === '..') || /[\\\u0000-\u001f\u007f]/.test(path)) return null;
    return path;
  } catch { return null; }
}

/** Authenticate before signing; never forward the caller's original URL. */
export async function signOwnedPdfReference(
  reference: unknown,
  supabaseUrl: string,
  getUser: () => PromiseLike<{ data: { user: { id: string } | null }; error: unknown }>,
  sign: (path: string) => PromiseLike<{ data: { signedUrl: string } | null; error: unknown }>,
  publicUrl?: string,
): Promise<string | null> {
  const { data: { user }, error } = await getUser();
  const path = user && !error ? ownedPdfPath(reference, supabaseUrl, user.id, publicUrl) : null;
  if (!path) return null;
  const result = await sign(path);
  if (result.error || !result.data?.signedUrl) return null;
  if (!publicUrl) return result.data.signedUrl;
  try {
    const signed = new URL(result.data.signedUrl);
    const configured = new URL(publicUrl);
    if (signed.origin !== new URL(supabaseUrl).origin || configured.username || configured.password ||
        configured.pathname !== '/' || configured.search || configured.hash ||
        !['http:', 'https:'].includes(configured.protocol)) return null;
    return `${configured.origin}${signed.pathname}${signed.search}`;
  } catch { return null; }
}
