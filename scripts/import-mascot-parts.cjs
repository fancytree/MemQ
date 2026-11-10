/** Import the Blender mascot part renders into runtime assets.
 *
 * The pack Blender produces is 30 PNGs on a shared 1024x1024 canvas, every part in
 * its final place so the stack composites with no per-part maths. That is the right
 * contract for alignment and the wrong one for a bundle: measured across the pack,
 * 94% of those pixels are transparent padding.
 *
 * So each part is cropped to its own alpha bounds and the crop rectangle is written
 * out alongside it, normalised against the original canvas. Stacking the parts at
 * those rectangles reproduces the shared canvas exactly, at 6% of the pixels.
 *
 * Downscaling happens on premultiplied alpha. Averaging straight RGB across a pixel
 * that is half transparent pulls in whatever colour the renderer happened to leave
 * in the invisible half, which draws a dark fringe around every part.
 *
 *   node scripts/import-mascot-parts.cjs <pack-dir> [--scale 0.5625]
 *
 * <pack-dir> is the unpacked "MemQ Mascot Static Assets" folder: manifest.json, and
 * parts/ beside it.
 */
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const OUT_ASSETS = path.join(root, 'assets/mascot');
const OUT_MODULE = path.join(root, 'components/mascot/parts.ts');
/** The character is drawn at most 192pt wide, so 3x wants 576px of a 1024px canvas. */
const DEFAULT_SCALE = 0.5625;

const args = process.argv.slice(2);
const packDir = args.find((a) => !a.startsWith('--'));
const scaleArg = args.indexOf('--scale');
const SCALE = scaleArg >= 0 ? Number(args[scaleArg + 1]) : DEFAULT_SCALE;
if (!packDir) {
  console.error('usage: node scripts/import-mascot-parts.cjs <pack-dir> [--scale 0.5625]');
  process.exit(1);
}
if (!(SCALE > 0 && SCALE <= 1)) throw new Error(`--scale must be in (0, 1]: ${SCALE}`);

const manifest = JSON.parse(fs.readFileSync(path.join(packDir, 'manifest.json'), 'utf8'));
const CANVAS = manifest.canvas.width;
if (manifest.canvas.width !== manifest.canvas.height) throw new Error('expected a square canvas');

function readPNG(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  if (png.width !== CANVAS || png.height !== CANVAS) {
    throw new Error(`${path.basename(file)} is ${png.width}x${png.height}, expected ${CANVAS} square`);
  }
  return png;
}

/** Tight bounds of everything that is not fully transparent. */
function alphaBounds(png) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[(y * png.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('part is fully transparent');
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Crop, then area-average down to `scale`, carrying alpha premultiplied throughout. */
function cropAndScale(png, box, scale) {
  const dw = Math.max(1, Math.round(box.w * scale));
  const dh = Math.max(1, Math.round(box.h * scale));
  const out = new PNG({ width: dw, height: dh });
  for (let dy = 0; dy < dh; dy++) {
    // Source rows this destination row covers; ends are inclusive of partial pixels.
    const sy0 = box.y + (dy * box.h) / dh;
    const sy1 = box.y + ((dy + 1) * box.h) / dh;
    for (let dx = 0; dx < dw; dx++) {
      const sx0 = box.x + (dx * box.w) / dw;
      const sx1 = box.x + ((dx + 1) * box.w) / dw;
      let r = 0, g = 0, b = 0, a = 0, wsum = 0;
      for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
        const cy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (cy <= 0) continue;
        for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
          const cx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (cx <= 0) continue;
          const w = cx * cy;
          const i = (sy * png.width + sx) * 4;
          const sa = png.data[i + 3] / 255;
          r += png.data[i] * sa * w;
          g += png.data[i + 1] * sa * w;
          b += png.data[i + 2] * sa * w;
          a += sa * w;
          wsum += w;
        }
      }
      const o = (dy * dw + dx) * 4;
      const aa = wsum > 0 ? a / wsum : 0;
      // Un-premultiply. Where nothing is visible the colour is arbitrary; keep it 0
      // so the file compresses and no stray colour can leak through a filter later.
      out.data[o] = aa > 0 ? Math.round(Math.min(255, r / wsum / aa)) : 0;
      out.data[o + 1] = aa > 0 ? Math.round(Math.min(255, g / wsum / aa)) : 0;
      out.data[o + 2] = aa > 0 ? Math.round(Math.min(255, b / wsum / aa)) : 0;
      out.data[o + 3] = Math.round(aa * 255);
    }
  }
  return out;
}

fs.mkdirSync(OUT_ASSETS, { recursive: true });
fs.mkdirSync(path.dirname(OUT_MODULE), { recursive: true });
for (const f of fs.readdirSync(OUT_ASSETS)) {
  if (f.endsWith('.png')) fs.unlinkSync(path.join(OUT_ASSETS, f));
}

const records = [];
let srcBytes = 0, outBytes = 0;
for (const [name, info] of Object.entries(manifest.parts)) {
  const file = path.join(packDir, info.file);
  srcBytes += fs.statSync(file).size;
  const png = readPNG(file);
  const box = alphaBounds(png);
  const scaled = cropAndScale(png, box, SCALE);
  const outFile = path.join(OUT_ASSETS, `${name}.png`);
  const buf = PNG.sync.write(scaled, { deflateLevel: 9 });
  fs.writeFileSync(outFile, buf);
  outBytes += buf.length;
  records.push({
    name,
    // Normalised against the authored canvas, so the stack is resolution independent.
    x: box.x / CANVAS, y: box.y / CANVAS, w: box.w / CANVAS, h: box.h / CANVAS,
    px: scaled.width, py: scaled.height,
    pivot: info.pivot ?? null,
  });
  console.log(`${name.padEnd(20)} ${String(box.w).padStart(4)}x${String(box.h).padEnd(4)}`
    + ` -> ${String(scaled.width).padStart(4)}x${String(scaled.height).padEnd(4)}`
    + ` ${(buf.length / 1024).toFixed(0).padStart(4)} KB`);
}

const order = manifest.neutralBackToFront;
const missing = order.filter((n) => !records.some((r) => r.name === n));
if (missing.length) throw new Error(`layer order names parts that were not imported: ${missing}`);

const num = (v) => Number(v.toFixed(6));
const body = records.map((r) =>
  `  ${JSON.stringify(r.name)}: { rect: [${num(r.x)}, ${num(r.y)}, ${num(r.w)}, ${num(r.h)}]`
  + (r.pivot ? `, pivot: [${num(r.pivot[0])}, ${num(r.pivot[1])}]` : '')
  + `, src: require('../../assets/mascot/${r.name}.png') },`).join('\n');

fs.writeFileSync(OUT_MODULE, `/* Generated by scripts/import-mascot-parts.cjs. Do not edit. */
/** Every part was rendered on one ${CANVAS}px square canvas through the same
 * orthographic camera, then cropped to its own alpha bounds. \`rect\` is that crop as
 * [x, y, w, h] fractions of the canvas, so drawing each part at its rect inside a
 * square box reassembles the original render at any size. */
export type MascotPartName = ${records.map((r) => JSON.stringify(r.name)).join(' | ')};

export interface MascotPart {
  /** [x, y, w, h], fractions of the square canvas. */
  rect: readonly [number, number, number, number];
  /** Rotation centre where the part meets the body, same fractions. */
  pivot?: readonly [number, number];
  src: number;
}

export const MASCOT_PARTS: Record<MascotPartName, MascotPart> = {
${body}
};

/** Back to front, the resting stack. */
export const MASCOT_NEUTRAL_ORDER: MascotPartName[] = [
${order.map((n) => `  ${JSON.stringify(n)},`).join('\n')}
];
`);

console.log(`\n${records.length} parts`);
console.log(`source ${(srcBytes / 1e6).toFixed(1)} MB -> bundled ${(outBytes / 1e6).toFixed(2)} MB`
  + ` (${(100 * outBytes / srcBytes).toFixed(1)}%) at scale ${SCALE}`);
console.log(`wrote ${path.relative(root, OUT_MODULE)}`);
