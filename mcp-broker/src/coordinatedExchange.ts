import { coordinatedRefresh, type RefreshCoordinator } from './coordinatedRefresh.js';
import { verifiedGrant } from './verifiedGrant.js';
import type { UpstreamSession } from './upstream.js';

type Coordinator = RefreshCoordinator & { claimAuthorization(owner: string, clientId: string): Promise<boolean> };
type ExchangeInput = { grantType: string; userId: string; grantId: string; clientId?: string; props: unknown };
type SafeProps = { kind: 'memq-coordinated-grant-v1'; owner: string; grant: string };

/**
 * Adapter for provider-verified exchange metadata. Wired only to the local
 * experiment; every token revocation path must be coordinated before release.
 */
export async function coordinatedExchange(
  input: ExchangeInput, resolve: (grant: string) => Coordinator, key: string,
  refresh: (previous: UpstreamSession) => Promise<UpstreamSession>,
): Promise<{ newProps: SafeProps } | null> {
  const props: SafeProps = { kind: 'memq-coordinated-grant-v1', owner: input.userId, grant: input.grantId };
  if (!verifiedGrant({ userId: input.userId }, props)) return null;
  try {
    const coordinator = resolve(input.grantId);
    if (input.grantType === 'authorization_code') {
      if (!input.clientId || !input.props || typeof input.props !== 'object' || (input.props as { userId?: unknown }).userId !== input.userId) return null;
      const success = await coordinator.claimAuthorization(input.userId, input.clientId);
      return success ? { newProps: props } : null;
    }
    if (input.grantType === 'refresh_token') {
      const bound = verifiedGrant({ userId: input.userId }, input.props);
      if (!bound || bound.grant !== input.grantId) return null;
      const success = await coordinatedRefresh(coordinator, key, input.userId, input.grantId, refresh);
      return success ? { newProps: props } : null;
    }
  } catch { /* fail closed */ }
  return null;
}
