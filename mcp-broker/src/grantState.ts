/**
 * Per-grant transitions for a future strongly consistent coordinator.
 * The caller must load and persist each transition atomically. This module is
 * deliberately not connected to the production-disabled OAuth provider yet.
 */
export type GrantState =
  | { status: 'pending'; owner: string; generation: number }
  | { status: 'active'; owner: string; generation: number }
  | { status: 'refreshing'; owner: string; generation: number; operation: string }
  | { status: 'revoked'; owner: string; generation: number }
  | { status: 'reconnect'; owner: string; generation: number };

export function beginRefresh(state: GrantState, owner: string, operation: string): GrantState | null {
  if (state.status !== 'active' || state.owner !== owner || !operation) return null;
  return { ...state, status: 'refreshing', operation };
}

export function finishRefresh(state: GrantState, owner: string, operation: string): GrantState | null {
  if (state.status !== 'refreshing' || state.owner !== owner || state.operation !== operation) return null;
  return { status: 'active', owner, generation: state.generation + 1 };
}

/** An uncertain upstream outcome must never retry the old refresh credential. */
export function abandonRefresh(state: GrantState, owner: string, operation: string): GrantState | null {
  if (state.status !== 'refreshing' || state.owner !== owner || state.operation !== operation) return null;
  return { status: 'reconnect', owner, generation: state.generation };
}

/** Explicit recovery discards the session even if the interrupted operation ID is lost. */
export function requireReconnect(state: GrantState, owner: string): GrantState | null {
  if (state.owner !== owner || (state.status !== 'refreshing' && state.status !== 'reconnect')) return null;
  return { status: 'reconnect', owner, generation: state.generation };
}

export function revokeGrant(state: GrantState, owner: string): GrantState | null {
  if (state.owner !== owner) return null;
  if (state.status === 'revoked') return state;
  return { status: 'revoked', owner, generation: state.generation };
}

export function permitsRequest(state: GrantState, owner: string): boolean {
  // Refresh may have been interrupted after the upstream rotated credentials.
  // Until it commits, do not allow new operations using a potentially stale session.
  return state.owner === owner && state.status === 'active';
}

export function pendingExpired(state: GrantState, deadline: number | undefined, now: number): boolean {
  return state.status === 'pending' && (typeof deadline !== 'number' || !Number.isFinite(deadline) || deadline <= now);
}
