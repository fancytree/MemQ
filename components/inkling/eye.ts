/** Eye geometry for the Inkling.
 *
 * An eye is a closed polygon, not a rounded rectangle. That is the whole point: a
 * rounded rectangle has only width, height and a corner radius, so every expression
 * it can reach is a squashed bar. A crescent, a chevron and a lowered wedge are not
 * squashed bars, and they are what carry an expression.
 *
 * Every shape is authored as a parametric outline in viewBox units, then put through
 * the same normalisation: one winding direction, one starting vertex, and equal
 * spacing by arc length to a common vertex count. Two shapes prepared that way can be
 * interpolated vertex by vertex — each vertex moves to its counterpart rather than
 * the outline twisting through itself — which is what makes morphing between any two
 * of them safe without hand-pairing their corners.
 *
 * Authored in view units rather than a unit square so that a round cap stays round:
 * the resting eye is 6.5 x 14.3, and normalising to a square would have the aspect
 * ratio turn every circle into an ellipse on the way back out.
 */

/** Vertices per eye. Enough that the straight segments are invisible at the sizes
 * this character is drawn, few enough that rebuilding two outlines a frame is free. */
export const EYE_VERTS = 32;

/** The resting eye. Shapes are authored around this box; w/h scale them from here. */
export const EYE_BOX = { width: 6.5, height: 14.3 } as const;
const HW = EYE_BOX.width / 2;
const HH = EYE_BOX.height / 2;

type Pt = [number, number];

/** Samples per authored edge while an outline is being built. Resampling reduces the
 * result to EYE_VERTS, so this only has to be dense enough not to lose curvature. */
const DENSE = 24;

function lineTo(out: Pt[], x: number, y: number) {
  const [px, py] = out[out.length - 1];
  for (let i = 1; i <= DENSE; i++) {
    const t = i / DENSE;
    out.push([px + (x - px) * t, py + (y - py) * t]);
  }
}

function arcTo(out: Pt[], cx: number, cy: number, rad: number, a0: number, a1: number) {
  for (let i = 1; i <= DENSE; i++) {
    const a = a0 + (a1 - a0) * (i / DENSE);
    out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
}

/** The circular arc from p0 to p1 that passes through pm. Used for the shapes whose
 * edges are arcs meeting at a point — a lens and a crescent both need corners, which
 * is exactly what a plain ellipse cannot give. */
function arc3(out: Pt[], p0: Pt, pm: Pt, p1: Pt) {
  const [x1, y1] = p0, [x2, y2] = pm, [x3, y3] = p1;
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-9) { lineTo(out, x3, y3); return; }
  const u1 = x1 * x1 + y1 * y1, u2 = x2 * x2 + y2 * y2, u3 = x3 * x3 + y3 * y3;
  const cx = (u1 * (y2 - y3) + u2 * (y3 - y1) + u3 * (y1 - y2)) / d;
  const cy = (u1 * (x3 - x2) + u2 * (x1 - x3) + u3 * (x2 - x1)) / d;
  const rad = Math.hypot(x1 - cx, y1 - cy);
  const wrap = (a: number) => {
    let v = a;
    while (v <= -Math.PI) v += Math.PI * 2;
    while (v > Math.PI) v -= Math.PI * 2;
    return v;
  };
  const a0 = Math.atan2(y1 - cy, x1 - cx);
  const mid = wrap(Math.atan2(y2 - cy, x2 - cx) - a0);
  let sweep = wrap(Math.atan2(y3 - cy, x3 - cx) - a0);
  // Take the long way round if the short way does not pass through pm.
  if ((mid > 0) !== (sweep > 0) || Math.abs(mid) > Math.abs(sweep)) {
    sweep += sweep > 0 ? -Math.PI * 2 : Math.PI * 2;
  }
  const steps = DENSE * 2;
  for (let i = 1; i <= steps; i++) {
    const a = a0 + sweep * (i / steps);
    out.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
}

/** A vertical bar with rounded ends: the resting eye and everything near it. */
function capsule(hw: number, hh: number, round: number): Pt[] {
  const rad = Math.min(hw, hh) * round;
  const pts: Pt[] = [[hw, 0]];
  lineTo(pts, hw, hh - rad);
  arcTo(pts, hw - rad, hh - rad, rad, 0, Math.PI / 2);
  lineTo(pts, -hw + rad, hh);
  arcTo(pts, -hw + rad, hh - rad, rad, Math.PI / 2, Math.PI);
  lineTo(pts, -hw, -hh + rad);
  arcTo(pts, -hw + rad, -hh + rad, rad, Math.PI, Math.PI * 1.5);
  lineTo(pts, hw - rad, -hh);
  arcTo(pts, hw - rad, -hh + rad, rad, -Math.PI / 2, 0);
  lineTo(pts, hw, 0);
  return pts;
}

/** A true round dot. A capsule scaled down stays a bar; this does not. */
function ellipse(hw: number, hh: number): Pt[] {
  const pts: Pt[] = [];
  const steps = DENSE * 8;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push([hw * Math.cos(a), hh * Math.sin(a)]);
  }
  return pts;
}

/** Two arcs meeting at points left and right: a narrowed, squinting eye. The corners
 * are the difference between a squint and a flattened bar. */
function lens(hw: number, hh: number): Pt[] {
  const pts: Pt[] = [[hw, 0]];
  arc3(pts, [hw, 0], [0, hh], [-hw, 0]);
  arc3(pts, [-hw, 0], [0, -hh], [hw, 0]);
  return pts;
}

/** A band between two upward arcs: an eye closed in a smile. */
function crescent(hw: number, hh: number, thick: number): Pt[] {
  const pts: Pt[] = [[hw, 0]];
  arc3(pts, [hw, 0], [0, -hh + thick], [-hw, 0]);
  arc3(pts, [-hw, 0], [0, -hh], [hw, 0]);
  return pts;
}

/** A band between two chevrons: a brow pulled into a peak. */
function chevron(hw: number, hh: number, thick: number): Pt[] {
  const pts: Pt[] = [[hw, 0]];
  lineTo(pts, hw, thick);
  lineTo(pts, 0, -hh + thick);
  lineTo(pts, -hw, thick);
  lineTo(pts, -hw, 0);
  lineTo(pts, 0, -hh);
  lineTo(pts, hw, 0);
  return pts;
}

/** A bar with a rounded base and a sloped top. Mirrored between the two eyes, the
 * slope reads as a brow: raised on the outside is wary, raised inside is downcast. */
function wedge(hw: number, hh: number, lean: number, round: number): Pt[] {
  const rad = Math.min(hw, hh) * round * 0.9;
  const pts: Pt[] = [[hw, 0]];
  lineTo(pts, hw, hh - rad);
  arcTo(pts, hw - rad, hh - rad, rad, 0, Math.PI / 2);
  lineTo(pts, -hw + rad, hh);
  arcTo(pts, -hw + rad, hh - rad, rad, Math.PI / 2, Math.PI);
  lineTo(pts, -hw, -hh + lean);
  lineTo(pts, hw, -hh - lean);
  lineTo(pts, hw, 0);
  return pts;
}

function signedArea(poly: Pt[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** One winding direction and one starting vertex for every shape. Without this an
 * interpolation between two outlines built in different directions turns the eye
 * inside out on its way across. The start is the rightmost vertex, which every shape
 * here has exactly one of. */
function orient(poly: Pt[]): Pt[] {
  const out = signedArea(poly) < 0 ? [...poly].reverse() : [...poly];
  let start = 0;
  for (let i = 1; i < out.length; i++) {
    const better = out[i][0] > out[start][0]
      || (out[i][0] === out[start][0] && out[i][1] < out[start][1]);
    if (better) start = i;
  }
  return [...out.slice(start), ...out.slice(0, start)];
}

/** Equal spacing by arc length. This is what makes two different outlines comparable:
 * vertex k is the same fraction of the way around in both, so lerping them moves each
 * vertex a short distance instead of sliding points along the outline. */
function resample(poly: Pt[], n: number): number[] {
  const m = poly.length;
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const p = poly[i], q = poly[(i + 1) % m];
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    seg.push(d);
    total += d;
  }
  const flat: number[] = [];
  let idx = 0;
  let walked = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (idx < m - 1 && walked + seg[idx] < target) { walked += seg[idx]; idx++; }
    const t = seg[idx] > 1e-9 ? (target - walked) / seg[idx] : 0;
    const p = poly[idx], q = poly[(idx + 1) % m];
    flat.push(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t);
  }
  return flat;
}

/** Authored outline to a flat, interpolation-ready [x0,y0,x1,y1,...] of EYE_VERTS. */
function bake(poly: Pt[]): number[] {
  return resample(orient(poly), EYE_VERTS);
}

/** The six shapes that differ only in scale share one outline, so morphing between
 * them is a pure scale change — which is what those shapes are. */
const CAPSULE = bake(capsule(HW, HH, 1));

export interface EyeShape {
  /** Outline in viewBox units, flat pairs, EYE_VERTS of them. */
  poly: number[];
  /** Extra scale on the authored outline. */
  w: number;
  h: number;
  /** Degrees, mirrored between the two eyes. */
  tilt: number;
  /** Vertical offset in viewBox units, positive is lower. */
  dy: number;
}

export const EYES: Record<string, EyeShape> = {
  neutral:  { poly: CAPSULE, w: 1, h: 1, tilt: 0, dy: 0 },
  wide:     { poly: CAPSULE, w: 1.14, h: 1.18, tilt: 0, dy: 0 },
  huge:     { poly: CAPSULE, w: 1.3, h: 1.34, tilt: 0, dy: -0.3 },
  tall:     { poly: CAPSULE, w: 0.88, h: 1.26, tilt: 0, dy: 0 },
  focused:  { poly: CAPSULE, w: 0.86, h: 0.92, tilt: 0, dy: 0 },
  glance:   { poly: CAPSULE, w: 0.94, h: 1.06, tilt: 0, dy: -0.5 },
  dot:      { poly: bake(ellipse(2.45, 2.45)), w: 1, h: 1, tilt: 0, dy: 0 },
  squint:   { poly: bake(lens(3.4, 2)), w: 1, h: 1, tilt: 0, dy: 0 },
  slit:     { poly: bake(lens(3.7, 0.95)), w: 1, h: 1, tilt: 0, dy: 0.8 },
  // The crescent is authored entirely above the eye centre (its own span is -4.6..0),
  // so unlike the others its offset has to push it back down rather than lift it.
  arc:      { poly: bake(crescent(3.9, 4.6, 1.9)), w: 1, h: 1, tilt: 0, dy: 1.4 },
  cross:    { poly: bake(chevron(3.5, 3.4, 2)), w: 1, h: 1, tilt: 0, dy: 0.2 },
  sly:      { poly: bake(wedge(3.35, 2.3, 1.15, 0.8)), w: 1, h: 1, tilt: 6, dy: 0 },
  downcast: { poly: bake(wedge(3.3, 2.9, -1.3, 0.9)), w: 1, h: 1, tilt: -8, dy: 0.7 },
};
export type EyeName = keyof typeof EYES;

/** Vertex-wise interpolation into a reused buffer; worklet, called twice a frame. */
export function lerpPoly(from: number[], to: number[], t: number, out: number[]) {
  'worklet';
  for (let i = 0; i < out.length; i++) out[i] = from[i] + (to[i] - from[i]) * t;
}

/** One eye as an SVG path in viewBox units. Scale, then rotate, then place: the tilt
 * has to come after the scale or a flattened eye would shear instead of turning. */
export function eyePath(
  poly: number[], cx: number, cy: number, sx: number, sy: number, tiltDeg: number,
) {
  'worklet';
  const a = (tiltDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  let d = '';
  for (let i = 0; i < poly.length; i += 2) {
    const x = poly[i] * sx;
    const y = poly[i + 1] * sy;
    const px = Math.round((cx + x * cos - y * sin) * 100) / 100;
    const py = Math.round((cy + x * sin + y * cos) * 100) / 100;
    d += `${i === 0 ? 'M' : 'L'}${px} ${py}`;
  }
  return `${d}Z`;
}
