import { openSession } from './sessionEnvelope.js';
import type { UpstreamSession } from './upstream.js';

/** Call only after validating the bearer token and its subject/grant binding. */
export async function coordinatedSession(
  coordinator: { sessionForRequest(owner: string): Promise<string | null> },
  key: string, owner: string, grant: string, now: () => number = Date.now,
): Promise<UpstreamSession | null> {
  try {
    const sealed = await coordinator.sessionForRequest(owner);
    if (!sealed) return null;
    const session = await openSession(key, owner, grant, sealed);
    return session.expiresAt > now() ? session : null;
  } catch {
    // A missing coordinator, invalid key or corrupt envelope must fail closed.
    return null;
  }
}
