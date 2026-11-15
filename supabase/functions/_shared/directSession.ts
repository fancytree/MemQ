/**
 * Classify a bearer JWT *after* Supabase Auth has validated it with getUser().
 * OAuth Server access tokens carry client_id; direct app sessions do not.
 * This is a deny-only control, not signature verification or authentication.
 */
export function isDirectUserSession(authorization: string): boolean {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
  if (!match) return false;
  const parts = match[1].split('.');
  if (parts.length !== 3) return false;
  try {
    const raw = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(raw.padEnd(Math.ceil(raw.length / 4) * 4, '=')), (char) => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return false;
    const clientId = (claims as Record<string, unknown>).client_id;
    return clientId === undefined || clientId === null;
  } catch {
    return false;
  }
}

/** Verify the bearer token with Auth before using its claims as a deny-only filter. */
export async function verifyDirectUser(
  authorization: string,
  getUser: () => Promise<{ data: { user: unknown }; error: unknown }>,
): Promise<boolean> {
  try {
    const { data, error } = await getUser();
    return !error && !!data.user && isDirectUserSession(authorization);
  } catch {
    return false;
  }
}
