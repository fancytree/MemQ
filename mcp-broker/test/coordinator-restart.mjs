import assert from 'node:assert/strict';
const id = process.env.COORDINATOR_TEST_GRANT;
if (!id) throw new Error('COORDINATOR_TEST_GRANT is required');
async function call(action, operation, session = 'sealed-after-restart') {
  const response = await fetch('http://127.0.0.1:18789', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant: id, owner: 'alice', action, operation, session }) });
  assert.equal(response.status, 200);
  return (await response.json()).result;
}
if (process.argv[2] === 'prepare') {
  assert.equal(await call('initialize'), true);
  assert.equal(await call('start', 'pending'), 'sealed-after-restart');
  assert.equal(await call('prepare-revoke', 'a'.repeat(64), 'client'), true);
} else if (process.argv[2] === 'verify') {
  assert.equal(await call('prepared-revoke', 'a'.repeat(64), 'client'), true);
  assert.equal(await call('allows'), false);
  assert.equal(await call('start', 'second'), null);
  assert.equal(await call('recover'), true);
  assert.equal(await call('complete', 'pending', 'sealed-rotated'), false);
  assert.equal(await call('allows'), false);
} else throw new Error('Expected prepare or verify');
console.log(`Restart ${process.argv[2]} passed`);
