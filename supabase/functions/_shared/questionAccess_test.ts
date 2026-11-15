import { checkQuestionAccess } from './questionAccess.ts';

function token(claims: unknown) {
  return `Bearer test.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
}
function fixture(options: { user?: boolean; owner?: boolean; terms?: number; dbError?: boolean } = {}) {
  const calls: string[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: 'user-a' } }, error: null }) },
    from(table: string) {
      const filters: Record<string, string> = {};
      const query = {
        select() { return query; },
        eq(key: string, value: string) { filters[key] = value; return query; },
        async maybeSingle() {
          calls.push(table);
          const owns = options.owner !== false && filters.id === 'lesson-a' && filters.user_id === 'user-a';
          return { data: owns ? { id: 'lesson-a' } : null, error: options.dbError ? {} : null };
        },
        async in(key: string, ids: string[]) {
          calls.push(table);
          if (key !== 'id' || filters.lesson_id !== 'lesson-a') throw new Error('Query omitted lesson scope');
          return { data: ids.slice(0, options.terms ?? ids.length).map((id) => ({ id, term: 'Actual card', definition: 'Verified content', explanation: null, language_data: null, content_revision: 'revision-a' })), error: options.dbError ? {} : null };
        },
      };
      return query;
    },
  };
  return { client, calls };
}
const direct = token({ sub: 'user-a' });
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
Deno.test('allows a verified direct user only when every card belongs to their lesson', async () => {
  const f = fixture();
  const result = await checkQuestionAccess(f.client, direct, 'lesson-a', ['a', 'b']);
  assert(result.ok && result.terms[0].definition === 'Verified content' && result.terms[0].content_revision === 'revision-a', 'verified card snapshot missing');
  assert(f.calls.join(',') === 'lessons,terms', 'ownership checks not executed');
});
Deno.test('rejects OAuth, unauthenticated callers and malformed or duplicate card IDs', async () => {
  for (const [auth, options, ids, expected] of [
    [token({ client_id: 'oauth-client' }), {}, ['a'], 401],
    [direct, { user: false }, ['a'], 401],
    [direct, {}, ['a', 'a'], 400],
    [direct, {}, [null], 400],
  ] as const) {
    const f = fixture(options);
    const result = await checkQuestionAccess(f.client, auth, 'lesson-a', [...ids]);
    assert(!result.ok && result.status === expected && f.calls.length === 0, 'invalid request reached database');
  }
});
Deno.test('rejects foreign lessons, foreign cards and database errors', async () => {
  for (const options of [{ owner: false }, { terms: 1 }, { dbError: true }]) {
    const f = fixture(options);
    const result = await checkQuestionAccess(f.client, direct, 'lesson-a', ['a', 'b']);
    assert(!result.ok && result.status === 404, 'access should fail closed');
  }
});
