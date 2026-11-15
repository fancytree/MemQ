// Local experiment for workers-oauth-provider 1.2.4 only. Its verifier checks
// the signature before reading this key, then writes "1" after an empty read.
// The read must atomically claim the marker; a normal KV read is not enough.
const prefix = 'client-assertion-jti:';
const marker = /^client-assertion-jti:[a-f0-9]{64}$/;

export function assertionReplayKv(kv: KVNamespace, claim: (key: string) => Promise<boolean>): KVNamespace {
  return new Proxy(kv, {
    get(target, property) {
      if (property === 'get') return async (key: string, ...args: unknown[]) => {
        if (key.startsWith(prefix)) {
          if (!marker.test(key) || args.length) throw new Error('Unexpected assertion replay read');
          return await claim(key) ? null : '1';
        }
        return (target.get as (...args: unknown[]) => unknown).call(target, key, ...args);
      };
      if (property === 'put') return async (key: string, value: unknown, ...args: unknown[]) => {
        if (key.startsWith(prefix)) {
          if (!marker.test(key) || value !== '1' || args.length !== 1) throw new Error('Unexpected assertion replay write');
          return;
        }
        return (target.put as (...args: unknown[]) => unknown).call(target, key, value, ...args);
      };
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
