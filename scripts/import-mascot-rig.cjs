/** Import the mascot's rig artwork from the Figma exports in assets/mascot/rig.
 *
 *   node scripts/import-mascot-rig.cjs
 *
 * The exports are the component set on the Figma page "mascot" (node 53:5419), one
 * SVG per part, plus the " default" frame, which is the only place the hands are
 * drawn. They are kept in the repository untouched so this can be re-run when the
 * drawing changes.
 *
 * A rig wants something a flattened frame cannot give it: every part in its own
 * space, with the origin on the point it turns about. So each part's paths are
 * shifted here until its pivot is (0, 0) — a horn's is where it meets the head, the
 * tail tip's is the end of the stroke it caps, a hand's is its middle — and the
 * renderer only ever has to say where that point is and which way it faces.
 *
 * Not everything is imported. The body, the eye whites, the pupils, the round mouth
 * and the tail's curve are drawn by the rig from numbers, because they have to
 * deform: a squashed body must keep an even outline, a tail must bend along its
 * length, and an eyelid has to close. Their measurements are still read from the
 * exports here, so the drawn parts cannot drift from the designed ones.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const SRC = path.join(root, 'assets/mascot/rig');
const OUT = path.join(root, 'components/mascot/rig/art.ts');

const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
const round = (n) => Math.round(n * 1000) / 1000;

/** Every <path> in an export, in drawing order. */
function paths(svg) {
  return [...svg.matchAll(/<path\b([^>]*)\/>/g)].map((m) => {
    const attr = (name) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1])?.[1];
    return {
      id: attr('id'), d: attr('d'),
      fill: attr('fill'), stroke: attr('stroke'),
      width: attr('stroke-width') ? Number(attr('stroke-width')) : undefined,
      cap: attr('stroke-linecap'), join: attr('stroke-linejoin'),
    };
  });
}

/** Path data as absolute commands. Figma writes nothing else, and this refuses
 * anything it does not understand rather than guessing at it. */
function parse(d) {
  const out = [];
  for (const m of d.matchAll(/([MLCHVZ])([^MLCHVZ]*)/g)) {
    const nums = (m[2].match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(Number);
    out.push({ cmd: m[1], nums });
  }
  if (/[a-zASQTsqt]/.test(d.replace(/e-?\d+/g, ''))) {
    throw new Error(`Unsupported path command in: ${d.slice(0, 60)}`);
  }
  return out;
}
function shift(d, dx, dy) {
  return parse(d).map(({ cmd, nums }) => {
    if (cmd === 'Z') return 'Z';
    if (cmd === 'H') return `H${round(nums[0] + dx)}`;
    if (cmd === 'V') return `V${round(nums[0] + dy)}`;
    return cmd + nums.map((n, i) => round(n + (i % 2 === 0 ? dx : dy))).join(' ');
  }).join('');
}
/** A path mirrored left to right about x = 0. */
function mirror(d) {
  return parse(d).map(({ cmd, nums }) => {
    if (cmd === 'Z') return 'Z';
    if (cmd === 'H') return `H${round(-nums[0])}`;
    if (cmd === 'V') return `V${round(nums[0])}`;
    return cmd + nums.map((n, i) => round(i % 2 === 0 ? -n : n)).join(' ');
  }).join('');
}
/** Bounds of a path's own points. Control points are included, which over-reports a
 * curve's box slightly; it is only used to find a middle. */
function bounds(ds) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const d of ds) {
    let x = 0, y = 0;
    for (const { cmd, nums } of parse(d)) {
      if (cmd === 'H') { x = nums[0]; } else if (cmd === 'V') { y = nums[0]; }
      for (let i = 0; i + 1 < nums.length && cmd !== 'H' && cmd !== 'V'; i += 2) {
        x = nums[i]; y = nums[i + 1];
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
      if (cmd === 'H' || cmd === 'V') {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
    }
  }
  return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}
/** An ellipse Figma has written as four curves: its centre and radii. */
function ellipse(d) {
  const b = bounds([d]);
  return { cx: round(b.cx), cy: round(b.cy), rx: round((b.x1 - b.x0) / 2), ry: round((b.y1 - b.y0) / 2) };
}

function part(src, pivot) {
  return src.map((p) => ({
    d: shift(p.d, -pivot.x, -pivot.y),
    ...(p.fill && p.fill !== 'none' ? { fill: p.fill } : {}),
    ...(p.stroke ? { stroke: p.stroke, width: p.width } : {}),
    ...(p.cap ? { cap: p.cap } : {}),
    ...(p.join ? { join: p.join } : {}),
  }));
}
const middle = (src) => { const b = bounds(src.map((p) => p.d)); return { x: b.cx, y: b.cy }; };

// --- The parts that keep their drawn shape -------------------------------------

/** Where a horn meets the head, in the horn's own box. The left one is drawn and the
 * right one is its mirror, so the right pivot is the left one reflected. */
const HORN_BOX = 55.8333;
const HORN_PIVOT = { x: 36, y: 50 };
const hornL = part(paths(read('parts/hornL.svg')), HORN_PIVOT);
const hornR = part(paths(read('parts/hornR.svg')), { x: HORN_BOX - HORN_PIVOT.x, y: HORN_PIVOT.y });

// The tail export is a stroke and the arrowhead that caps it. The stroke becomes
// the rig's three bones; the arrowhead is kept, pivoted on the stroke's last point.
const [tailStroke, tailHead] = paths(read('parts/tail.svg'));
const curve = parse(tailStroke.d);
const P0 = { x: curve[0].nums[0], y: curve[0].nums[1] };
const [c1x, c1y, c2x, c2y, ex, ey] = curve[1].nums;
const tailTip = part([tailHead], { x: ex, y: ey });
/** The curve's control polygon, relative to its first point: the bones. */
const tailBones = [
  { x: round(c1x - P0.x), y: round(c1y - P0.y) },
  { x: round(c2x - c1x), y: round(c2y - c1y) },
  { x: round(ex - c2x), y: round(ey - c2y) },
];

// The hands exist only in the default frame, in that frame's coordinates.
const frame = paths(read('frames/default.svg'));
const named = (id) => frame.filter((p) => p.id === id);
const bodyAt = ellipse(named('Body')[0].d);
const handLSrc = named('hand L'), handRSrc = named('hand R');
const handLAt = middle(handLSrc), handRAt = middle(handRSrc);

const winkLSrc = paths(read('parts/winkL.svg'));
const winkRSrc = paths(read('parts/winkR.svg'));
const mouthArcSrc = paths(read('parts/mouthThinking.svg'));
const sparkSrc = paths(read('parts/surprise.svg'));
const questionSrc = paths(read('parts/question.svg'));
const zzzSrc = paths(read('parts/sleep.svg'));
const badgeSrc = paths(read('parts/done.svg'));
const box = (src) => bounds(src.map((p) => p.d));
const size = (src) => { const b = box(src); return { w: round(b.x1 - b.x0), h: round(b.y1 - b.y0) }; };

const art = {
  hornL, hornR, tailTip,
  handL: part(handLSrc, handLAt),
  handR: part(handRSrc, handRAt),
  // A wink is drawn about the middle of its chevron, and its point is toward the
  // nose. Both variants export pointing left: Figma flips the left one where it is
  // placed, and a component's own export does not carry a flip, so it is put back.
  winkL: part(winkLSrc, middle(winkLSrc)).map((p) => ({ ...p, d: mirror(p.d) })),
  winkR: part(winkRSrc, middle(winkRSrc)),
  mouthArc: part(mouthArcSrc, middle(mouthArcSrc)),
  // The marks grow out of the corner nearest the character, so that is their pivot.
  spark: part(sparkSrc, { x: box(sparkSrc).x0, y: box(sparkSrc).y1 }),
  question: part(questionSrc, { x: box(questionSrc).cx, y: box(questionSrc).y1 }),
  zzz: part(zzzSrc, { x: box(zzzSrc).x0, y: box(zzzSrc).y1 }),
  badge: part(badgeSrc, middle(badgeSrc)),
};

// --- The parts the rig draws itself, measured ----------------------------------

const body = paths(read('parts/body.svg'))[0];
const bodyShape = ellipse(body.d);
const eyeL = ellipse(paths(read('parts/eyeL.svg'))[0].d);
const eyeR = ellipse(paths(read('parts/eyeR.svg'))[0].d);
const pupil = ellipse(paths(read('parts/eyeball.svg'))[0].d);
const mouthO = ellipse(paths(read('parts/mouthSurprise.svg'))[0].d);
const lash = paths(read('parts/happyEyeL.svg'))[0];

const ink = {
  outline: body.stroke,
  skin: body.fill,
  white: '#FFFFFF',
  gold: sparkSrc[0].stroke,
};
// The exports say `white` for the eyes; keep one spelling.
for (const list of Object.values(art)) {
  for (const p of list) if (p.fill === 'white') p.fill = ink.white;
}

const measure = {
  body: { rx: bodyShape.rx, ry: bodyShape.ry, stroke: body.width },
  eyeL: { rx: eyeL.rx, ry: eyeL.ry },
  eyeR: { rx: eyeR.rx, ry: eyeR.ry },
  pupil: { rx: pupil.rx, ry: pupil.ry },
  mouthO: { rx: mouthO.rx, ry: mouthO.ry },
  lash: { stroke: lash.width },
  tail: { stroke: tailStroke.width, bones: tailBones },
  /** Where each hand rests, from the body's centre, in the default frame, and how
   * big its outline is. */
  handL: { x: round(handLAt.x - bodyAt.cx), y: round(handLAt.y - bodyAt.cy), ...size(handLSrc) },
  handR: { x: round(handRAt.x - bodyAt.cx), y: round(handRAt.y - bodyAt.cy), ...size(handRSrc) },
};

const out = `/* Generated by scripts/import-mascot-rig.cjs. Do not edit. */
/** The rig's artwork: the parts that keep their drawn shape, each in its own space
 * with its pivot at the origin, and the measurements of the parts the rig draws
 * itself. Source: assets/mascot/rig, exported from Figma node 53:5419. */

export interface RigPath {
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  cap?: string;
  join?: string;
}

/** The character's own ink. It is the illustration's, not the theme's: recolouring
 * the app must not recolour the character. */
export const RIG_INK = ${JSON.stringify(ink, null, 2)} as const;

export const RIG_MEASURE = ${JSON.stringify(measure, null, 2)} as const;

export type RigArtName = ${Object.keys(art).map((k) => `'${k}'`).join(' | ')};

export const RIG_ART: Record<RigArtName, RigPath[]> = ${JSON.stringify(art, null, 2)};
`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log(`Wrote ${path.relative(root, OUT)}: ${Object.keys(art).length} parts, ${Object.values(art).flat().length} paths.`);
