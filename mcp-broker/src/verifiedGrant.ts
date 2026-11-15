/**
 * The provider must produce these props from its authenticated token exchange
 * callback; never construct them by parsing an unverified bearer token.
 */
export interface VerifiedGrant { owner: string; grant: string }

export function verifiedGrant(auth: { userId?: string } | undefined, props: unknown): VerifiedGrant | null {
  if (!auth?.userId || !props || typeof props !== 'object') return null;
  const data = props as Record<string, unknown>;
  if (data.kind !== 'memq-coordinated-grant-v1' || data.owner !== auth.userId ||
      typeof data.grant !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.grant)) return null;
  return { owner: auth.userId, grant: data.grant };
}
