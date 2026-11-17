import test from 'node:test';
import assert from 'node:assert/strict';
import { AUDIBLE_VOLUME, shouldOfferSoundHint, volumeMoved } from '../lib/speech.ts';

const at = (volume, dismissed = false) => shouldOfferSoundHint({ dismissed, volume });

test('the note is for the person whose volume is actually down', () => {
  assert.equal(at(0), true);
  assert.equal(at(0.1), true);
  // The threshold itself counts as too quiet: at a fifth of the way up a phone
  // at arm's length still says nothing useful.
  assert.equal(at(AUDIBLE_VOLUME), true);
  assert.equal(at(AUDIBLE_VOLUME + 0.01), false);
  assert.equal(at(0.5), false);
  assert.equal(at(1), false);
});

test('nothing is claimed where the volume cannot be read', () => {
  // A build without the native module. The note used to be shown to everyone on
  // the strength of exactly this much knowledge; now it stays away.
  assert.equal(at(null), false);
});

test('once it has been put away it stays away, however quiet the phone is', () => {
  assert.equal(at(0, true), false);
  assert.equal(at(null, true), false);
  assert.equal(at(1, true), false);
});

test('the sign leaves the moment the key is touched, either way', () => {
  // Up is the obvious answer…
  assert.equal(volumeMoved(0.125, 0.1875), true);
  // …and down is an answer too: the phone is quiet on purpose.
  assert.equal(volumeMoved(0.125, 0.0625), true);
  // One notch is a sixteenth, so a notch always counts, even well under the
  // threshold the sign went up at.
  assert.equal(volumeMoved(0, 1 / 16), true);
});

test('the reading the watcher gets on subscribing is not a press', () => {
  assert.equal(volumeMoved(0.125, 0.125), false);
  // Float noise from the bridge is not a press either.
  assert.equal(volumeMoved(0.125, 0.1250001), false);
});

test('a sign with no reading behind it cannot be stood up, so it gives way', () => {
  assert.equal(volumeMoved(null, 0.5), true);
});
