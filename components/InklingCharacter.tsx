import { colors } from '@/theme';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import {
  EYES, EYE_BOX, eyePath, lerpPoly, type EyeShape,
} from './inkling/eye';
import {
  ALL_MOODS, BEAT, BLINK_EVERY, EYE_HOLD, EYE_PLAYLIST, GAZE, MOOD_GROUPS, POSES,
  poseFor, type InklingMood, type PoseOut,
} from './inkling/pose';

/** An eye's outline changes every frame, so it is a Path driven by animatedProps
 * rather than a View driven by a style. */
const AnimatedPath = Animated.createAnimatedComponent(Path);

export { ALL_MOODS, BEAT, BLINK_EVERY, EYE_HOLD, EYE_PLAYLIST, GAZE, MOOD_GROUPS, POSES };
export type { InklingMood };

/** Geometry traced from assets/design-system/today-hero-inkling.svg (Figma 96:606).
 * Inlined rather than loaded through DesignAsset so the body, the arms and the eyes
 * can move independently. Runtime re-tone: ink body, paper features; the mouth and
 * both legs are dropped. The exported SVG is unchanged.
 *
 * Motion model: nothing is keyframed. Each frame computes a target pose for the
 * current state and a damped spring per quantity chases it, so a state change needs
 * no cross-fade and a one-off beat can be injected as velocity.
 */
const VIEW = { width: 192, height: 176 } as const;
const VIEW_BOX = `0 0 ${VIEW.width} ${VIEW.height}`;
const BODY =
  'M52.9891 107.769C49.6148 92.6095 57.5955 80.6872 64.221 67.7504C70.8465 54.8137 68.6591 39.4903 83.4154 32.6405C98.0035 24.612 112.91 35.7715 121.032 50.2738C129.153 64.7761 146.779 69.5493 150.658 88.2447C157.752 112.505 139.417 136.678 112.456 142.813C85.6623 150.126 57.5321 139.594 54.5034 118.377L52.9891 107.769Z';

/** The two arms are the only limbs. `sign` is the rotation that droops one away from
 * the blob outline — raising an arm tucks it behind the body and it disappears, so
 * arm posture runs downward. `gain` compensates for the length difference.
 *
 * The drawing gives the two arms neither a common angle nor a common length: the
 * left is level and 8.5 units long, the right is raised about 45 degrees and 13.5.
 * That was fine for a still, but once the arms move it reads as lopsided. Both are
 * now extended along their authored direction to ARM_LENGTH and rotated to
 * ARM_NEUTRAL_DEG below horizontal; every state's droop and swing is measured from
 * there. The pivots keep their authored positions, which sit a little apart
 * vertically because the blob's own outline is not symmetric.
 */
const ARM_NEUTRAL_DEG = 25;
const ARM_LENGTH = 13;
/** Redraws an arm along its authored direction at the common length. */
function armPath(px: number, py: number, dx: number, dy: number) {
  const k = ARM_LENGTH / Math.hypot(dx, dy);
  return `M${px} ${py}L${(px + dx * k).toFixed(3)} ${(py + dy * k).toFixed(3)}`;
}
const LIMBS = [
  // Authored: 8.1 degrees below horizontal, 8.5 units long.
  { id: 'armL', d: armPath(54, 111.784, -8.4, 1.189), pivot: { x: 54, y: 111.784 }, sign: -1, neutral: (ARM_NEUTRAL_DEG - 8.1) * -1, rate: 0.73, phase: 0 },
  // Authored: 44.7 degrees above horizontal, 13.5 units long.
  { id: 'armR', d: armPath(151.2, 108.216, 9.6, -9.5133), pivot: { x: 151.2, y: 108.216 }, sign: 1, neutral: (ARM_NEUTRAL_DEG + 44.7) * 1, rate: 0.61, phase: 1.7 },
] as const;
const LIMB_STROKE = 1.9;

/** The body in three dimensions.
 *
 * The drawing is flat, so a turn has to be inferred. The outline is flattened once at
 * module load and reduced to a profile: at each of BODY_ROWS heights, where the centre
 * of the body is and how wide it is. That profile is then read as a stack of circles
 * threaded on a spine — a(y) is each circle's radius, c(y) its centre — and the spine
 * is given depth, because a lean a viewer reads as "tilted" is really a lean in space.
 *
 * Yawing the stack gives a new profile, and the drawn path is rebuilt from it. The
 * circles themselves are allowed to be slightly shallower than they are wide, so the
 * body also narrows a little as it comes round.
 */
const BODY_ROWS = 144;
/** Depth of each cross-section relative to its width. Under 1 the body is a flattened
 * round rather than a sphere, so turning narrows it; at 1 nothing would narrow. */
const BODY_DEPTH = 0.82;
/** How much of the spine's lean points at the viewer rather than across the frame.
 * This is the one value a flat drawing cannot tell us, so it is a design choice: it
 * decides whether the crown swings with the turn or against it. Negative swings it
 * against, which is what a head does — the face goes one way, the crown the other.
 */
const CROWN_DEPTH = -1.15;

function flattenBody() {
  const n = BODY.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const pts: [number, number][] = [];
  let i = 0;
  const first: [number, number] = [n[i++], n[i++]];
  let cur = first;
  const cubic = (p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number]) => {
    const steps = 48;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ]);
    }
  };
  pts.push(first);
  for (let c = 0; c < 6; c++) {
    const p1: [number, number] = [n[i++], n[i++]];
    const p2: [number, number] = [n[i++], n[i++]];
    const p3: [number, number] = [n[i++], n[i++]];
    cubic(cur, p1, p2, p3);
    cur = p3;
  }
  pts.push([n[i++], n[i++]]);
  return pts;
}

/** Binomial smoothing, applied around the profile so the rebuilt outline stays soft.
 * Sampling a curve into rows leaves small steps; this is what takes them out. */
function smooth(v: number[], passes: number) {
  let out = v;
  for (let p = 0; p < passes; p++) {
    const prev = out;
    const n = prev.length;
    out = prev.map((_, i) => (
      prev[Math.max(0, i - 2)] + 4 * prev[Math.max(0, i - 1)] + 6 * prev[i]
      + 4 * prev[Math.min(n - 1, i + 1)] + prev[Math.min(n - 1, i + 2)]
    ) / 16);
  }
  return out;
}

/** centre, radius and spine depth at each row, plus the axis the body turns about. */
const PROFILE = (() => {
  const pts = flattenBody();
  let top = Infinity, bottom = -Infinity, mean = 0;
  for (const p of pts) {
    if (p[1] < top) top = p[1];
    if (p[1] > bottom) bottom = p[1];
    mean += p[0];
  }
  mean /= pts.length;
  const height = bottom - top;
  const ys: number[] = [], c: number[] = [], a: number[] = [];
  for (let row = 0; row < BODY_ROWS; row++) {
    const y = top + (height * (row + 0.5)) / BODY_ROWS;
    let lo = -Infinity, hi = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], q = pts[(k + 1) % pts.length];
      // Only edges that straddle this height can cross it.
      if ((p[1] <= y) === (q[1] <= y)) continue;
      const x = p[0] + ((q[0] - p[0]) * (y - p[1])) / (q[1] - p[1]);
      if (x <= mean) { if (x > lo) lo = x; } else if (x < hi) hi = x;
    }
    const l = Number.isFinite(lo) ? lo : mean;
    const r = Number.isFinite(hi) ? hi : mean;
    ys.push(y);
    c.push((l + r) / 2);
    a.push((r - l) / 2);
  }
  // The axis is the widest row's centre: the body turns about its thickest part.
  let widest = 0;
  for (let i = 1; i < a.length; i++) if (a[i] > a[widest]) widest = i;
  return {
    ys, top, height, axis: c[widest],
    c: smooth(c, 2),
    a: smooth(a, 2),
  };
})();

/** The profile yawed by `turn`, as left/right edges per row. */
function yawProfile(turn: number) {
  const cos = Math.cos(turn), sin = Math.sin(turn);
  const widthScale = Math.sqrt(cos * cos + BODY_DEPTH * BODY_DEPTH * sin * sin);
  const l: number[] = [], r: number[] = [];
  for (let i = 0; i < BODY_ROWS; i++) {
    const lean = PROFILE.c[i] - PROFILE.axis;
    // The spine's lean is partly across the frame and partly into it; both rotate.
    const centre = PROFILE.axis + lean * cos + lean * CROWN_DEPTH * sin;
    const radius = PROFILE.a[i] * widthScale;
    l.push(centre - radius);
    r.push(centre + radius);
  }
  return { l, r };
}

/** A closed Catmull-Rom spline through the rebuilt edges, as an SVG path. */
function outlinePath(l: number[], r: number[], step: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < BODY_ROWS; i += step) pts.push([r[i], PROFILE.ys[i]]);
  for (let i = BODY_ROWS - 1 - ((BODY_ROWS - 1) % step); i >= 0; i -= step) pts.push([l[i], PROFILE.ys[i]]);
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  let d = `M${at(0)[0].toFixed(2)} ${at(0)[1].toFixed(2)}`;
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

/** The character does not face the viewer dead-on. Each eye is a point on the ring
 * the body makes at that eye's height: the authored position gives its lateral angle,
 * the turn is added, and it is re-projected onto the live span. Foreshortening is the
 * ratio of the turned cosine to the resting one, so an eye that starts near the edge
 * narrows faster than one near the middle — which is what actually happens on a head.
 *
 * Sign: positive turns the face toward the right of the character's own frame. The
 * Today hero mirrors the whole character with scaleX -1, so on that card a positive
 * turn lands pointing left, at the copy, rather than off the edge. Read it in the
 * Motion lab, which does not mirror, and the face is on the right.
 *
 * Magnitude: 30, not the 20 this was first set to. The body only starts to read as
 * turned at about 30 degrees — see the note on the honest limit above — so below that
 * the eyes were carrying the whole effect on their own.
 */
const FACE_TURN_DEG = 30;
const FACE_TURN = (FACE_TURN_DEG * Math.PI) / 180;
/** The honest cosine is too subtle at this turn for a flat drawing, so the narrowing
 * is raised to a power; 2.4 takes the eye furthest around the head to about 0.68. */
const FORESHORTEN = 2.4;
/** Below this the eye has gone round the back and is not drawn. */
const EYE_BEHIND = 0.03;

/** The silhouette actually drawn: the profile, yawed, rebuilt as a path. The turn is
 * a fixed design parameter rather than something that animates, so this is resolved
 * once at module load and costs nothing per frame. */
const TURNED = yawProfile(FACE_TURN);
const BODY_TURNED = outlinePath(TURNED.l, TURNED.r, 3);

/** Reads a per-row table at height y. Worklet: the frame callback asks where the body
 * is without touching a path. */
function rowAt(table: number[], y: number) {
  'worklet';
  const f = ((y - PROFILE.top) / PROFILE.height) * BODY_ROWS - 0.5;
  const i = Math.min(BODY_ROWS - 1, Math.max(0, Math.floor(f)));
  const j = Math.min(BODY_ROWS - 1, i + 1);
  const t = Math.min(1, Math.max(0, f - i));
  return table[i] + (table[j] - table[i]) * t;
}
/** Left and right edge of the drawn body at height y. */
function spanAt(y: number) {
  'worklet';
  return { l: rowAt(TURNED.l, y), r: rowAt(TURNED.r, y) };
}

/** The arms were drawn against the frontal outline. Re-anchor each pivot by how far
 * across the body it sat, so it stays on the edge once the body has come round. */
const ARMS = LIMBS.map((limb) => {
  const row = Math.min(BODY_ROWS - 1, Math.max(0, Math.round(
    ((limb.pivot.y - PROFILE.top) / PROFILE.height) * BODY_ROWS - 0.5)));
  const restL = PROFILE.c[row] - PROFILE.a[row];
  const restR = PROFILE.c[row] + PROFILE.a[row];
  const across = (limb.pivot.x - restL) / Math.max(restR - restL, 1e-6);
  const x = TURNED.l[row] + across * (TURNED.r[row] - TURNED.l[row]);
  const shift = x - limb.pivot.x;
  const n = limb.d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  return {
    ...limb,
    d: `M${(n[0] + shift).toFixed(3)} ${n[1].toFixed(3)}L${(n[2] + shift).toFixed(3)} ${n[3].toFixed(3)}`,
    pivot: { x, y: limb.pivot.y },
  };
});

const EYE_POS = [
  { authoredX: 92.48, y: 96.29, mirror: 1 },
  { authoredX: 118.29, y: 90.3, mirror: -1 },
].map((e) => {
  // Measured against the body at rest: this is the eye's place on the head, before
  // the head is turned. Taking it off the turned outline would count the turn twice.
  const i = Math.round(((e.y - PROFILE.top) / PROFILE.height) * BODY_ROWS - 0.5);
  const row = Math.min(BODY_ROWS - 1, Math.max(0, i));
  return { y: e.y, mirror: e.mirror, authoredX: e.authoredX, restDX: e.authoredX - PROFILE.c[row] };
});

/** The authored dot is replaced by a polygon outline. The shapes themselves, and the
 * normalisation that lets any two of them interpolate, live in ./inkling/eye; what is
 * needed here is only the half-extents, for keeping the eye inside the silhouette. */
const EYE_HALF = { w: EYE_BOX.width / 2, h: EYE_BOX.height / 2 } as const;
/** The outline each eye holds until the first frame callback has run. */
const EYE_REST_D = EYE_POS.map((e) => eyePath(EYES.neutral.poly, e.authoredX, e.y, 1, 1, 0));
const BODY_PIVOT = { x: 102, y: 145 } as const;

/** [frequency, damping] per quantity. Under-damped squash is what makes the body read
 * as soft; a stiff lid makes the blink snap; loose x/y keep the drift floaty.
 */
const SPRING = {
  roll: [5, 0.9], tx: [3.5, 1], ty: [4, 1], squash: [10, 0.8],
  lid: [26, 1], eye: [9, 0.85], gaze: [13, 1], arm: [6, 0.75],
} as const;
const SUBSTEP = 1 / 120;

/** A blink is a lid target schedule, not a tween: the stiff lid spring shapes it.
 * The repeated key is the point — the lid is *held* shut for a beat before it opens
 * again. Without that hold a blink reads as a twitch, however fast the spring is.
 */
const BLINK_KEYS = [
  { at: 0, lid: 0.05 },
  { at: 85, lid: 0.05 },
  { at: 170, lid: 1.08 },
  { at: 320, lid: null },
] as const;
const DOUBLE_BLINK_CHANCE = 0.14;

/** A wink closes one eye on its own, and not symmetrically: the eye snaps shut over
 * the first part of the window and drifts back open over the longer rest. */
const WINK_MS = 340;
const WINK_SHUT = 0.4;
const WINK_EVERY: readonly [number, number] = [5200, 13000];

/** Per-eye idle drift. Two detuned sines across, one down, each phase-shifted by eye.
 * One shared gaze spring moves both eyes identically, which is exactly what makes a
 * pair of eyes read as a printed sticker rather than a face. */
const EYE_DRIFT = {
  ax: 1.45, rx: 0.47, bx: 0.52, rx2: 1.13, ay: 0.95, ry: 0.63, phase: 2.3,
} as const;
/** How far an eye shape change swells the eye on its way over. */
const MORPH_PULSE = 0.075;

interface Spring { x: number; v: number; t: number }
interface Motion {
  roll: Spring; tx: Spring; ty: Spring; sx: Spring; sy: Spring;
  lid: Spring; eyeScale: Spring; gazeX: Spring; gazeY: Spring;
  ew: Spring; eh: Spring; et: Spring; edy: Spring;
  arm: Spring[]; morph: Spring;
  /** The morph: the outline it came from, the one it is heading for, and the one it is
   * on now. Reused buffers — a worklet that allocates arrays every frame will stutter. */
  polyFrom: number[]; polyTo: number[]; polyNow: number[];
  clock: number; armClock: number; enteredAt: number;
  /** Last values this worklet acted on. Everything crossing from JS arrives as a
   * counter it compares against, never as a field JS writes into this object. */
  moodSeen: InklingMood; kickSeen: number;
  winkSeen: number; winkEye: number; winkT: number; morphSeen: number;
  pose: PoseOut;
}
interface Rendered {
  tx: number; ty: number; roll: number; sx: number; sy: number;
  arm: number[];
  /** One finished outline per eye, in viewBox units, and how visible it still is. */
  eyeD: string[]; eyeOn: number[];
}

function smoothstep(t: number) {
  'worklet';
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
}

/** Put one eye on the body. Everything here is resolved against the span at the eye's
 * own height, so the face follows the outline instead of floating over fixed numbers.
 */
function placeEye(index: number, cy: number, halfW: number, halfH: number) {
  'worklet';
  const e = EYE_POS[index];
  const sp = spanAt(cy);
  const centre = (sp.l + sp.r) / 2;
  // The circle the eye travels on is the body's own width at rest; turning moves the
  // eye around it, it does not resize it.
  const radius = Math.max(rowAt(PROFILE.a, cy), 12);
  const rest = Math.asin(Math.min(1, Math.max(-1, e.restDX / radius)));
  const turned = rest + FACE_TURN;
  const cosTurned = Math.cos(turned);
  const cosRest = Math.max(Math.cos(rest), EYE_BEHIND);
  // Narrowing is relative to the rest pose, so an eye that already sat near the edge
  // closes up faster than one that started face-on. Only narrowing is exaggerated.
  const ratio = Math.max(cosTurned, EYE_BEHIND) / cosRest;
  const squeeze = ratio <= 1 ? ratio ** FORESHORTEN : ratio;
  const raw = centre + radius * Math.sin(turned);

  // Keep the whole eye inside the outline: check the span at its top, middle and base.
  const hw = halfW * squeeze;
  let lo = -1e9;
  let hi = 1e9;
  for (let k = -1; k <= 1; k++) {
    const edge = spanAt(cy + k * halfH);
    if (edge.l + hw > lo) lo = edge.l + hw;
    if (edge.r - hw < hi) hi = edge.r - hw;
  }
  const held = lo <= hi ? Math.min(Math.max(raw, lo), hi) : (lo + hi) / 2;
  // Facing us, trust the clamp. Near the limb, let it ride out to the true projection:
  // clamping there would shove the eye back toward the middle and undo the turn.
  const confidence = smoothstep(cosTurned / 0.5);
  return {
    x: held + (raw - held) * (1 - confidence),
    squeeze,
    on: Math.min(1, Math.max(0, cosTurned / 0.12)),
  };
}

function spring(x: number): Spring {
  return { x, v: 0, t: x };
}
function step(s: Spring, freq: number, damp: number, dt: number) {
  'worklet';
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - s.t)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) {
    s.x = s.t;
    s.v = 0;
  }
}
function wave(t: number, rate: number, phase: number) {
  'worklet';
  return Math.sin(t * rate + phase) - Math.sin(phase);
}
function randomMs([min, max]: readonly [number, number]) {
  return min + Math.random() * (max - min);
}

function Arm({ limb, index, scale, size, out }: {
  limb: typeof ARMS[number];
  index: number;
  scale: number;
  size: { width: number; height: number };
  out: SharedValue<Rendered>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${out.value.arm[index]}deg` }],
  }));
  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { transformOrigin: [limb.pivot.x * scale, limb.pivot.y * scale, 0] }, style]}>
      <Svg width={size.width} height={size.height} viewBox={VIEW_BOX}>
        <Path d={limb.d} stroke={colors.text} strokeWidth={LIMB_STROKE} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Animated.View>
  );
}

function Eye({ index, out }: { index: number; out: SharedValue<Rendered> }) {
  const props = useAnimatedProps(() => ({
    d: out.value.eyeD[index],
    fillOpacity: out.value.eyeOn[index],
  }));
  return <AnimatedPath animatedProps={props} fill={colors.bg} />;
}

export function InklingCharacter({ width, mood = 'idle', blinkSignal = 0, beatSignal = 0, style }: {
  width: number;
  mood?: InklingMood;
  /** Increment to blink right now, regardless of the state's cadence. */
  blinkSignal?: number;
  /** Increment to fire the state's beat right now. */
  beatSignal?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = width / VIEW.width;
  const height = VIEW.height * scale;
  const size = { width, height };
  const reduceMotion = useReducedMotion();

  const moodRef = useSharedValue<InklingMood>(mood);
  const lidOverride = useSharedValue<number | null>(null);
  const gazeAim = useSharedValue({ x: GAZE[mood].x, y: GAZE[mood].y });
  const eyeShape = useSharedValue<EyeShape>(EYES[EYE_PLAYLIST[mood][0]]);
  /** Bumped by JS; the frame callback reads the counters, never the other way round. */
  const winkSignal = useSharedValue({ n: 0, eye: 0 });
  const morphSignal = useSharedValue(0);
  /** Bumped by JS to fire a beat. A counter rather than an impulse written into
   * `motion`: that object has been handed to a worklet, and writing into it from JS
   * is unsupported — reanimated warns, and the write is not guaranteed to land. */
  const kickSignal = useSharedValue(0);
  const eyeIndex = useRef(0);

  /** Mutated in place every frame; no style reads it, so it needs no notification. */
  const motion = useSharedValue<Motion>({
    roll: spring(0), tx: spring(0), ty: spring(0), sx: spring(1), sy: spring(1),
    lid: spring(1), eyeScale: spring(1), gazeX: spring(0), gazeY: spring(0),
    ew: spring(1), eh: spring(1), et: spring(0), edy: spring(0),
    arm: LIMBS.map(() => spring(0)), morph: spring(1),
    polyFrom: [...EYES.neutral.poly],
    polyTo: [...EYES.neutral.poly],
    polyNow: [...EYES.neutral.poly],
    clock: 0, armClock: 0, enteredAt: 0,
    moodSeen: mood, kickSeen: 0,
    winkSeen: 0, winkEye: -1, winkT: 0, morphSeen: 0,
    pose: { roll: 0, tx: 0, ty: 0, sx: 1, sy: 1, lid: 1, eyeScale: 1, arm: 0, armSwing: 0, armRate: 1, lift: 0 },
  });
  /** Reassigned every frame; this is what the styles read. */
  const out = useSharedValue<Rendered>({
    tx: 0, ty: 0, roll: 0, sx: 1, sy: 1, arm: LIMBS.map(() => 0),
    eyeD: EYE_REST_D, eyeOn: EYE_POS.map(() => 1),
  });

  useEffect(() => {
    moodRef.value = mood;
    eyeIndex.current = 0;
  }, [mood, moodRef]);

  useFrameCallback((frame) => {
    'worklet';
    if (frame.timeSincePreviousFrame == null) return;
    const dt = Math.min(frame.timeSincePreviousFrame / 1000, 0.1);
    const m = motion.value;
    const rest = reduceMotion;
    // The state's entry clock restarts here rather than being zeroed from JS, for the
    // same reason as the beat: this object belongs to the worklet.
    if (moodRef.value !== m.moodSeen) {
      m.moodSeen = moodRef.value;
      m.enteredAt = 0;
    }
    m.enteredAt += dt;
    m.clock += rest ? 0 : dt;

    poseFor(moodRef.value, m.clock, m.enteredAt, m.pose);
    const p = m.pose;
    m.armClock += rest ? 0 : dt * p.armRate;

    m.roll.t = rest ? 0 : p.roll;
    m.tx.t = rest ? 0 : p.tx;
    m.ty.t = rest ? 0 : p.ty;
    m.sx.t = rest ? 1 : p.sx;
    m.sy.t = rest ? 1 : p.sy;
    m.lid.t = rest ? 1 : (lidOverride.value ?? p.lid);
    m.eyeScale.t = rest ? 1 : p.eyeScale;
    m.gazeX.t = rest ? 0 : gazeAim.value.x;
    m.gazeY.t = rest ? 0 : gazeAim.value.y;
    // A shape change hands the morph a new destination. The origin is the outline on
    // screen this frame, not the shape it was heading for, so a change that arrives
    // mid-morph still starts from what the viewer can actually see.
    const shape = eyeShape.value;
    if (morphSignal.value !== m.morphSeen) {
      m.morphSeen = morphSignal.value;
      for (let i = 0; i < m.polyFrom.length; i++) m.polyFrom[i] = m.polyNow[i];
      for (let i = 0; i < m.polyTo.length; i++) m.polyTo[i] = shape.poly[i];
      m.morph.x = 0;
      m.morph.v = 0;
    }
    m.morph.t = 1;
    const w = winkSignal.value;
    if (w.n !== m.winkSeen) {
      m.winkSeen = w.n;
      m.winkEye = w.eye;
      m.winkT = 0;
    }
    if (m.winkEye >= 0) {
      m.winkT += dt;
      if (m.winkT * 1000 > WINK_MS) m.winkEye = -1;
    }

    m.ew.t = rest ? 1 : shape.w;
    m.eh.t = rest ? 1 : shape.h;
    m.et.t = rest ? 0 : shape.tilt;
    m.edy.t = rest ? 0 : shape.dy;
    for (let i = 0; i < ARMS.length; i++) {
      const limb = ARMS[i];
      m.arm[i].t = limb.neutral + (rest ? 0
        : (p.arm + wave(m.armClock, limb.rate, limb.phase) * p.armSwing) * limb.sign);
    }

    // A beat is a velocity impulse, so it kicks and settles instead of tweening. The
    // count is the number of beats fired since the last frame, so two that land in the
    // same frame still deliver two beats' worth rather than one.
    if (kickSignal.value !== m.kickSeen) {
      const beats = kickSignal.value - m.kickSeen;
      m.kickSeen = kickSignal.value;
      const beat = BEAT[moodRef.value];
      if (beat && !rest) {
        m.tx.v += beat.tx * beats;
        m.ty.v += beat.ty * beats;
        m.roll.v += beat.roll * beats;
      }
    }

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      step(m.roll, SPRING.roll[0], SPRING.roll[1], h);
      step(m.tx, SPRING.tx[0], SPRING.tx[1], h);
      step(m.ty, SPRING.ty[0], SPRING.ty[1], h);
      step(m.sx, SPRING.squash[0], SPRING.squash[1], h);
      step(m.sy, SPRING.squash[0], SPRING.squash[1], h);
      step(m.lid, SPRING.lid[0], SPRING.lid[1], h);
      step(m.eyeScale, SPRING.eye[0], SPRING.eye[1], h);
      step(m.gazeX, SPRING.gaze[0], SPRING.gaze[1], h);
      step(m.gazeY, SPRING.gaze[0], SPRING.gaze[1], h);
      step(m.ew, SPRING.eye[0], SPRING.eye[1], h);
      step(m.eh, SPRING.eye[0], SPRING.eye[1], h);
      step(m.et, SPRING.eye[0], SPRING.eye[1], h);
      step(m.edy, SPRING.eye[0], SPRING.eye[1], h);
      for (let k = 0; k < m.arm.length; k++) step(m.arm[k], SPRING.arm[0], SPRING.arm[1], h);
      step(m.morph, SPRING.eye[0], SPRING.eye[1], h);
    }

    // The morph spring runs the outline itself; the pulse swells it on the way over so
    // a change of expression has a moment of its own instead of a slide.
    const mt = Math.min(1, Math.max(0, m.morph.x));
    lerpPoly(m.polyFrom, m.polyTo, mt, m.polyNow);
    const pulse = 1 + MORPH_PULSE * Math.sin(mt * Math.PI);
    const baseW = m.ew.x * m.eyeScale.x * pulse;
    const baseH = m.eh.x * m.eyeScale.x * pulse;
    const eyeD: string[] = [];
    const eyeOn: number[] = [];
    for (let i = 0; i < EYE_POS.length; i++) {
      const ph = i * EYE_DRIFT.phase;
      const driftX = rest ? 0
        : Math.sin(m.clock * EYE_DRIFT.rx + ph) * EYE_DRIFT.ax
          + Math.sin(m.clock * EYE_DRIFT.rx2 + ph * 2) * EYE_DRIFT.bx;
      const driftY = rest ? 0 : Math.sin(m.clock * EYE_DRIFT.ry + ph) * EYE_DRIFT.ay;
      // A wink is one eye's own lid, on its own asymmetric curve.
      let lidMul = 1;
      if (m.winkEye === i) {
        const u = (m.winkT * 1000) / WINK_MS;
        lidMul = Math.max(u < WINK_SHUT ? 1 - u / WINK_SHUT : (u - WINK_SHUT) / (1 - WINK_SHUT), 0.05);
      }
      const h = baseH * m.lid.x * lidMul;
      const cy = EYE_POS[i].y + m.gazeY.x + m.edy.x + driftY;
      const placed = placeEye(i, cy, EYE_HALF.w * baseW, EYE_HALF.h * h);
      const cx = placed.x + (m.gazeX.x + driftX) * Math.max(placed.squeeze, 0.2);
      eyeD.push(eyePath(m.polyNow, cx, cy, baseW * placed.squeeze, h, m.et.x * EYE_POS[i].mirror));
      eyeOn.push(placed.on);
    }

    out.value = {
      tx: m.tx.x * scale,
      // The hop's lift lands here rather than on the ty spring: a spring chasing it
      // would round off the launch and swallow the apex.
      ty: (m.ty.x - (rest ? 0 : m.pose.lift)) * scale,
      roll: m.roll.x,
      sx: m.sx.x,
      sy: m.sy.x,
      arm: [m.arm[0].x, m.arm[1].x],
      eyeD, eyeOn,
    };
  }, true);

  // Blink: a schedule of lid targets. The stiff lid spring gives it its snap.
  const blink = useCallback((timers: ReturnType<typeof setTimeout>[]) => {
    const run = (offset: number) => {
      for (const key of BLINK_KEYS) {
        timers.push(setTimeout(() => { lidOverride.value = key.lid; }, offset + key.at));
      }
    };
    run(0);
    if (Math.random() < DOUBLE_BLINK_CHANCE) run(370);
  }, [lidOverride]);

  useEffect(() => {
    const cadence = BLINK_EVERY[mood];
    if (reduceMotion || !cadence) {
      lidOverride.value = null;
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = () => {
      timers.push(setTimeout(() => { blink(timers); schedule(); }, randomMs(cadence)));
    };
    schedule();
    return () => { timers.forEach(clearTimeout); lidOverride.value = null; };
  }, [blink, lidOverride, mood, reduceMotion]);

  useEffect(() => {
    if (!blinkSignal || reduceMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    blink(timers);
    return () => timers.forEach(clearTimeout);
  }, [blink, blinkSignal, reduceMotion]);

  // Eye shape: each state cycles its own playlist, holding each for its own span.
  useEffect(() => {
    const list = EYE_PLAYLIST[mood];
    eyeShape.value = EYES[list[0]];
    morphSignal.value += 1;
    if (reduceMotion || list.length < 2) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        eyeIndex.current = (eyeIndex.current + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
        eyeShape.value = EYES[list[eyeIndex.current]];
        morphSignal.value += 1;
        next();
      }, randomMs(EYE_HOLD[mood]));
    };
    next();
    return () => clearTimeout(timer);
  }, [eyeShape, mood, morphSignal, reduceMotion]);

  // Wink: one eye, on its own interval, never while the pair is mid-blink.
  useEffect(() => {
    if (reduceMotion || !BLINK_EVERY[mood]) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        winkSignal.value = {
          n: winkSignal.value.n + 1,
          eye: Math.random() < 0.5 ? 0 : 1,
        };
        schedule();
      }, randomMs(WINK_EVERY));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [mood, reduceMotion, winkSignal]);

  // Gaze: pick a place to look, hold it, pick another. The spring does the move.
  useEffect(() => {
    const g = GAZE[mood];
    if (reduceMotion) {
      gazeAim.value = { x: 0, y: 0 };
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    const look = () => {
      gazeAim.value = {
        x: g.x + (Math.random() * 2 - 1) * g.wanderX,
        y: g.y + (Math.random() * 2 - 1) * g.wanderY,
      };
      timer = setTimeout(look, randomMs(g.hold));
    };
    look();
    return () => clearTimeout(timer);
  }, [gazeAim, mood, reduceMotion]);

  // Beat: nod, lunge, hop, flinch, sigh. Injected as velocity on a random interval.
  const kick = useCallback(() => {
    kickSignal.value = kickSignal.value + 1;
  }, [kickSignal]);

  useEffect(() => {
    const beat = BEAT[mood];
    if (reduceMotion || !beat) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { kick(); schedule(); }, randomMs(beat.every));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [kick, mood, reduceMotion]);

  useEffect(() => {
    if (!beatSignal || reduceMotion) return;
    kick();
  }, [beatSignal, kick, reduceMotion]);

  const stageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: out.value.tx },
      { translateY: out.value.ty },
      { rotate: `${out.value.roll}deg` },
    ],
  }));
  const bodyStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: out.value.sx }, { scaleY: out.value.sy }],
  }));

  return (
    <View accessible={false} pointerEvents="none" style={[size, style]}>
      <Animated.View style={[size, stageStyle]}>
        {ARMS.map((limb, index) => (
          <Arm key={limb.id} limb={limb} index={index} scale={scale} size={size} out={out} />
        ))}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { transformOrigin: [BODY_PIVOT.x * scale, BODY_PIVOT.y * scale, 0] },
            bodyStyle,
          ]}>
          <Svg width={size.width} height={size.height} viewBox={VIEW_BOX}>
            <Path d={BODY_TURNED} fill={colors.text} />
            {EYE_POS.map((_, index) => (
              <Eye key={index} index={index} out={out} />
            ))}
          </Svg>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

