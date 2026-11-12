/** Turn the Figma mascot frames into named, animatable parts.
 *
 * Figma exports each frame as a flat list of `Vector`, `Vector_2`, ... paths with no
 * meaningful names, so the parts are identified here by what they are rather than by
 * what they are called: the fill tells ink from body from eye white from accent, and
 * the position tells left from right and horn from tail. That survives the designer
 * reordering layers, which naming by index would not.
 *
 * The app needs them apart, not merged: the body squashes, the horns and tail trail
 * behind it, and the pupils move with the gaze. A single flattened path can only be
 * translated and scaled as a whole.
 *
 *   node scripts/import-mascot-figma.cjs <svg-dir> [--check]
 *
 * --check prints the classification and writes nothing, which is how a new export
 * gets reviewed before it lands.
 */
const fs = require('node:fs');
const path = require('node:path');

const SRC = process.argv[2];
const CHECK = process.argv.includes('--check');
if (!SRC) { console.error('usage: node scripts/import-mascot-figma.cjs <svg-dir> [--check]'); process.exit(1); }

const OUT = path.resolve(__dirname, '../components/mascot/figma-parts.ts');

/** The frames, by Figma node id, and what each one is. */
const FRAMES = {
  'n11-453': 'neutral',
  'n11-462': 'aha',
  'n11-475': 'thinking',
  'n11-487': 'focused',
  'n11-506': 'happy',
  'n12-536': 'completed',
  'n12-546': 'sleepy',
  'n11-516-icon': 'icon',
};

/** Corrections to the export, applied here and listed so they are not silent.
 *
 * The question mark was copied into three frames: it is the same two paths at the
 * same place in thinking, focused and happy - (201,16) 39x40 and a dot at (216,57)
 * 11x11, identical to the pixel. It belongs to thinking alone. And happy should carry
 * the three accent strokes instead, which only the aha frame currently has. */
const FIXES = {
  focused: { drop: ['question'] },
  happy: { drop: ['question'], borrow: { accent: 'aha' } },
  // The sleeping z's are gold strokes outside any badge, which is exactly what an
  // accent stroke is, so nothing in the drawing separates them. They behave quite
  // differently though - z's drift up and fade where accents pop - so they are
  // renamed here rather than left to be told apart at runtime.
  sleepy: { rename: { accent: 'zzz' } },
};

const FILL = { ink: '#4B2C78', body: '#C59AF0', gold: '#FFBA00', white: 'white', plate: '#F0E4FC' };

function parse(file) {
  const raw = fs.readFileSync(file, 'utf8');
  // Figma draws the focused eye by masking a whole pupil disc with the eye-white
  // shape, so the brow cuts the top off the pupil. A flat scan for <path> finds the
  // disc and the mask source side by side and draws both, which puts the pupil back
  // over the brow and loses the squint. The mask is a luminance mask whose source is
  // exactly the eye white, so it is a clip by another name - and a clip is what the
  // runtime wants regardless, since a pupil the gaze spring moves has to stay inside
  // its own eye.
  const masks = {};
  const src = raw.replace(/<mask id="([^"]+)"[\s\S]*?<\/mask>/g, (m, id) => {
    const d = /\sd="([^"]+)"/.exec(m)?.[1];
    if (d) masks[id] = d;
    return '';
  });
  const view = /viewBox="([^"]+)"/.exec(src)?.[1];
  const paths = [];
  const stack = [];
  const re = /<g\b[^>]*>|<\/g>|<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g;
  let m;
  while ((m = re.exec(src))) {
    const tag = m[0];
    if (tag.startsWith('</g')) { stack.pop(); continue; }
    if (tag.startsWith('<g')) { stack.push(/mask="url\(#([^)]+)\)"/.exec(tag)?.[1]); continue; }
    paths.push({
      raw: tag,
      mask: stack.filter(Boolean).pop(),
      d: /\sd="([^"]+)"/.exec(tag)?.[1] ?? '',
      fill: /fill="([^"]+)"/.exec(tag)?.[1] ?? 'none',
      stroke: /stroke="([^"]+)"/.exec(tag)?.[1],
      width: Number(/stroke-width="([\d.]+)"/.exec(tag)?.[1] ?? 0),
      cap: /stroke-linecap="([^"]+)"/.exec(tag)?.[1],
      join: /stroke-linejoin="([^"]+)"/.exec(tag)?.[1],
    });
  }
  return { view, masks, paths };
}

/** The rounded number sequence of a path, used both to spot a shape Figma exported
 * twice and to recognise a mask source as a copy of a visible part. */
function key(d) {
  return (d.match(/-?\d*\.?\d+/g) ?? []).map((n) => Number(n).toFixed(2)).join(',');
}

/** Rough bounds straight off the path data. Exact enough to tell a horn from a tail
 * and a left eye from a right one, which is all that is being asked of it. */
function bounds(d) {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) ?? [];
  const xs = [], ys = [];
  for (let i = 0; i + 1 < nums.length; i += 2) { xs.push(nums[i]); ys.push(nums[i + 1]); }
  if (!xs.length) return null;
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Everything is placed relative to the body, which is the one path filled with the
 * body colour. That is what makes this survive a redesign: the horns are whatever
 * reaches above the body, the tail is whatever reaches past its right edge, and the
 * eyes are the pair inside it. Fractions of the viewBox did not survive - the sleepy
 * face sits 19 units lower than the others, which dropped its eyes below the line
 * that was meant to separate a face from a tail, and named one of them a tail. */
function classify(paths, view, masks) {
  const [, , vw, vh] = view.split(/\s+/).map(Number);
  const mid = vw / 2;
  const hasGoldDot = paths.some((p) => p.fill === FILL.gold);

  // Measure everything, and drop the duplicates, before anything is named. Figma
  // exported some shapes twice - both eye whites appear twice in the focused frame,
  // identical to the pixel. One pair differs only by a rounding digit (117.44 against
  // 117.441), so the comparison is on the rounded number sequence rather than the
  // string. Drawing a shape on itself costs a path and changes nothing.
  const items = [];
  const seen = new Set();
  let dupes = 0;
  for (const p of paths) {
    const k = key(p.d);
    if (seen.has(k)) { dupes += 1; continue; }
    seen.add(k);
    const b = bounds(p.d);
    if (!b) continue;
    items.push({ ...p, b, w: Math.round(b.x1 - b.x0), h: Math.round(b.y1 - b.y0),
      cx: Math.round((b.x0 + b.x1) / 2), cy: Math.round((b.y0 + b.y1) / 2) });
  }
  if (dupes) console.log(`  (dropped ${dupes} duplicate path(s))`);

  const body = items.find((p) => p.fill === FILL.body);
  const box = body ? body.b : { x0: 0, y0: 0, x1: vw, y1: vh };
  // The completed badge is the only white shape carrying an outline - the eye whites
  // have none. It has to be named before the tail test, because it reaches past the
  // body's right edge just as the tail does.
  const badge = items.find((p) => p.fill === FILL.white && p.stroke === FILL.ink);
  const within = (p, q) => p.cx > q.b.x0 && p.cx < q.b.x1 && p.cy > q.b.y0 && p.cy < q.b.y1;

  const face = [];
  for (const p of items) {
    if (p.fill === FILL.plate) p.name = 'plate';
    else if (p === body) p.name = 'body';
    else if (p === badge) p.name = 'badge';
    else if (p.fill === FILL.white) p.name = p.cx < mid ? 'eyeWhiteL' : 'eyeWhiteR';
    else if (p.fill === FILL.gold || p.stroke === FILL.gold) {
      // Sizes do not separate gold from gold - a stroked path renders wider than its
      // geometry, which is what mislabelled the icon's accents. The structure does: a
      // question mark is a stroked arc plus a small *filled* dot, and the accent
      // strokes are never filled, so a frame containing a filled gold path contains a
      // question mark and its gold strokes belong to it. The tick is the gold that
      // sits inside the badge.
      if (badge && within(p, badge)) p.name = 'check';
      else p.name = hasGoldDot ? 'question' : 'accent';
    } else if (p.fill === FILL.ink || p.stroke === FILL.ink) {
      if (p.b.y0 < box.y0 - 2) p.name = 'horns';
      else if (p.b.x1 > box.x1 + 2) p.name = p.fill === 'none' ? 'tail' : 'tailTip';
      else { face.push(p); continue; }
    } else p.name = 'unknown';
  }

  // What is left is ink on the face: a pair of eyes, and at most a mouth. The eyes are
  // the pair - same size, same height, one either side of centre - so the mouth needs
  // no rule of its own, it is simply the one that has no partner. A closed lid is a
  // stroked arc where an open eye has a filled pupil; calling a lid a pupil would hand
  // it to the gaze spring, which would slide a shut eye around the face.
  const paired = new Set();
  for (const a of face) {
    if (paired.has(a)) continue;
    const b = face.find((o) => o !== a && !paired.has(o)
      && Math.abs(o.cy - a.cy) <= 6 && Math.abs(o.w - a.w) <= 5 && Math.abs(o.h - a.h) <= 6
      && (a.cx < mid) !== (o.cx < mid));
    if (!b) continue;
    paired.add(a); paired.add(b);
    for (const e of [a, b]) {
      e.name = e.fill === 'none' ? (e.cx < mid ? 'eyeClosedL' : 'eyeClosedR')
        : (e.cx < mid ? 'pupilL' : 'pupilR');
    }
  }
  for (const p of face) if (!paired.has(p)) p.name = 'mouth';

  // Name the clip after the part that does the clipping, so the generated module
  // stays one list of named shapes rather than a list plus a pile of loose geometry.
  for (const p of items) {
    if (!p.mask || !masks[p.mask]) continue;
    const by = items.find((o) => o !== p && key(o.d) === key(masks[p.mask]));
    if (by) p.clip = by.name;
    else p.clipD = masks[p.mask];
  }

  return items;
}

const frames = {};
for (const [file, state] of Object.entries(FRAMES)) {
  const f = path.join(SRC, `${file}.svg`);
  if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }
  const { view, masks, paths } = parse(f);
  frames[state] = { view, parts: classify(paths, view, masks) };
}

// Apply the corrections.
for (const [state, fix] of Object.entries(FIXES)) {
  const fr = frames[state];
  if (!fr) continue;
  if (fix.drop) {
    const before = fr.parts.length;
    fr.parts = fr.parts.filter((p) => !fix.drop.includes(p.name));
    console.log(`${state}: dropped ${before - fr.parts.length} ${fix.drop.join('/')} path(s)`);
  }
  for (const [from, to] of Object.entries(fix.rename ?? {})) {
    const hit = fr.parts.filter((p) => p.name === from);
    for (const p of hit) p.name = to;
    console.log(`${state}: renamed ${hit.length} ${from} path(s) to ${to}`);
  }
  for (const [name, from] of Object.entries(fix.borrow ?? {})) {
    const taken = frames[from].parts.filter((p) => p.name === name);
    fr.parts.push(...taken);
    console.log(`${state}: borrowed ${taken.length} ${name} path(s) from ${from}`);
  }
}

console.log('');
for (const [state, fr] of Object.entries(frames)) {
  const counts = {};
  for (const p of fr.parts) counts[p.name] = (counts[p.name] ?? 0) + 1;
  const unknown = fr.parts.filter((p) => p.name === 'unknown');
  console.log(`${state.padEnd(9)} ${fr.view}  ` + Object.entries(counts)
    .map(([k, v]) => v > 1 ? `${k}x${v}` : k).join(' '));
  for (const u of unknown) console.log(`  UNKNOWN fill=${u.fill} stroke=${u.stroke} ${u.w}x${u.h} at (${u.cx},${u.cy})`);
  for (const c of fr.parts.filter((p) => p.clip || p.clipD)) console.log(`  ${c.name} is clipped to ${c.clip ?? 'its own mask shape'}`);
}

if (CHECK) { console.log('\n--check: nothing written'); process.exit(0); }

const esc = (s) => JSON.stringify(s);
const body = Object.entries(frames).map(([state, fr]) => {
  const parts = fr.parts.map((p) => '      { name: ' + esc(p.name)
    + ', d: ' + esc(p.d)
    + (p.fill && p.fill !== 'none' ? ', fill: ' + esc(p.fill) : '')
    + (p.stroke ? ', stroke: ' + esc(p.stroke) : '')
    + (p.width ? ', width: ' + p.width : '')
    + (p.cap ? ', cap: ' + esc(p.cap) : '')
    + (p.join ? ', join: ' + esc(p.join) : '')
    + ', box: [' + [p.b.x0, p.b.y0, p.b.x1, p.b.y1].map((n) => Math.round(n * 10) / 10).join(', ') + ']'
    + (p.clip ? ', clip: ' + esc(p.clip) : '')
    + (p.clipD ? ', clipD: ' + esc(p.clipD) : '')
    + ' },').join('\n');
  return `  ${state}: {\n    view: ${esc(fr.view)},\n    parts: [\n${parts}\n    ],\n  },`;
}).join('\n');

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `/* Generated by scripts/import-mascot-figma.cjs. Do not edit. */
/** The mascot's artwork, as named parts rather than one flattened drawing.
 *
 * Figma names every path \`Vector\`, \`Vector_2\` and so on, so these names were
 * recovered from each path's fill and position: the fill separates ink from body from
 * eye white from accent, and the position separates left from right and horn from
 * tail. Re-running the importer after a redesign re-derives them, which is why it
 * reports its classification rather than trusting a layer order.
 *
 * Every frame shares one 256-square viewBox, so a change of expression never moves
 * the character on screen. */
export type MascotPartName =
  | 'body' | 'horns' | 'tail' | 'tailTip' | 'plate'
  | 'eyeWhiteL' | 'eyeWhiteR' | 'pupilL' | 'pupilR'
  | 'eyeClosedL' | 'eyeClosedR'
  | 'mouth' | 'accent' | 'question' | 'badge' | 'check' | 'zzz' | 'unknown';

export interface FigmaPath {
  name: MascotPartName;
  d: string;
  /** The path data's own bounds, x0 y0 x1 y1. Control points are counted, so a curved
   * shape measures a little large - near enough to hang a pivot on, which is all it
   * is for: a horn turns about where it meets the head, an eye narrows about its own
   * centre, and neither wants a number typed in by hand. */
  box: [number, number, number, number];
  fill?: string;
  stroke?: string;
  width?: number;
  cap?: string;
  join?: string;
  /** Draw this path only where the named part covers it. The focused eye is a whole
   * pupil disc clipped to the eye white, so the brow cuts its top off; the same clip
   * is what keeps a pupil inside its eye once the gaze spring moves it. */
  clip?: MascotPartName;
  /** A clip whose shape is not itself one of the parts. */
  clipD?: string;
}

export interface FigmaFrame { view: string; parts: FigmaPath[] }

export const MASCOT_ART: Record<string, FigmaFrame> = {
${body}
};
`);
console.log(`\nwrote ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
