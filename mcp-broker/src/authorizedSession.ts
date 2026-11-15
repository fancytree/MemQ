import { coordinatedSession } from './coordinatedSession.js';
import { verifiedGrant } from './verifiedGrant.js';
import type { UpstreamSession } from './upstream.js';

/**
 * Internal request adapter. `auth` and `props` must come from the OAuth
 * provider after bearer-token validation, never from request JSON or a parsed
 * token. This is not yet attached to the production-disabled provider.
 */
export async function authorizedSession(
  auth: { userId?: string } | undefined,
  props: unknown,
  resolve: (grant: string) => { sessionForRequest(owner: string): Promise<string | null> },
  key: string,
  now: () => number = Date.now,
): Promise<UpstreamSession | null> {
  const verified = verifiedGrant(auth, props);
  if (!verified) return null;
  try {
    return await coordinatedSession(resolve(verified.grant), key, verified.owner, verified.grant, now);
  } catch {
    return null;
  }
}
