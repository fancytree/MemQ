import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const id = process.env.REPLAY_TEST_ID || randomUUID();
async function claim(id) {
  const response = await fetch('http://127.0.0.1:18792', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
  assert.equal(response.status, 200);
  return (await response.json()).claimed;
}
if (process.argv[2] === 'prepare') {
  assert.equal(await claim(id), true);
  console.log('Replay restart prepared');
  process.exit(0);
}
if (process.argv[2] === 'verify') {
  assert.equal(await claim(id), false);
  console.log('Replay restart verified');
  process.exit(0);
}
const results = await Promise.all(Array.from({ length: 20 }, () => claim(id)));
assert.equal(results.filter(Boolean).length, 1);
assert.equal(await claim(id), false);
assert.equal(await claim(randomUUID()), true);
console.log('Local assertion replay coordination passed');
