import { GrantCoordinator } from '../../src/grantCoordinator.js';
import { coordinatedRefresh } from '../../src/coordinatedRefresh.js';
import { coordinatedSession } from '../../src/coordinatedSession.js';
import { initializeCoordinatedGrant } from '../../src/coordinatedGrant.js';
import { coordinatedExchange } from '../../src/coordinatedExchange.js';
import { openSession } from '../../src/sessionEnvelope.js';
import { AssertionReplay } from '../../src/assertionReplay.js';
export { GrantCoordinator, AssertionReplay };

// Local-only fixture. Never expose this unauthenticated route as a service.
export default {
  async fetch(req: Request, env: { GRANTS: DurableObjectNamespace<GrantCoordinator> }): Promise<Response> {
    const { grant, action, owner, operation, session } = await req.json() as { grant: string; action: string; owner: string; operation?: string; session?: string };
    const stub = env.GRANTS.getByName(grant);
    const key = btoa(String.fromCharCode(...new Uint8Array(32))).replace(/=+$/, '');
    let result: boolean | string | null;
    switch (action) {
      case 'initialize': result = await stub.initialize(owner, session || ''); break;
      case 'initialize-bound': result = await stub.initialize(owner, session || '', operation || ''); break;
      case 'initialize-pending': result = await stub.initialize(owner, session || '', operation || '', true); break;
      case 'claim-authorization': result = await stub.claimAuthorization(owner, operation || ''); break;
      case 'register-issued': result = await stub.registerIssuedTokens(owner, [{ kind: 'access', digest: operation || '', expires: Date.now() + 60000, retained: Date.now() + 61000 }]); break;
      case 'register-short': result = await stub.registerIssuedTokens(owner, [{ kind: 'access', digest: operation || '', expires: Date.now() + 100, retained: Date.now() + 60000 }]); break;
      case 'register-refresh-short': result = await stub.registerIssuedTokens(owner, [{ kind: 'access', digest: 'b'.repeat(64), expires: Date.now() + 60000, retained: Date.now() + 61000 }, { kind: 'refresh', digest: operation || '', expires: Date.now() + 200, retained: Date.now() + 60000 }]); break;
      case 'register-refresh-long': result = await stub.registerIssuedTokens(owner, [{ kind: 'access', digest: 'c'.repeat(64), expires: Date.now() + 60000, retained: Date.now() + 61000 }, { kind: 'refresh', digest: operation || '', expires: Date.now() + 60000, retained: Date.now() + 61000 }]); break;
      case 'has-issued': result = await stub.hasIssuedToken(owner, session || '', operation || ''); break;
      case 'issued-status': try { result = await stub.hasIssuedToken(owner, session || '', operation || ''); } catch { result = 'uncertain'; } break;
      case 'allows': result = await stub.allows(owner); break;
      case 'start': result = await stub.startRefresh(owner, operation || ''); break;
      case 'complete': result = await stub.completeRefresh(owner, operation || '', session || ''); break;
      case 'fail': result = await stub.failRefresh(owner, operation || ''); break;
      case 'recover': result = await stub.recoverInterruptedRefresh(owner); break;
      case 'prepare-revoke': result = await stub.prepareRevocation(owner, operation || '', session || ''); break;
      case 'prepared-revoke': result = await stub.hasPreparedRevocation(owner, operation || '', session || ''); break;
      case 'revoke': result = await stub.revoke(owner); break;
      case 'sealed-init': result = await initializeCoordinatedGrant(stub, key, owner, grant, { userId: owner, accessToken: 'fixture-access', refreshToken: 'fixture-old', expiresAt: 123456 }); break;
      case 'exchange-init': {
        const initial = { userId: owner, accessToken: 'fixture-access', refreshToken: 'fixture-old', expiresAt: 123456 };
        const created = await initializeCoordinatedGrant(stub, key, owner, grant, initial, 'fixture-client', true);
        result = created && !!await coordinatedExchange({ grantType: 'authorization_code', userId: owner, grantId: grant, clientId: 'fixture-client', props: initial }, () => stub, key, async (previous) => previous);
        break;
      }
      case 'exchange-refresh': result = !!await coordinatedExchange({ grantType: 'refresh_token', userId: owner, grantId: grant, props: { kind: 'memq-coordinated-grant-v1', owner, grant } }, () => stub, key, async (previous) => ({ ...previous, refreshToken: 'fixture-new' })); break;
      case 'sealed-refresh': result = await coordinatedRefresh(stub, key, owner, grant, async (previous) => ({ ...previous, refreshToken: 'fixture-new' })); break;
      case 'sealed-slow-refresh': result = await coordinatedRefresh(stub, key, owner, grant, async (previous) => { await new Promise(resolve => setTimeout(resolve, 1000)); return { ...previous, refreshToken: 'fixture-new' }; }); break;
      case 'sealed-request': result = !!await coordinatedSession(stub, key, owner, grant, () => 1000); break;
      case 'sealed-check': {
        const sealed = await stub.startRefresh(owner, 'fixture-check');
        if (!sealed) { result = false; break; }
        const value = await openSession(key, owner, grant, sealed);
        result = value.refreshToken === 'fixture-new' && await stub.completeRefresh(owner, 'fixture-check', sealed);
        break;
      }
      default: return new Response('Invalid action', { status: 400 });
    }
    return Response.json({ result });
  },
};
