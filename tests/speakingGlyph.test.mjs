import test from 'node:test';
import assert from 'node:assert/strict';
import { ICON_ART } from '../components/iconArt.ts';

// SpeakingPulse's SpeakingGlyph is half the set's icon and half its own drawing.
//
// The cone is the set's `volumeOn`, taken at load: it is the part that never
// moves, so it is the part that has to match every other speaker in the app
// exactly. The two waves are drawn in the component as arcs, because Solar draws
// them as filled wedges and a filled wedge can only be faded — at sixteen points
// that fade was not visible, which is what this pass was about.
//
// So what the component needs from the set is: the glyph splits into paths, and
// the first of them is the cone. The component cannot be imported here (it
// reaches for react-native), so the split is repeated.
const parts = (name) => [...ICON_ART[name].body.matchAll(/d="([^"]+)"/g)].map((m) => m[1]);
const startX = (d) => Number(/^M\s*([\d.]+)/.exec(d)[1]);

test('the speaker splits into a cone and two waves', () => {
  assert.equal(parts('volumeOn').length, 3);
  for (const d of parts('volumeOn')) assert.ok(d.length > 0);
});

test('the cone is the first path, which is the one the glyph takes', () => {
  const [cone, ...waves] = parts('volumeOn');
  // Solar draws each path from its top-left, and the cone is the body: it starts
  // left of both waves. If this ever stopped being true, the glyph would be
  // drawing a wave where it means to draw the speaker.
  for (const wave of waves) assert.ok(startX(cone) < startX(wave));
});

test('the cone is filled, so it is a solid shape and not an outline', () => {
  // The pass that unified these buttons: three different speakers, two of them
  // stroked, became this one filled cone.
  assert.ok(ICON_ART.volumeOn.body.includes('fill="currentColor"'));
  assert.ok(!ICON_ART.volumeOn.body.includes('stroke='));
});
