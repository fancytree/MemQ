import { DurableObject } from 'cloudflare:workers';

/**
 * Local prototype: one object per hash of (issuer, assertion jti).
 * Call only after signature and claim validation. Used only by the opt-in local experiment.
 */
export class AssertionReplay extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS marker (id INTEGER PRIMARY KEY CHECK (id = 1), expires INTEGER NOT NULL)');
  }

  async claim(): Promise<boolean> {
    const now = Date.now();
    const rows = this.ctx.storage.sql.exec<{ expires: number }>('SELECT expires FROM marker WHERE id = 1').toArray();
    if (rows.length && rows[0].expires > now) return false;
    // Longer than the provider's one-hour assertion maximum and clock skew.
    const expires = now + 2 * 3600_000;
    this.ctx.storage.sql.exec('INSERT INTO marker (id, expires) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET expires = excluded.expires', expires);
    await this.ctx.storage.setAlarm(expires);
    return true;
  }

  async alarm(): Promise<void> {
    const row = this.ctx.storage.sql.exec<{ expires: number }>('SELECT expires FROM marker WHERE id = 1').toArray()[0];
    if (!row) return;
    if (row.expires > Date.now()) {
      await this.ctx.storage.setAlarm(row.expires);
      return;
    }
    this.ctx.storage.sql.exec('DELETE FROM marker WHERE id = 1');
  }
}
