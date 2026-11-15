import { sealSession } from './sessionEnvelope.js';
import type { UpstreamSession } from './upstream.js';

/**
 * The caller must get owner and grant from a verified OAuth exchange, not
 * from client-supplied token text. This helper is not yet wired to a provider.
 */
export async function initializeCoordinatedGrant(
  coordinator: { initialize(owner: string, sealedSession: string, clientId?: string, pending?: boolean): Promise<boolean> },
  key: string, owner: string, grant: string, session: UpstreamSession, clientId?: string, pending = false,
): Promise<boolean> {
  try {
    const envelope = await sealSession(key, owner, grant, session);
    return await coordinator.initialize(owner, envelope, clientId, pending);
  } catch {
    // The caller must not issue a token when sealing or durable storage fails.
    return false;
  }
}
