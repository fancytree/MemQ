import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('mascot stops for reduced motion and hidden tabs, then resumes', () => {
  const frames = new Map(), events = new Map(), documentEvents = new Map();
  let nextFrame = 1, onChange, solveCalls = [];
  const media = { matches: false, addEventListener(name, listener) { assert.equal(name, 'change'); onChange = listener; } };
  const art = { dataset: { mascot: 'todayIdle' }, querySelectorAll: () => [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
  const document = {
    hidden: false,
    querySelector: () => art,
    querySelectorAll: () => [],
    addEventListener: (name, listener) => documentEvents.set(name, listener),
    removeEventListener: (name) => documentEvents.delete(name),
    documentElement: { addEventListener() {}, removeEventListener() {} },
  };
  const window = {
    matchMedia: () => media,
    MemQMascot: { CHANNEL_COUNT: 0, CH: {}, createRigState: () => ({}), solveRig: (_state, options) => { solveCalls.push(options.still); return {}; } },
    addEventListener: (name, listener) => events.set(name, listener),
    removeEventListener: (name) => events.delete(name),
    requestAnimationFrame: (callback) => { const id = nextFrame++; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id) => frames.delete(id),
    setTimeout: () => 1, clearTimeout() {},
  };
  runInNewContext(readFileSync(new URL('../preview/memq-website/site.js', import.meta.url), 'utf8'), { window, document, Math, Array, Number, JSON });
  assert.equal(frames.size, 1);
  assert.equal(events.has('pointermove'), true);
  document.hidden = true;
  documentEvents.get('visibilitychange')();
  assert.equal(frames.size, 0);
  document.hidden = false;
  documentEvents.get('visibilitychange')();
  assert.equal(frames.size, 1);
  media.matches = true;
  onChange();
  assert.equal(frames.size, 0);
  assert.equal(events.has('pointermove'), false);
  assert.equal(solveCalls.at(-1), true);
  media.matches = false;
  onChange();
  assert.equal(frames.size, 1);
  assert.equal(events.has('pointermove'), true);
});
