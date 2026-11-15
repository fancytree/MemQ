import { isDirectUserSession, verifyDirectUser } from './directSession.ts';
function token(claims: unknown) {
  const payload = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `Bearer test.${payload}.signature`;
}
Deno.test('allows direct sessions but denies OAuth and malformed claims after authentication', () => {
  if (!isDirectUserSession(token({ sub: 'user', role: 'authenticated' }))) throw new Error('Direct session denied');
  if (isDirectUserSession(token({ sub: 'user', client_id: 'client-id' }))) throw new Error('OAuth session allowed');
  if (isDirectUserSession(token({ client_id: '' }))) throw new Error('Unexpected client identifier allowed');
  if (isDirectUserSession('Bearer malformed')) throw new Error('Malformed session allowed');
  if (isDirectUserSession(token([]))) throw new Error('Invalid claims allowed');
});

Deno.test('requires a verified user before allowing a direct session', async () => {
  const direct = token({ sub: 'user' });
  if (!await verifyDirectUser(direct, async () => ({ data: { user: { id: 'user' } }, error: null }))) throw new Error('Verified user denied');
  if (await verifyDirectUser(direct, async () => ({ data: { user: null }, error: null }))) throw new Error('Missing user allowed');
  if (await verifyDirectUser(direct, async () => ({ data: { user: { id: 'user' } }, error: new Error('invalid') }))) throw new Error('Unverified user allowed');
  if (await verifyDirectUser(token({ client_id: 'app' }), async () => ({ data: { user: { id: 'user' } }, error: null }))) throw new Error('OAuth user allowed');
  if (await verifyDirectUser(direct, () => Promise.reject(new Error('Auth unavailable')))) throw new Error('Auth failure allowed');
});
