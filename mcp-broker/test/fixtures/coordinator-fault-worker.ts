import broker, { GrantCoordinator } from '../../src/index.js';
export { GrantCoordinator };

// Local-only fault fixture. Never deploy or connect it to real accounts.
let injected = false;
export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    let isRevocation = false;
    if (request.method === 'POST' && new URL(request.url).pathname === '/oauth/token') {
      try { isRevocation = (await request.clone().formData()).has('token'); } catch { /* provider handles malformed requests */ }
    }
    if (!isRevocation) return broker.fetch(request, env, ctx);
    const namespace = env.GRANT_COORDINATORS;
    const wrapped = { getByName(name: string) {
      const stub = namespace.getByName(name);
      return {
        prepareRevocation: (...args: unknown[]) => stub.prepareRevocation(...args),
        hasPreparedRevocation: (...args: unknown[]) => stub.hasPreparedRevocation(...args),
        hasIssuedToken: (...args: unknown[]) => stub.hasIssuedToken(...args),
        revoke: async (...args: unknown[]) => {
          if (!injected) { injected = true; throw new Error('synthetic coordinator failure'); }
          return stub.revoke(...args);
        },
      };
    } };
    return broker.fetch(request, { ...env, GRANT_COORDINATORS: wrapped }, ctx);
  },
};
