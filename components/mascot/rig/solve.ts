import { radius } from '@/theme/spacing';
/** One frame of the rig: where every part is, given where the body is going.
 *
 * It runs in three passes, and the order is the point.
 *
 * 1. The pose. The mood's resting pose, its rhythm (breath, bob, hop, wag) and its
 *    events (blink, wink, a new place to look, a kick) make a target for every
 *    channel, and each channel's spring chases its target. This is the part of the
 *    motion somebody chose.
 *
 * 2. The links. Nothing in pass one knows the parts are attached to each other.
 *    This pass does. The horns, the tail, the hands and the marks are hung off
 *    points on the body, and each one is moved by what its own attachment point is
 *    actually doing this frame — so a tail does not have to be told the body
 *    hopped, and it trails a drag of the finger exactly as it trails a breath. The
 *    links also run backwards where a body would feel them: the eyes lead a look
 *    and the face and the lean follow it, and a swinging tail rocks the body a
 *    little the other way.
 *
 * 3. The drawing. Every part is turned into the matrix or the shape the renderer
 *    hands to its SVG element.
 *
 * Everything is a plain function over plain data so it can run on the UI thread,
 * and so it can be run with no screen at all to measure what it does.
 */
import { RIG_MEASURE } from './art';
import {
  CH, CHANNEL_COUNT, EYE, FACE_TURN, GROUND_Y, HAND, HAND_LEVEL, HORN, LOOK_REACH, MARK, MOUTH_Y,
  RIG_MOODS, RIG_PART_INDEX, SPRING_DAMP, SPRING_FIXED, SPRING_FREQ, TAIL_BONES, TAIL_ROOT,
  type HopSpec, type MascotMood,
} from './rig';

const DEG = Math.PI / 180;
const SUBSTEP = 1 / 120;

// How a hop's time is spent: crouch, rise, fall, land, and still on the ground.
const HOP_BEATS = [0.17, 0.23, 0.26, 0.14, 0.2] as const;

// A blink, in seconds: shut and held, then open past rest so it comes back with a
// flick, then let go.
const BLINK_HELD = 0.17;
const BLINK_FLICK = 0.32;
const BLINK_AGAIN = 0.37;
const DOUBLE_BLINK_CHANCE = 0.14;
/** Longer than a blink, which is the whole difference: a blink is involuntary and a
 * wink is addressed to someone. */
const WINK_S = 0.42;

/** The links, one tuning each.
 *
 * A trailing part is a spring chasing where its attachment says it should be, with
 * `drag` turning the attachment's speed into an angle it is blown back by. `drag`
 * is a time: how far behind, in seconds, the part would sit at a steady speed. */
const LINK = {
  // The horns are stiff, so they barely trail; what they do is splay when the body
  // flattens and draw in when it stretches, and sink a little into the head on the
  // way up.
  horn: { freq: 12, damp: 0.36, drag: 0.1, max: 16, splay: 62, slide: 0.022, slideMax: 3.2 },
  // Three bones, each looser and further behind than the one it hangs from, which is
  // what makes a movement travel down the tail instead of turning it as one piece.
  tail: [
    { freq: 9.5, damp: 0.42, drag: 0.1, max: 24, wag: 0.2, phase: 0 },
    { freq: 7.5, damp: 0.36, drag: 0.16, max: 30, wag: 0.3, phase: 0.9 },
    { freq: 6, damp: 0.32, drag: 0.22, max: 36, wag: 0.5, phase: 1.8 },
  ],
  /** How much of the body's lean the tail takes on. */
  tailLean: 0.4,
  // A hand rests on the outline, so it is carried by it, a beat late.
  // `planted` is how much of the body's movement a hand keeps when it is resting on
  // something the screen has put in front of the body.
  hand: { freq: 13, damp: 0.46, tilt: 0.12, tiltMax: 14, planted: 0.25 },
  // The face is on the surface of a soft body: it slips back a little when the body
  // jumps and catches up.
  face: { freq: 10, damp: 0.5, slip: 0.035, max: 3.5 },
  // The eyes move first. The face follows on this spring, and the body leans after.
  head: { freq: 5.5, damp: 0.75, lean: 1.6, shift: 1.2, horn: 1.5 },
  // The marks hang in the air beside the character: they keep its rhythm at a
  // fraction of its size, late.
  mark: { freq: 4.5, damp: 0.45, follow: 0.45, roll: 0.35 },
  // What the tail does to the body: degrees of lean per degree of swing at the tip.
  recoil: { gain: 0.045, max: 1.6 },
} as const;

/** Idle drift of the pupils, in artwork units: three detuned sines, so the eyes are
 * never quite still and never loop. */
const EYE_DRIFT = { ax: 0.56, rx: 0.47, bx: 0.2, rx2: 1.13, ay: 0.36, ry: 0.63 } as const;
const VOLUME = 0.9;
const DRIFT_S = 2.6;

interface Spring { x: number; v: number }

/** Everything the solver remembers between frames. */
export interface RigState {
  ready: boolean;
  clock: number;
  mood: MascotMood;
  face: number;
  /** One spring per channel. */
  cur: number[]; vel: number[]; tgt: number[];
  // Events, as times on the clock.
  blinkAt: number; blinkT: number; blinkLeft: number;
  winkAt: number; winkT: number; winkSide: number;
  gazeAt: number; aimX: number; aimY: number;
  beatAt: number; faceAt: number;
  // Counters last seen from the other thread.
  blinkSeen: number; winkSeen: number; beatSeen: number; pokeSeen: number;
  // The links.
  headX: Spring; headY: Spring;
  slipX: Spring; slipY: Spring;
  hornL: Spring; hornR: Spring; slideL: Spring; slideR: Spring;
  tail: Spring[];
  handLX: Spring; handLY: Spring; handRX: Spring; handRY: Spring;
  markX: Spring; markY: Spring; markR: Spring;
  recoil: number;
  /** Last frame's attachment points, and their smoothed velocities: body, horn L,
   * horn R, tail root, tail joint 1, tail joint 2, hand L, hand R — x then y. */
  at: number[]; speed: number[];
}

/** What the component tells the solver each frame. */
export interface RigInput {
  mood: MascotMood;
  /** Hold the rest pose: the system's reduce-motion setting. */
  still: boolean;
  /** Whether the parts are linked. Off, every part is welded to the body, which is
   * only useful for seeing what the links are doing. */
  linked: boolean;
  /** Whether the mood may drift between its faces. */
  drift: boolean;
  /** Offsets added to the pose, one per channel: the lab's hands on the parts. */
  tweak: number[];
  /** Where the body has been dragged to, in artwork units. */
  dragX: number; dragY: number;
  lookX: number; lookY: number;
  blink: number; wink: number; beat: number;
  poke: number; pokePart: number;
  debug: boolean;
  /** Hold one face: no drift, no blink and no wink of its own. */
  calm?: boolean;
  /** Hold both eyes shut, over everything else. */
  eyesShut?: boolean;
  /** A fixed lean, in degrees, on top of the mood's. */
  tilt?: number;
  /** Whether the hands are drawn: 1 or 0 to say so, anything else to let the mood. */
  hands?: number;
  /** The hands rest at one height, on a level edge, rather than as the frame poses
   * them. */
  level?: boolean;
  /** A screen's own correction to where each hand rests: pushed out from the body's
   * centre, in artwork units, and slid round the outline, in degrees clockwise. */
  handOutL?: number; handTurnL?: number; handOutR?: number; handTurnR?: number;
  /** The tail's root, moved from where the drawing puts it. */
  tailX?: number; tailY?: number;
  /** How much of the mood's own wandering gaze to keep: 1 by default, 0 for a
   * surface that is aiming the eyes at something itself. */
  wander?: number;
}

/** What the renderer draws. Matrices are [a, b, c, d, tx, ty]. */
export interface RigFrame {
  tailD: string; tailTip: number[];
  hornL: number[]; hornR: number[];
  body: number[]; bodyRx: number; bodyRy: number;
  /** `eye` places the closed line and the wink; `ball` is the same, narrowed, and
   * holds the white, the pupil and the lids. */
  eyeL: number[]; eyeR: number[]; ballL: number[]; ballR: number[];
  pupilL: number[]; pupilR: number[];
  lidL: number[]; lidR: number[]; lowL: number[]; lowR: number[];
  whiteL: number; whiteR: number;
  lashL: string; lashR: string; lashLO: number; lashRO: number;
  winkL: number[]; winkR: number[]; winkLO: number; winkRO: number;
  mouth: number[]; mouthRx: number; mouthRy: number; mouthO: number;
  mouthArc: number[]; mouthArcO: number;
  handL: number[]; handR: number[]; handsO: number;
  spark: number[]; sparkO: number;
  question: number[]; questionO: number;
  zzz: number[]; zzzO: number;
  badge: number[]; badgeO: number;
  debug: string;
}

function s0(x: number): Spring { return { x, v: 0 }; }

export function createRigState(mood: MascotMood): RigState {
  const rest = RIG_MOODS[mood].faces[0];
  return {
    ready: false, clock: 0, mood, face: 0,
    cur: rest.slice(), vel: rest.map(() => 0), tgt: rest.slice(),
    blinkAt: 0, blinkT: -1, blinkLeft: 0,
    winkAt: 0, winkT: -1, winkSide: 1,
    gazeAt: 0, aimX: 0, aimY: 0, beatAt: 0, faceAt: 0,
    blinkSeen: 0, winkSeen: 0, beatSeen: 0, pokeSeen: 0,
    headX: s0(0), headY: s0(0), slipX: s0(0), slipY: s0(0),
    hornL: s0(0), hornR: s0(0), slideL: s0(0), slideR: s0(0),
    tail: [s0(0), s0(0), s0(0)],
    handLX: s0(0), handLY: s0(0), handRX: s0(0), handRY: s0(0),
    markX: s0(0), markY: s0(0), markR: s0(0),
    recoil: 0,
    at: new Array(16).fill(0), speed: new Array(16).fill(0),
  };
}

function step(s: Spring, target: number, freq: number, damp: number, dt: number) {
  'worklet';
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - target)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = target; s.v = 0; }
}
/** Offset by its own value at t = 0, so a mood's first frame is its rest pose. */
function wave(t: number, rate: number, phase: number) {
  'worklet';
  return Math.sin(t * rate + phase) - Math.sin(phase);
}
function between(range: readonly [number, number]) {
  'worklet';
  return (range[0] + Math.random() * (range[1] - range[0])) / 1000;
}
function clamp(x: number, lo: number, hi: number) {
  'worklet';
  return x < lo ? lo : x > hi ? hi : x;
}
/** A limit that is approached rather than hit, so a part pushed hard slows into its
 * stop instead of banging against it. */
function soft(x: number, max: number) {
  'worklet';
  return max * Math.tanh(x / max);
}
function n2(n: number) {
  'worklet';
  return Math.round(n * 100) / 100;
}
/** Translate, then turn, then scale: the matrix for a part whose pivot is its own
 * origin. */
function trs(x: number, y: number, deg: number, sx: number, sy: number) {
  'worklet';
  const c = Math.cos(deg * DEG), s = Math.sin(deg * DEG);
  return [c * sx, s * sx, -s * sy, c * sy, x, y];
}

/** A hop at `clock`: writes the lift into `out[0]` and returns the squash. */
function hopAt(h: HopSpec, clock: number, out: number[]): number {
  'worklet';
  const b = HOP_BEATS;
  const total = b[0] + b[1] + b[2] + b[3] + b[4];
  let u = ((clock * h.rate) % 1) * total;
  if (u < 0) u += total;
  // Crouch: gathering, and the squash that anticipates the launch.
  if (u < b[0]) { const s = u / b[0]; out[0] = -h.crouch * s * s; return 1 - h.squash * s * s; }
  u -= b[0];
  // Rise: fast off the ground, decelerating into the apex, stretched.
  if (u < b[1]) {
    const s = u / b[1];
    out[0] = -h.crouch + (h.height + h.crouch) * (1 - (1 - s) * (1 - s));
    return 1 + h.squash * 1.3 * (1 - s) * (1 - s);
  }
  u -= b[1];
  // Fall: accelerating back down, straightening out.
  if (u < b[2]) { const s = u / b[2]; out[0] = h.height * (1 - s * s); return 1 + h.squash * 0.35 * s * s; }
  u -= b[2];
  // Land: the impact, absorbed.
  if (u < b[3]) { const s = u / b[3]; const k = 1 - s; out[0] = 0; return 1 - h.squash * 1.6 * k * k; }
  out[0] = 0;
  return 1;
}

function startBlink(S: RigState, twice: boolean) {
  'worklet';
  if (S.blinkT >= 0) return;
  S.blinkT = 0;
  S.blinkLeft = twice ? 1 : 0;
}

const A0 = TAIL_BONES[0].angle, A1 = TAIL_BONES[1].angle, A2 = TAIL_BONES[2].angle;
const L0 = TAIL_BONES[0].length, L1 = TAIL_BONES[1].length, L2 = TAIL_BONES[2].length;
const EYE_RX = { L: RIG_MEASURE.eyeL.rx, R: RIG_MEASURE.eyeR.rx };
const EYE_RY = { L: RIG_MEASURE.eyeL.ry, R: RIG_MEASURE.eyeR.ry };
const PUPIL = RIG_MEASURE.pupil;
const MOUTH = RIG_MEASURE.mouthO;
/** Half the width of a closed eye's line, and how far its handles sit in. */
const LASH_HALF = 17.5;
const LASH_HANDLE = 8.5;
/** How much narrower the white gets as it closes, and how open an eye still is when
 * the white is dropped and the line is all that is drawn. */
const PINCH = 0.24;
const SHUT = 0.2;

export function solveRig(S: RigState, I: RigInput, elapsed: number): RigFrame {
  'worklet';
  const spec = RIG_MOODS[I.mood];
  const still = I.still;
  const linked = I.linked && !still;
  const dt = Math.min(Math.max(elapsed, 0), 0.1);

  // --- Pass one: the pose ------------------------------------------------------

  if (I.mood !== S.mood || !S.ready) {
    S.mood = I.mood;
    S.face = 0;
    S.blinkT = -1; S.winkT = -1;
    S.blinkAt = S.clock + (spec.blink ? between(spec.blink) : 0);
    S.winkAt = S.clock + (spec.wink ? between(spec.wink) : 0);
    S.beatAt = S.clock + (spec.beat ? between(spec.beat.every) : 0);
    S.faceAt = S.clock + (spec.faceHold ? between(spec.faceHold) : 0);
    S.gazeAt = S.clock + between(spec.gaze.hold) * 0.5;
    S.aimX = 0; S.aimY = 0;
  }
  if (!still) S.clock += dt;
  const t = S.clock;

  let kicks = 0;
  if (!still) {
    const calm = !!I.calm;
    if (spec.blink && t >= S.blinkAt) {
      S.blinkAt = t + between(spec.blink);
      if (!calm) startBlink(S, Math.random() < DOUBLE_BLINK_CHANCE);
    }
    if (I.blink !== S.blinkSeen) { S.blinkSeen = I.blink; startBlink(S, false); }
    if (spec.wink && t >= S.winkAt) {
      S.winkAt = t + between(spec.wink);
      if (S.blinkT < 0 && !calm) { S.winkT = 0; S.winkSide = Math.random() < 0.5 ? -1 : 1; }
    }
    if (I.wink !== S.winkSeen) {
      S.winkSeen = I.wink; S.winkT = 0; S.winkSide = Math.random() < 0.5 ? -1 : 1;
    }
    // Pick a place to look, hold it, pick another. A big move of the eyes takes a
    // blink with it about half the time, which is what eyes do.
    if (t >= S.gazeAt) {
      S.gazeAt = t + between(spec.gaze.hold);
      const nx = (Math.random() * 2 - 1) * spec.gaze.wanderX;
      const ny = (Math.random() * 2 - 1) * spec.gaze.wanderY;
      if (spec.blink && !calm && Math.abs(nx - S.aimX) > 0.45 && Math.random() < 0.5) startBlink(S, false);
      S.aimX = nx; S.aimY = ny;
    }
    if (spec.beat && t >= S.beatAt) { S.beatAt = t + between(spec.beat.every); kicks += 1; }
    if (I.beat !== S.beatSeen) { kicks += I.beat - S.beatSeen; S.beatSeen = I.beat; }
    // Drift to the mood's next face. It goes through a blink because that is how a
    // face changes its mind, not because anything needs hiding any more.
    if (I.drift && !calm && spec.faceHold && spec.faces.length > 1 && t >= S.faceAt) {
      S.faceAt = t + between(spec.faceHold);
      S.face = (S.face + 1) % spec.faces.length;
      if (spec.blink) startBlink(S, false);
    }
  } else {
    S.blinkSeen = I.blink; S.winkSeen = I.wink; S.beatSeen = I.beat;
    S.blinkT = -1; S.winkT = -1; S.face = 0;
  }
  if (!I.drift || I.calm) S.face = 0;

  const rest = spec.faces[S.face];
  const tgt = S.tgt;
  for (let i = 0; i < CHANNEL_COUNT; i++) tgt[i] = rest[i];

  const lift = [0];
  let shake = 0;
  let wagAmp = 0;
  if (!still) {
    tgt[CH.y] += wave(t, spec.bob[1], 0.4) * spec.bob[0];
    if (spec.sway) tgt[CH.rot] += wave(t, spec.sway[1], 0) * spec.sway[0];
    let squash = tgt[CH.squash] + wave(t, spec.breath[1], 0) * spec.breath[0];
    if (spec.hop) squash *= hopAt(spec.hop, t, lift);
    tgt[CH.squash] = squash;
    if (spec.shake) shake = Math.sin(t * spec.shake[1]) * spec.shake[0];
    if (spec.handSwing) tgt[CH.handLift] += wave(t, spec.handSwing[1], 0.7) * spec.handSwing[0];
    wagAmp = spec.wag[0];
    const wander = I.wander ?? 1;
    tgt[CH.lookX] = clamp(tgt[CH.lookX] + S.aimX * wander + I.lookX, -1.2, 1.2);
    tgt[CH.lookY] = clamp(tgt[CH.lookY] + S.aimY * wander + I.lookY, -1.2, 1.2);

    if (S.blinkT >= 0) {
      S.blinkT += dt;
      const lid = S.blinkT < BLINK_HELD ? 0.03 : S.blinkT < BLINK_FLICK ? 1.08 : -1;
      if (lid >= 0) {
        tgt[CH.openL] = lid < 1 ? Math.min(tgt[CH.openL], lid) : tgt[CH.openL] * lid;
        tgt[CH.openR] = lid < 1 ? Math.min(tgt[CH.openR], lid) : tgt[CH.openR] * lid;
      }
      if (S.blinkT >= BLINK_AGAIN) {
        if (S.blinkLeft > 0) { S.blinkLeft -= 1; S.blinkT = 0; } else S.blinkT = -1;
      }
    }
    if (S.winkT >= 0) {
      S.winkT += dt;
      if (S.winkSide < 0) { tgt[CH.openL] = 0; tgt[CH.winkL] = 1; } else { tgt[CH.openR] = 0; tgt[CH.winkR] = 1; }
      if (S.winkT >= WINK_S) S.winkT = -1;
    }
  }

  if (I.hands === 0 || I.hands === 1) tgt[CH.hands] = I.hands;
  // Covering the eyes outranks everything: while it is held nothing may open them.
  if (I.eyesShut) { tgt[CH.openL] = 0; tgt[CH.openR] = 0; tgt[CH.winkL] = 0; tgt[CH.winkR] = 0; }

  const cur = S.cur, vel = S.vel;
  if (!S.ready) {
    for (let i = 0; i < CHANNEL_COUNT; i++) { cur[i] = tgt[i]; vel[i] = 0; }
  }

  // A kick is velocity, so it lands and settles instead of being tweened to.
  if (kicks > 0 && spec.beat && !still) {
    vel[CH.y] += spec.beat.y * 5 * kicks;
    vel[CH.rot] += spec.beat.rot * 1.6 * kicks;
    // The marks restart their pop on the same impulse that moves the body.
    if (rest[CH.spark] > 0) { cur[CH.spark] = 0.3; vel[CH.spark] = 0; }
    if (rest[CH.badge] > 0) { vel[CH.badge] += 3; }
  }
  // A poke from the lab: velocity into one part, and nothing else.
  let pokeHorn = 0, pokeTail = 0, pokeHand = 0;
  if (I.poke !== S.pokeSeen) {
    S.pokeSeen = I.poke;
    const p = I.pokePart;
    if (!still) {
      if (p === RIG_PART_INDEX.body) { vel[CH.squash] -= 2.4; vel[CH.rot] += 30; }
      else if (p === RIG_PART_INDEX.hornL) pokeHorn = -1;
      else if (p === RIG_PART_INDEX.hornR) pokeHorn = 1;
      else if (p === RIG_PART_INDEX.eyeL) { S.winkT = 0; S.winkSide = -1; }
      else if (p === RIG_PART_INDEX.eyeR) { S.winkT = 0; S.winkSide = 1; }
      else if (p === RIG_PART_INDEX.lids) startBlink(S, true);
      else if (p === RIG_PART_INDEX.pupils) {
        S.aimX = S.aimX > 0 ? -0.9 : 0.9; S.aimY = -0.2; S.gazeAt = t + 1.2;
      }
      else if (p === RIG_PART_INDEX.tail) pokeTail = 1;
      else if (p === RIG_PART_INDEX.handL) pokeHand = -1;
      else if (p === RIG_PART_INDEX.handR) pokeHand = 1;
      else if (p === RIG_PART_INDEX.mouth) { vel[CH.mouthO] += 14; vel[CH.mouthArc] -= 10; }
      else if (p === RIG_PART_INDEX.marks) {
        cur[CH.spark] *= 0.3; cur[CH.question] *= 0.3; cur[CH.badge] *= 0.3;
      }
    }
  }

  const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
  const h = dt / steps;
  const tempo = spec.tempo ?? 1;
  for (let k = 0; k < steps; k++) {
    for (let i = 0; i < CHANNEL_COUNT; i++) {
      const f = SPRING_FIXED[i] ? SPRING_FREQ[i] : SPRING_FREQ[i] * tempo;
      vel[i] += (-2 * SPRING_DAMP[i] * f * vel[i] - f * f * (cur[i] - tgt[i])) * h;
      cur[i] += vel[i] * h;
      if (!Number.isFinite(cur[i]) || !Number.isFinite(vel[i])) { cur[i] = tgt[i]; vel[i] = 0; }
    }
  }
  const w = I.tweak;
  const P = (i: number) => {
    return cur[i] + (w[i] ?? 0);
  };

  // --- Pass two: the links -----------------------------------------------------

  // The eyes lead. The head is a slower spring chasing where they look, and what
  // the face and the body do about a look, they do from the head.
  const lookX = P(CH.lookX), lookY = P(CH.lookY);
  if (linked) {
    for (let k = 0; k < steps; k++) {
      step(S.headX, lookX, LINK.head.freq * tempo, LINK.head.damp, h);
      step(S.headY, lookY, LINK.head.freq * tempo, LINK.head.damp, h);
    }
  } else { S.headX.x = lookX; S.headX.v = 0; S.headY.x = lookY; S.headY.v = 0; }
  const headX = S.headX.x, headY = S.headY.x;

  // The body.
  const sy = clamp(P(CH.squash), 0.5, 1.6);
  const sx = 1 + (1 - sy) * VOLUME;
  const lean = linked ? headX * LINK.head.lean + S.recoil : 0;
  const rot = P(CH.rot) + lean + (I.tilt ?? 0);
  const px = P(CH.x) + shake + I.dragX + (linked ? headX * LINK.head.shift : 0);
  const py = P(CH.y) - lift[0] + I.dragY;
  const cr = Math.cos(rot * DEG), sr = Math.sin(rot * DEG);
  // A point on the body, carried by its squash and its lean about the ground.
  const bx = (lx: number, ly: number) => {
    return px + lx * sx * cr - (ly - GROUND_Y) * sy * sr;
  };
  const by = (lx: number, ly: number) => {
    return py + GROUND_Y + lx * sx * sr + (ly - GROUND_Y) * sy * cr;
  };

  // Attachment points, and how fast each is moving. Speeds are smoothed, because a
  // difference of two frames is noisy and a part that trails noise shivers.
  const at = S.at, speed = S.speed;
  const hornLx = HORN.L.x + P(CH.hornLX) + (linked ? headX * LINK.head.horn : 0);
  const hornLy = HORN.L.y + P(CH.hornLY);
  const hornRx = HORN.R.x + P(CH.hornRX) + (linked ? headX * LINK.head.horn : 0);
  const hornRy = HORN.R.y + P(CH.hornRY);
  // A raised hand slides round the outline: it is a paw resting on it, not a hand on
  // an arm, so it orbits the body's centre. A screen's own `turn` is the same slide,
  // and its `out` is a push along the same radius.
  // Resting on something, they barely slide: the thing they are on is not moving.
  const liftDeg = P(CH.handLift) * (I.level ? LINK.hand.planted : 1);
  const restL = I.level ? HAND_LEVEL.L : HAND.L, restR = I.level ? HAND_LEVEL.R : HAND.R;
  const slideL = liftDeg + (I.handTurnL ?? 0), slideR = liftDeg - (I.handTurnR ?? 0);
  const reachL = 1 + (I.handOutL ?? 0) / Math.hypot(restL.x, restL.y);
  const reachR = 1 + (I.handOutR ?? 0) / Math.hypot(restR.x, restR.y);
  const lcL = Math.cos(slideL * DEG), lsL = Math.sin(slideL * DEG);
  const lcR = Math.cos(slideR * DEG), lsR = Math.sin(slideR * DEG);
  const handLx = (restL.x * lcL - restL.y * lsL) * reachL + P(CH.handLX);
  const handLy = (restL.x * lsL + restL.y * lcL) * reachL + P(CH.handLY);
  const handRx = (restR.x * lcR + restR.y * lsR) * reachR + P(CH.handRX);
  const handRy = (-restR.x * lsR + restR.y * lcR) * reachR + P(CH.handRY);
  const tailRootX = TAIL_ROOT.x + (I.tailX ?? 0), tailRootY = TAIL_ROOT.y + (I.tailY ?? 0);

  const now = [
    bx(0, 0), by(0, 0),
    bx(hornLx, hornLy), by(hornLx, hornLy),
    bx(hornRx, hornRy), by(hornRx, hornRy),
    bx(tailRootX, tailRootY), by(tailRootX, tailRootY),
    at[8], at[9], at[10], at[11],
    bx(handLx, handLy), by(handLx, handLy),
    bx(handRx, handRy), by(handRx, handRy),
  ];
  // A paw on an edge belongs to the edge. What it rests on is the screen's — a
  // card, a hill — and does not breathe, so a paw carried round on the body's
  // outline slid up and down the thing it was supposed to be leaning on. Planted,
  // it stays where it was put and gives only a little to the body moving behind it.
  if (I.level) {
    now[12] = handLx + (now[12] - handLx) * LINK.hand.planted;
    now[13] = handLy + (now[13] - handLy) * LINK.hand.planted;
    now[14] = handRx + (now[14] - handRx) * LINK.hand.planted;
    now[15] = handRy + (now[15] - handRy) * LINK.hand.planted;
  }
  if (!S.ready) {
    for (let i = 0; i < 16; i++) { at[i] = now[i]; speed[i] = 0; }
  }
  const blend = dt > 0 ? 1 - Math.exp(-dt * 25) : 0;
  for (let i = 0; i < 16; i++) {
    // The tail's own joints are measured after the tail is solved, below.
    if (i >= 8 && i < 12) continue;
    const raw = dt > 0 ? (now[i] - at[i]) / dt : 0;
    speed[i] += (raw - speed[i]) * blend;
    at[i] = now[i];
  }
  const bodyVX = speed[0], bodyVY = speed[1];

  // The face slips back against the body's movement and catches up.
  if (linked) {
    const tx = soft(-bodyVX * LINK.face.slip, LINK.face.max);
    const ty = soft(-bodyVY * LINK.face.slip, LINK.face.max);
    for (let k = 0; k < steps; k++) {
      step(S.slipX, tx, LINK.face.freq, LINK.face.damp, h);
      step(S.slipY, ty, LINK.face.freq, LINK.face.damp, h);
    }
  } else { S.slipX.x = 0; S.slipX.v = 0; S.slipY.x = 0; S.slipY.v = 0; }
  const faceX = P(CH.faceX) + headX * FACE_TURN.x + S.slipX.x;
  const faceY = P(CH.faceY) + headY * FACE_TURN.y + S.slipY.x;

  // Horns. Each is blown back by its own root's movement across it, sinks along
  // its length when the root moves along it, and splays as the body flattens.
  const hornDraw = (
    side: number, lx: number, ly: number, axis: number, own: number,
    turn: Spring, slide: Spring, vi: number, freq: number,
  ) => {
    const a = (rot + own + axis) * DEG;
    const ax = Math.cos(a), ay = Math.sin(a);
    if (linked) {
      const across = speed[vi] * -ay + speed[vi + 1] * ax;
      const along = speed[vi] * ax + speed[vi + 1] * ay;
      const drag = soft(LINK.horn.drag * across / HORN.L.length / DEG, LINK.horn.max);
      const target = -drag + side * (1 - sy) * LINK.horn.splay;
      const sink = soft(-along * LINK.horn.slide, LINK.horn.slideMax);
      if (pokeHorn === side) turn.v += side * 420;
      for (let k = 0; k < steps; k++) {
        step(turn, target, freq, LINK.horn.damp, h);
        step(slide, sink, freq, 0.5, h);
      }
    } else { turn.x = 0; turn.v = 0; slide.x = 0; slide.v = 0; }
    const wx = bx(lx, ly) + ax * slide.x, wy = by(lx, ly) + ay * slide.x;
    return trs(wx, wy, rot + own + turn.x, 1, 1);
  };
  // Slightly different frequencies, so the pair never moves as a mirror image.
  const hornL = hornDraw(-1, hornLx, hornLy, HORN.L.axis, P(CH.hornLRot), S.hornL, S.slideL, 2, LINK.horn.freq);
  const hornR = hornDraw(1, hornRx, hornRy, HORN.R.axis, P(CH.hornRRot), S.hornR, S.slideR, 4, LINK.horn.freq * 1.08);

  // Tail. Each bone's rest is measured from the bone before it as it actually is,
  // not as it should be, which is what carries a movement down the chain.
  const raise = P(CH.tailRaise), curl = P(CH.tailCurl), tip = P(CH.tailTip);
  const rootX = now[6], rootY = now[7];
  const tail = S.tail;
  const wag = (i: number) => {
    return wagAmp * LINK.tail[i].wag * Math.sin(t * spec.wag[1] - LINK.tail[i].phase);
  };
  const dragOf = (i: number, angle: number, vi: number, length: number) => {
    if (!linked) return 0;
    const a = angle * DEG;
    const across = speed[vi] * -Math.sin(a) + speed[vi + 1] * Math.cos(a);
    return soft(LINK.tail[i].drag * across / length / DEG, LINK.tail[i].max);
  };
  // The wag is added to each bone after its spring, not fed through it. A spring
  // driven near its own frequency rings, and three of them in a row turned a
  // fourteen-degree wag into a hundred and ten; this way the swing is the size the
  // mood asked for, and the springs are left to do only what the body does to them.
  const w0 = wag(0), w1 = w0 + wag(1), w2 = w1 + wag(2);
  // The tail leaves the body at its own angle and only partly takes on the body's
  // lean. Welded to it, every lean swung the whole tail round its root: leaning
  // away, as thinking does, drove the arrowhead into the outline, and leaning the
  // other way laid the curve out flat. Its root still goes wherever the body goes.
  // This is part of how the tail is carried, not of how it moves, so it holds with
  // motion reduced as well: the rest pose must not depend on that setting.
  const hang = rot * (I.linked ? LINK.tailLean : 1);
  const rest0 = hang + A0 - raise;
  if (!S.ready) { tail[0].x = rest0; tail[1].x = rest0 + (A1 - A0) - curl; tail[2].x = tail[1].x + (A2 - A1) - curl - tip; }
  if (pokeTail) { tail[0].v += 180; tail[1].v += 420; tail[2].v += 700; }
  const t0 = rest0 - dragOf(0, tail[0].x + w0, 6, L0);
  if (linked) { for (let k = 0; k < steps; k++) step(tail[0], t0, LINK.tail[0].freq * tempo, LINK.tail[0].damp, h); }
  else { tail[0].x = t0; tail[0].v = 0; }
  const t1 = tail[0].x + (A1 - A0) - curl - dragOf(1, tail[1].x + w1, 8, L1);
  if (linked) { for (let k = 0; k < steps; k++) step(tail[1], t1, LINK.tail[1].freq * tempo, LINK.tail[1].damp, h); }
  else { tail[1].x = t1; tail[1].v = 0; }
  const t2 = tail[1].x + (A2 - A1) - curl - tip - dragOf(2, tail[2].x + w2, 10, L2);
  if (linked) { for (let k = 0; k < steps; k++) step(tail[2], t2, LINK.tail[2].freq * tempo, LINK.tail[2].damp, h); }
  else { tail[2].x = t2; tail[2].v = 0; }
  const d0 = tail[0].x + w0, d1 = tail[1].x + w1, d2 = tail[2].x + w2;
  const j1x = rootX + L0 * Math.cos(d0 * DEG), j1y = rootY + L0 * Math.sin(d0 * DEG);
  const j2x = j1x + L1 * Math.cos(d1 * DEG), j2y = j1y + L1 * Math.sin(d1 * DEG);
  const endX = j2x + L2 * Math.cos(d2 * DEG), endY = j2y + L2 * Math.sin(d2 * DEG);
  const joints = [j1x, j1y, j2x, j2y];
  for (let i = 0; i < 4; i++) {
    const raw = dt > 0 && S.ready ? (joints[i] - at[8 + i]) / dt : 0;
    speed[8 + i] += (raw - speed[8 + i]) * blend;
    at[8 + i] = joints[i];
  }
  // And back the other way: the body is rocked by the tail it is swinging.
  if (linked) {
    const swing = d2 - (hang + A2 - raise - 2 * curl - tip);
    const want = soft(-swing * LINK.recoil.gain, LINK.recoil.max);
    S.recoil += (want - S.recoil) * (dt > 0 ? 1 - Math.exp(-dt * 8) : 0);
  } else S.recoil = 0;

  // Hands. Each chases its place on the outline, and tips with its own speed.
  const handDraw = (side: number, wx: number, wy: number, own: number, slide: number, fx: Spring, fy: Spring) => {
    if (!S.ready || !linked) { fx.x = wx; fx.v = 0; fy.x = wy; fy.v = 0; }
    else {
      if (pokeHand === side) { fy.v -= 260; fx.v += side * 120; }
      for (let k = 0; k < steps; k++) {
        step(fx, wx, LINK.hand.freq * tempo, LINK.hand.damp, h);
        step(fy, wy, LINK.hand.freq * tempo, LINK.hand.damp, h);
      }
    }
    const tilt = linked ? soft(fx.v * LINK.hand.tilt, LINK.hand.tiltMax) : 0;
    const k = clamp(P(CH.hands), 0, 1.2);
    return trs(fx.x, fy.x, rot * 0.5 + own - side * slide * 0.8 + tilt, 0.6 + 0.4 * k, 0.6 + 0.4 * k);
  };
  const handL = handDraw(-1, now[12], now[13], P(CH.handLRot), slideL, S.handLX, S.handLY);
  const handR = handDraw(1, now[14], now[15], P(CH.handRRot), slideR, S.handRX, S.handRY);

  // The marks follow the body at a fraction of its travel, on a loose spring.
  if (linked) {
    for (let k = 0; k < steps; k++) {
      step(S.markX, now[0] * LINK.mark.follow, LINK.mark.freq * tempo, LINK.mark.damp, h);
      step(S.markY, now[1] * LINK.mark.follow, LINK.mark.freq * tempo, LINK.mark.damp, h);
      step(S.markR, rot * LINK.mark.roll, LINK.mark.freq * tempo, LINK.mark.damp, h);
    }
  } else { S.markX.x = now[0]; S.markY.x = now[1]; S.markR.x = rot; S.markX.v = 0; S.markY.v = 0; S.markR.v = 0; }

  // --- Pass three: the drawing -------------------------------------------------

  // The body is drawn as an ellipse of the squashed size, turned and placed, rather
  // than as a scaled picture of one: scaling a stroked shape scales its stroke, and
  // a squashed body would get a thin outline at the sides and a fat one on top.
  const body = trs(now[0], now[1], rot, 1, 1);

  // Eyes share a little of the body's squash, as anything on a soft surface would.
  const eyeSX = 1 + (sx - 1) * 0.5, eyeSY = 1 + (sy - 1) * 0.5;
  const arc = clamp(P(CH.arc), -1.3, 1.3);
  const lineY = 1.4 + 3.1 * arc;
  const sag = 2.8 * Math.max(0, -arc);
  const bend = 16.2 * arc;
  const driftX = still ? 0 : Math.sin(t * EYE_DRIFT.rx) * EYE_DRIFT.ax + Math.sin(t * EYE_DRIFT.rx2) * EYE_DRIFT.bx;
  const driftY = still ? 0 : Math.sin(t * EYE_DRIFT.ry) * EYE_DRIFT.ay;
  const pw = clamp(P(CH.pupilW), 0.3, 2), ph = clamp(P(CH.pupilH), 0.3, 2);
  const turnIn = P(CH.converge) * (1 - Math.min(1, Math.abs(lookX)) * 0.8);
  const drop = clamp(P(CH.lidDrop), 0, 1);
  const cheek = clamp(P(CH.cheek), 0, 1);
  const scale = clamp(P(CH.eyeScale), 0.3, 2);

  const eyeDraw = (side: number, rx: number, ry: number, open: number, wink: number, ox: number, oy: number, pxo: number, pyo: number) => {
    const lx = side * (EYE.x + P(CH.eyeGap)) + faceX + ox;
    const ly = EYE.y + faceY + oy;
    const eye = trs(bx(lx, ly), by(lx, ly), rot, scale * eyeSX, scale * eyeSY);
    // An eye closes by narrowing onto the line it will be drawn as when shut, so the
    // white becomes that line rather than being wiped away by a lid. Past open it
    // grows a little: the flick a blink comes back with.
    const narrow = clamp(open, 0.06, 1.15);
    const shift = lineY * (1 - narrow);
    // It draws in a little at the sides as well. The line a shut eye becomes is
    // shorter than the white is wide, so a white that only flattened would poke out
    // past both ends of it on the way down.
    const pinch = 1 - Math.max(0, 1 - narrow) * PINCH;
    const ball = [eye[0] * pinch, eye[1] * pinch, eye[2] * narrow, eye[3] * narrow, eye[4] + eye[2] * shift, eye[5] + eye[3] * shift];
    // The lids are the brow and the cheek: how far each covers a fully open eye. They
    // live inside the ball, so they narrow with it and need no closing of their own.
    const lid = trs(0, -ry - 3 + drop * (2 * ry + 3), -side * P(CH.lidTilt), 1, 1);
    const lower = trs(0, ry + 3 - cheek * ry * 0.7, 0, 1, 1);
    // The pupil stays inside the white, give or take a sliver the clip will take. It
    // is un-narrowed on the way in, so the eye closes over a pupil that keeps its
    // shape instead of flattening it.
    let qx = lookX * LOOK_REACH.x - side * turnIn + pxo + driftX - S.slipX.x * 0.5;
    let qy = lookY * LOOK_REACH.y + pyo + driftY - S.slipY.x * 0.5;
    const roomX = Math.max(1, rx - PUPIL.rx * pw + 3), roomY = Math.max(1, ry - PUPIL.ry * ph + 3);
    const far = Math.hypot(qx / roomX, qy / roomY);
    if (far > 1) { qx /= far; qy /= far; }
    const pupil = trs(qx / pinch, (qy - shift) / narrow, 0, pw / pinch, ph / narrow);
    // The outer end of a sleeping eye's line sits higher than the inner one.
    const outer = lineY - sag, inner = lineY + sag;
    const yl = side < 0 ? outer : inner, yr = side < 0 ? inner : outer;
    const lash = `M${-LASH_HALF} ${n2(yl)}C${-LASH_HANDLE} ${n2(yl - bend)} ${LASH_HANDLE} ${n2(yr - bend)} ${LASH_HALF} ${n2(yr)}`;
    const k = clamp(wink, 0, 1);
    return {
      eye, ball, lid, lower, pupil, lash,
      white: open > SHUT && k < 0.5 ? 1 : 0,
      // The line is drawn or it is not. Faded in over a narrowing eye it sat across
      // the pupil as a grey smear, and a wink drawn over a fading line was a smudge.
      lashO: open <= SHUT && k < 0.25 ? 1 : 0,
      // The chevron sits toward the nose from the eye's middle, as the frame draws it.
      wink: trs(-side * 5, 0, 0, 0.7 + 0.3 * k, 0.7 + 0.3 * k),
      winkO: k,
    };
  };
  const eL = eyeDraw(-1, EYE_RX.L, EYE_RY.L, P(CH.openL), P(CH.winkL), P(CH.eyeLX), P(CH.eyeLY), P(CH.pupilLX), P(CH.pupilLY));
  const eR = eyeDraw(1, EYE_RX.R, EYE_RY.R, P(CH.openR), P(CH.winkR), P(CH.eyeRX), P(CH.eyeRY), P(CH.pupilRX), P(CH.pupilRY));

  // Mouth. It goes with the face, a little less far than the eyes do.
  const mlx = faceX * 0.9 + P(CH.mouthX), mly = MOUTH_Y + faceY * 0.4 + P(CH.mouthY);
  const mwx = bx(mlx, mly), mwy = by(mlx, mly);
  const round = clamp(P(CH.mouthO), 0, 1.6);
  const frown = clamp(P(CH.mouthArc), 0, 1.3);

  // Marks.
  const mx = S.markX.x, my = S.markY.x, mr = S.markR.x;
  const twinkle = still ? 0 : Math.sin(t * 1.7 + 0.9) * 0.11;
  const sparkK = clamp(P(CH.spark), 0, 1.4);
  const questionK = clamp(P(CH.question), 0, 1.4);
  const zzzK = clamp(P(CH.zzz), 0, 1);
  const badgeK = clamp(P(CH.badge), 0, 1.4);
  const bobY = still ? 0 : Math.sin(t * 1.1) * 5;
  const rise = still ? 0 : (t % DRIFT_S) / DRIFT_S;
  const badgeAt = [bx(MARK.badge.x, MARK.badge.y), by(MARK.badge.x, MARK.badge.y)];

  let debug = '';
  if (I.debug) {
    const cross = (x: number, y: number) => {
      return `M${n2(x - 4)} ${n2(y)}H${n2(x + 4)}M${n2(x)} ${n2(y - 4)}V${n2(y + 4)}`;
    };
    debug = `M${n2(rootX)} ${n2(rootY)}L${n2(j1x)} ${n2(j1y)}L${n2(j2x)} ${n2(j2y)}L${n2(endX)} ${n2(endY)}`
      + cross(rootX, rootY) + cross(j1x, j1y) + cross(j2x, j2y)
      + cross(now[2], now[3]) + cross(now[4], now[5])
      + cross(now[12], now[13]) + cross(now[14], now[15])
      + cross(now[0], now[1]) + cross(bx(0, GROUND_Y), by(0, GROUND_Y))
      + cross(eL.eye[4], eL.eye[5]) + cross(eR.eye[4], eR.eye[5]);
  }

  S.ready = true;
  return {
    tailD: `M${n2(rootX)} ${n2(rootY)}C${n2(j1x)} ${n2(j1y)} ${n2(j2x)} ${n2(j2y)} ${n2(endX)} ${n2(endY)}`,
    tailTip: trs(endX, endY, d2 - A2, 1, 1),
    hornL, hornR,
    body, bodyRx: RIG_MEASURE.body.rx * sx, bodyRy: RIG_MEASURE.body.ry * sy,
    eyeL: eL.eye, eyeR: eR.eye, ballL: eL.ball, ballR: eR.ball,
    pupilL: eL.pupil, pupilR: eR.pupil,
    lidL: eL.lid, lidR: eR.lid, lowL: eL.lower, lowR: eR.lower,
    whiteL: eL.white, whiteR: eR.white,
    lashL: eL.lash, lashR: eR.lash, lashLO: eL.lashO, lashRO: eR.lashO,
    winkL: eL.wink, winkR: eR.wink, winkLO: eL.winkO, winkRO: eR.winkO,
    mouth: trs(mwx, mwy, rot, 1, 1),
    mouthRx: MOUTH.rx * round, mouthRy: MOUTH.ry * round, mouthO: round > 0.03 ? 1 : 0,
    mouthArc: trs(mwx, mwy, rot, 0.6 + 0.4 * frown, 0.6 + 0.4 * frown),
    mouthArcO: Math.min(1, frown * 2),
    handL, handR, handsO: clamp(P(CH.hands) * 2, 0, 1),
    spark: trs(MARK.spark.x + mx, MARK.spark.y + my, mr, sparkK * (1 + twinkle), sparkK * (1 + twinkle)),
    sparkO: Math.min(1, sparkK * 2),
    question: trs(MARK.question.x + mx, MARK.question.y + my + bobY, mr + (still ? 0 : Math.sin(t * 0.9) * 6), questionK, questionK),
    questionO: Math.min(1, questionK * 2),
    zzz: trs(MARK.zzz.x + mx, MARK.zzz.y + my - rise * 16, mr, still ? 1 : 0.75 + rise * 0.35, still ? 1 : 0.75 + rise * 0.35),
    zzzO: still ? zzzK : zzzK * Math.pow(Math.sin(rise * Math.PI), 0.6),
    // The badge stays with the body: the character is holding it.
    badge: trs(badgeAt[0], badgeAt[1], rot * 0.6, badgeK, badgeK),
    badgeO: Math.min(1, badgeK * 2),
    debug,
  };
}
