import { openSession, sealSession } from './sessionEnvelope.js';
import type { UpstreamSession } from './upstream.js';

/** Internal interface only. Callers must authenticate owner and grant first. */
export interface RefreshCoordinator {
  startRefresh(owner: string, operation: string): Promise<string | null>;
  completeRefresh(owner: string, operation: string, sealedSession: string): Promise<boolean>;
  failRefresh(owner: string, operation: string): Promise<boolean>;
}

/**
 * Prototype refresh flow. The actual provider is not wired to this yet.
 * A failed/ambiguous exchange invalidates the stored session; it is never
 * retried using the old refresh token. No upstream credential is returned.
 */
export async function coordinatedRefresh(
  coordinator: RefreshCoordinator, key: string, owner: string, grant: string,
  exchange: (session: UpstreamSession) => Promise<UpstreamSession>,
): Promise<boolean> {
  const operation = crypto.randomUUID();
  const envelope = await coordinator.startRefresh(owner, operation);
  if (!envelope) return false;
  try {
    const previous = await openSession(key, owner, grant, envelope);
    const next = await exchange(previous);
    const sealed = await sealSession(key, owner, grant, next);
    return await coordinator.completeRefresh(owner, operation, sealed);
  } catch {
    // If this write fails, the persisted refreshing state remains fail-closed
    // for further refreshes. Recovery must require an explicit reconnect.
    try { await coordinator.failRefresh(owner, operation); } catch { /* fail closed */ }
    return false;
  }
}
