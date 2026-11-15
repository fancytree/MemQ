import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('secondary page anchor scrolling follows the current motion preference', () => {
  const source = readFileSync(new URL('../preview/memq-website/components/load-components.js', import.meta.url), 'utf8');
  let onClick;
  let reduced = false;
  let behavior;
  const anchor = { addEventListener(_event, callback) { onClick = callback; }, getAttribute() { return '#answer'; } };
  const target = { scrollIntoView(options) { behavior = options.behavior; } };
  const document = {
    readyState: 'loading', addEventListener() {},
    querySelectorAll() { return [anchor]; },
    querySelector() { return target; },
  };
  const context = { document, window: { matchMedia() { return { matches: reduced }; } } };
  runInNewContext(source + '\ninitSmoothScrolling();', context);
  onClick.call(anchor, { preventDefault() {} });
  assert.equal(behavior, 'smooth');
  reduced = true;
  onClick.call(anchor, { preventDefault() {} });
  assert.equal(behavior, 'instant');
});
