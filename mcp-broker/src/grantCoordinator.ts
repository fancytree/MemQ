import { DurableObject } from 'cloudflare:workers';
import { abandonRefresh, beginRefresh, finishRefresh, pendingExpired, permitsRequest, requireReconnect, revokeGrant, type GrantState } from './grantState.js';

/**
 * Prototype only: callers must encrypt and authenticate sessions before RPC.
 * This object is not bound to the broker until every OAuth path is coordinated.
 */
type RecordValue = { state: GrantState; sealedSession: string | null; clientId?: string; pendingExpiresAt?: number; grantCleanupAt?: number; refreshBounds?: { expires: number; retained: number } };
export class GrantCoordinator extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS grant_state (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pending_revocations (digest TEXT PRIMARY KEY, owner TEXT NOT NULL, client TEXT NOT NULL, expires INTEGER NOT NULL)');
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS issued_tokens (digest TEXT PRIMARY KEY, expires INTEGER NOT NULL, retained INTEGER NOT NULL)');
    const columns = this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(issued_tokens)').toArray();
    if (!columns.some(column => column.name === 'retained')) this.ctx.storage.sql.exec('ALTER TABLE issued_tokens ADD COLUMN retained INTEGER NOT NULL DEFAULT 0');
  }

  private read(): RecordValue | null {
    const rows = this.ctx.storage.sql.exec<{ value: string }>('SELECT value FROM grant_state WHERE id = 1').toArray();
    return rows.length ? JSON.parse(rows[0].value) as RecordValue : null;
  }

  private write(record: RecordValue): void {
    this.ctx.storage.sql.exec('INSERT INTO grant_state (id, value) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET value = excluded.value', JSON.stringify(record));
  }

  // Callers must authenticate and bind the grant identity before invoking RPC.
  async initialize(owner: string, sealedSession: string, clientId?: string, pending = false): Promise<boolean> {
    if (!owner || !sealedSession || this.read() || (clientId !== undefined && (!clientId || clientId.length > 2048)) || (pending && !clientId)) return false;
    const pendingExpiresAt = pending ? Date.now() + 10 * 60_000 : undefined;
    this.write({ state: { status: pending ? 'pending' : 'active', owner, generation: 0 }, sealedSession, clientId, pendingExpiresAt });
    if (pendingExpiresAt) {
      try { await this.ctx.storage.setAlarm(pendingExpiresAt); }
      catch { this.revoke(owner); return false; }
    }
    return true;
  }

  /** Claim a preinitialized authorization code at most once. */
  claimAuthorization(owner: string, clientId: string): boolean {
    const record = this.read();
    if (!record || record.state.status !== 'pending' || record.state.owner !== owner || record.clientId !== clientId) return false;
    if (pendingExpired(record.state, record.pendingExpiresAt, Date.now())) { this.revoke(owner); return false; }
    this.write({ ...record, state: { status: 'active', owner, generation: record.state.generation } });
    return true;
  }

  async alarm(): Promise<void> {
    const record = this.read();
    if (!record || record.state.status === 'revoked') return;
    const deadline = record.state.status === 'pending' ? record.pendingExpiresAt : (record.grantCleanupAt ?? record.pendingExpiresAt);
    if (typeof deadline !== 'number' || !Number.isFinite(deadline) || deadline <= Date.now()) {
      this.revoke(record.state.owner);
      return;
    }
    await this.ctx.storage.setAlarm(deadline);
  }

  /** Record only hashes of tokens just issued by the verified provider. */
  async registerIssuedTokens(owner: string, tokens: { digest: string; expires: number; retained: number; kind: 'access' | 'refresh' }[]): Promise<boolean> {
    const record = this.read();
    const now = Date.now();
    if (!record || !record.clientId || !permitsRequest(record.state, owner) || tokens.length < 1 || tokens.length > 2 ||
        tokens[0].kind !== 'access' || (tokens.length === 2 && tokens[1].kind !== 'refresh') ||
        tokens.some(token => !/^[a-f0-9]{64}$/.test(token.digest) || !Number.isSafeInteger(token.expires) || !Number.isSafeInteger(token.retained) || token.expires <= now || token.retained < token.expires || token.retained > now + 31 * 86400_000) ||
        new Set(tokens.map(token => token.digest)).size !== tokens.length) return false;
    const refresh = tokens[1];
    const bounds = refresh && (record.refreshBounds || { expires: refresh.expires, retained: refresh.retained });
    if (bounds && (bounds.expires <= now || bounds.retained < bounds.expires)) return false;
    const grantCleanupAt = Math.max(record.grantCleanupAt || 0, tokens[0].retained, bounds?.retained || 0);
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM issued_tokens WHERE retained <= ?', now);
      if (!refresh || !bounds) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO issued_tokens (digest, expires, retained) VALUES (?, ?, ?)', tokens[0].digest, tokens[0].expires, tokens[0].retained);
      else {
        this.ctx.storage.sql.exec('INSERT OR REPLACE INTO issued_tokens (digest, expires, retained) VALUES (?, ?, ?), (?, ?, ?)', tokens[0].digest, tokens[0].expires, tokens[0].retained, refresh.digest, bounds.expires, bounds.retained);
      }
      this.write({ ...record, pendingExpiresAt: undefined, grantCleanupAt, ...(bounds ? { refreshBounds: bounds } : {}) });
    });
    try { await this.ctx.storage.setAlarm(grantCleanupAt); }
    catch { this.revoke(owner); return false; }
    return true;
  }

  /** Check only a hash, bound to the verified owner and client. */
  hasIssuedToken(owner: string, client: string, digest: string): boolean {
    const record = this.read();
    if (!record || record.state.owner !== owner || record.clientId !== client || !/^[a-f0-9]{64}$/.test(digest)) return false;
    const rows = this.ctx.storage.sql.exec<{ expires: number; retained: number }>('SELECT expires, retained FROM issued_tokens WHERE digest = ?', digest).toArray();
    if (!rows.length || rows[0].retained <= Date.now()) return false;
    // The exact provider issue time is not exposed. Fail closed inside the
    // interval where the token may or may not have expired.
    if (rows[0].expires <= Date.now()) throw new Error('Token expiry uncertain');
    return true;
  }

  allows(owner: string): boolean {
    const record = this.read();
    return record !== null && permitsRequest(record.state, owner);
  }

  /** Internal RPC only; the calling Worker must first verify the bearer token. */
  sessionForRequest(owner: string): string | null {
    const record = this.read();
    return record && permitsRequest(record.state, owner) ? record.sealedSession : null;
  }

  /** Store only a token hash, after the Worker has matched the provider record. */
  prepareRevocation(owner: string, digest: string, client: string): boolean {
    const record = this.read();
    if (!record || record.state.owner !== owner || !/^[a-f0-9]{64}$/.test(digest) || !client || client.length > 2048) return false;
    const now = Date.now();
    this.ctx.storage.sql.exec('DELETE FROM pending_revocations WHERE expires <= ?', now);
    this.ctx.storage.sql.exec('INSERT OR IGNORE INTO pending_revocations (digest, owner, client, expires) VALUES (?, ?, ?, ?)', digest, owner, client, now + 30 * 86400_000);
    return this.hasPreparedRevocation(owner, digest, client);
  }

  hasPreparedRevocation(owner: string, digest: string, client: string): boolean {
    const record = this.read();
    if (!record || record.state.owner !== owner) return false;
    return this.ctx.storage.sql.exec('SELECT digest FROM pending_revocations WHERE digest = ? AND owner = ? AND client = ? AND expires > ?', digest, owner, client, Date.now()).toArray().length === 1;
  }

  startRefresh(owner: string, operation: string): string | null {
    const record = this.read();
    const next = record && beginRefresh(record.state, owner, operation);
    if (!next || !record?.sealedSession) return null;
    this.write({ ...record, state: next });
    return record.sealedSession;
  }

  completeRefresh(owner: string, operation: string, sealedSession: string): boolean {
    const record = this.read();
    const next = record && finishRefresh(record.state, owner, operation);
    if (!next || !sealedSession) return false;
    this.write({ ...record, state: next, sealedSession });
    return true;
  }

  failRefresh(owner: string, operation: string): boolean {
    const record = this.read();
    const next = record && abandonRefresh(record.state, owner, operation);
    if (!next) return false;
    this.write({ ...record, state: next, sealedSession: null });
    return true;
  }

  // This is destructive to the upstream session. The caller must authenticate
  // the owner and require explicit intent to disconnect/reconnect.
  recoverInterruptedRefresh(owner: string): boolean {
    const record = this.read();
    const next = record && requireReconnect(record.state, owner);
    if (!next) return false;
    this.write({ ...record, state: next, sealedSession: null });
    return true;
  }

  revoke(owner: string): boolean {
    const record = this.read();
    const next = record && revokeGrant(record.state, owner);
    if (!next) return false;
    // One atomic transaction prevents token records being removed while the
    // grant is still active, even if the object restarts during revocation.
    this.ctx.storage.transactionSync(() => {
      this.write({ ...record, state: next, sealedSession: null });
      this.ctx.storage.sql.exec('DELETE FROM issued_tokens');
      this.ctx.storage.sql.exec('DELETE FROM pending_revocations');
    });
    return true;
  }
}
