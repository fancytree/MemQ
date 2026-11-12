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
};

const FILL = { ink: '#4B2C78', body: '#C59AF0', gold: '#FFBA00', white: 'white', plate: '#F0E4FC' };

function parse(file) {
  const src = fs.readFileSync(file, 'utf8');
  const view = /viewBox="([^"]+)"/.exec(src)?.[1];
  const paths = src.match(/<path[^>]*\/>|<path[^>]*>[\s\S]*?<\/path>/g) ?? [];
  return { view, paths: paths.map((raw) => ({
    raw,
    d: /\sd="([^"]+)"/.exec(raw)?.[1] ?? '',
    fill: /fill="([^"]+)"/.exec(raw)?.[1] ?? 'none',
    stroke: /stroke="([^"]+)"/.exec(raw)?.[1],
    width: Number(/stroke-width="([\d.]+)"/.exec(raw)?.[1] ?? 0),
    cap: /stroke-linecap="([^"]+)"/.exec(raw)?.[1],
    join: /stroke-linejoin="([^"]+)"/.exec(raw)?.[1],
  })) };
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

function classify(paths, view) {
  const [, , vw, vh] = view.split(/\s+/).map(Number);
  const mid = vw / 2;
  const hasGoldDot = paths.some((p) => p.fill === FILL.gold);
  const out = [];
  const seen = new Set();
  for (const p of paths) {
    // Figma exported some shapes twice - both eye whites appear twice in the focused
    // frame, identical to the pixel. One pair differs only by a rounding digit
    // (117.44 against 117.441), so the comparison is on the rounded number sequence
    // rather than the string. Drawing a shape on itself costs a path and changes
    // nothing, so the duplicate is dropped here and reported.
    const key = (p.d.match(/-?\d*\.?\d+/g) ?? []).map((n) => Number(n).toFixed(2)).join(',');
    if (seen.has(key)) { out.push({ ...p, name: 'duplicate', b: null, w: 0, h: 0, cx: 0, cy: 0 }); continue; }
    seen.add(key);
    const b = bounds(p.d);
    if (!b) continue;
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    let name;
    if (p.fill === FILL.plate) name = 'plate';
    else if (p.fill === FILL.body) name = 'body';
    else if (p.fill === FILL.white) name = cx < mid ? 'eyeWhiteL' : 'eyeWhiteR';
    else if (p.fill === FILL.gold || p.stroke === FILL.gold) {
      // Sizes do not separate these reliably - a stroked path renders wider than its
      // geometry, so measuring the path data mislabelled the icon's accents. The
      // structure does: a question mark is a stroked arc plus a small *filled* dot,
      // and the accent strokes are never filled. So a frame that contains a filled
      // gold path contains a question mark, and its gold strokes belong to it.
      name = hasGoldDot ? 'question' : 'accent';
    } else if (p.fill === FILL.ink || p.stroke === FILL.ink) {
      if (cy < vh * 0.42 && w > vw * 0.3) name = 'horns';
      else if (cx > vw * 0.6 && cy > vh * 0.55) name = p.fill === 'none' ? 'tail' : 'tailTip';
      else if (cy > vh * 0.55 && w < vw * 0.2) name = 'mouth';
      // A closed lid is drawn as a stroked arc where an open eye has a filled pupil.
      // Calling it a pupil would hand it to the gaze spring, which would slide a shut
      // eye around the face.
      else if (p.fill === 'none') name = cx < mid ? 'eyeClosedL' : 'eyeClosedR';
      else name = cx < mid ? 'pupilL' : 'pupilR';
    } else name = 'unknown';
    out.push({ ...p, name, b, w: Math.round(w), h: Math.round(h), cx: Math.round(cx), cy: Math.round(cy) });
  }
  const dupes = out.filter((p) => p.name === 'duplicate').length;
  if (dupes) console.log(`  (dropped ${dupes} duplicate path(s))`);
  return out.filter((p) => p.name !== 'duplicate');
}

const frames = {};
for (const [file, state] of Object.entries(FRAMES)) {
  const f = path.join(SRC, `${file}.svg`);
  if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }
  const { view, paths } = parse(f);
  frames[state] = { view, parts: classify(paths, view) };
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
  | 'mouth' | 'accent' | 'question' | 'unknown';

export interface FigmaPath {
  name: MascotPartName;
  d: string;
  fill?: string;
  stroke?: string;
  width?: number;
  cap?: string;
  join?: string;
}

export interface FigmaFrame { view: string; parts: FigmaPath[] }

export const MASCOT_ART: Record<string, FigmaFrame> = {
${body}
};
`);
console.log(`\nwrote ${path.relative(path.resolve(__dirname, '..'), OUT)}`);
