/** The mascot's own motion vocabulary.
 *
 * This replaces the twenty-three-state set the outgoing character used. That set was
 * built for a different body — a tall pear with two line arms — and for a different
 * brief. This one is the expression sheet the mascot was actually designed around:
 * six live expressions and four product moments, and nothing else.
 *
 * The model is unchanged and is the part worth keeping: nothing is keyframed, every
 * frame computes a target pose and a damped spring per quantity chases it, discrete
 * accents arrive as velocity impulses, and the oscillators are detuned so no state
 * reads as a loop. Every number below is authored for this body. It is round, soft
 * and bottom-heavy, which means more squash and a slower recovery than a thin figure
 * would want: weight is read from how long a deformation takes to come back.
 *
 * Translations are fractions of the square canvas; rotations are degrees.
 */
import type { MascotPartName } from './parts';

export type MascotMood =
  // The six expressions.
  | 'idle' | 'happy' | 'excited' | 'thinking' | 'focused' | 'surprised' | 'sleepy'
  // The four product moments, which are whole illustrations rather than poses.
  | 'onboarding' | 'learningComplete' | 'studyReview' | 'streakReward';

export const MASCOT_GROUPS: { label: string; moods: MascotMood[] }[] = [
  { label: 'Expressions', moods: ['idle', 'happy', 'excited', 'thinking', 'focused', 'surprised', 'sleepy'] },
  { label: 'Product moments', moods: ['onboarding', 'learningComplete', 'studyReview', 'streakReward'] },
];
export const ALL_MASCOT_MOODS: MascotMood[] = MASCOT_GROUPS.flatMap((g) => g.moods);

/** The art each expression's eyes are cut from. Every one exists per eye, so the two
 * sides are independent and a wink is just one of them closed. */
export type EyeArtName =
  | 'open' | 'wide' | 'focused' | 'squeezed' | 'sleepy' | 'closed'
  | 'glance' | 'smile' | 'half' | 'wink';
export type MouthArtName = 'mouth_smile' | 'mouth_open' | 'mouth_round' | 'mouth_sleepy';

/** A hop, as a trajectory rather than an oscillation: crouch, rise, fall, land, and a
 * pause on the ground. The pause is what gives a hop a rhythm instead of a frequency.
 * Weights are this character's own — it is heavier than the figure this technique was
 * first written for, so it spends longer crouched and longer down. */
export interface HopSpec {
  /** Peak above the resting line, as a fraction of the canvas. */
  height: number;
  /** Hops per second, including the pause. */
  rate: number;
  crouch: number;
  squash: number;
  /** Degrees of lean at the apex. A jump that stays upright reads as an elevator; the
   * tilt is what makes it read as thrown. It is fed to the roll spring rather than
   * applied directly, so the body keeps leaning for a moment after it lands. */
  tilt?: number;
  /** Degrees the legs swing apart at the apex. They hang under a standing body and
   * splay once there is nothing to stand on. */
  splay?: number;
  beats?: readonly [number, number, number, number, number];
}
const HOP_BEATS: readonly [number, number, number, number, number] = [0.17, 0.23, 0.26, 0.14, 0.2];

export interface GazeSpec { x: number; y: number; wanderX: number; wanderY: number; hold: [number, number] }
export interface BeatSpec { tx: number; ty: number; roll: number; every: [number, number] }

export interface MascotState {
  /** [resting, amplitude, rate] for each quantity. */
  roll: [number, number, number];
  tx: [number, number, number];
  ty: [number, number, number];
  /** Resting scale, breath amplitude, rate. Under 1 is compressed. */
  squash: [number, number, number];
  hop?: HopSpec;
  /** Fast jitter, for the startled state. [amplitude, rate] */
  shake?: [number, number];
  lid: number;
  eyeScale: number;
  /** Resting droop, swing either side of it, and the swing's own rate. */
  arm: [number, number, number];
  /** The side that reaches, if any. Reaching swaps the whole torso layer rather than
   * laying an arm over it: the palm is modelled joined to the body, so an arm drawn on
   * top of a standing torso would show the join. The neutral arm on that side is
   * dropped; the other side keeps swinging. */
  reach?: 'L' | 'R';
  /** How far the tail trails the body, on the same principle as the ears. */
  tailLag: number;
  /** One piece of eye art, or a set this state cycles through. */
  eyes: EyeArtName | EyeArtName[];
  eyeHold?: [number, number];
  mouth: MouthArtName;
  prop?: MascotPartName;
  /** How the prop behaves: a pop punctuates a beat, a drift rises and fades. */
  propMotion?: 'pop' | 'drift';
  blink: [number, number] | null;
  /** How often one eye winks on its own, if this state winks at all. The thing a
   * both-eyes piece of art could not do. */
  wink?: [number, number];
  gaze: GazeSpec;
  beat?: BeatSpec;
  /** How far the ears trail the body, 0 rigid and 1 very loose. Secondary motion the
   * outgoing character could not do at all — its ears were part of one silhouette. */
  earLag: number;
  /** A product moment renders as its whole illustration instead of as parts. */
  scene?: MascotPartName;
}

export const MASCOT_STATES: Record<MascotMood, MascotState> = {
  /** Alive and doing nothing. Everything here is small; the state has to survive being
   * looked at for a minute without becoming a tic. */
  idle: {
    roll: [0, 1.2, 0.44], tx: [0, 0.004, 0.27], ty: [0, 0.006, 0.78],
    squash: [1, 0.013, 0.78], lid: 1, eyeScale: 1, arm: [0, 7, 0.9],
    eyes: ['open', 'open', 'glance'], eyeHold: [5200, 11000], mouth: 'mouth_smile',
    blink: [4800, 11000], wink: [9000, 19000], earLag: 0.5, tailLag: 0.8,
    gaze: { x: 0, y: 0, wanderX: 0.5, wanderY: 0.35, hold: [2400, 5200] },
  },

  /** Pleased. The hop is small and lands softly — this is contentment, not a party. */
  happy: {
    roll: [0, 2.4, 1.05], tx: [0, 0.005, 1], ty: [0, 0, 0],
    squash: [1, 0.018, 2.1], hop: { height: 0.030, rate: 1.0, crouch: 0.010, squash: 0.06, tilt: 7, splay: 13 },
    lid: 1, eyeScale: 1.04, arm: [11, 17, 1.8],
    eyes: ['smile', 'squeezed'], eyeHold: [2200, 4200], mouth: 'mouth_open',
    blink: [2600, 5200], wink: [4200, 9000], earLag: 0.72, tailLag: 1.1,
    gaze: { x: 0, y: -0.1, wanderX: 0.3, wanderY: 0.2, hold: [1600, 3200] },
  },

  /** Bursting. Faster and higher than happy, and the accents pop on every landing,
   * which is what separates excitement from cheerfulness: it punctuates. */
  excited: {
    roll: [0, 4.5, 5.2], tx: [0, 0.008, 1.1], ty: [0, 0, 0],
    squash: [1.008, 0.026, 2.3], hop: { height: 0.046, rate: 1.28, crouch: 0.013, squash: 0.075, tilt: 16, splay: 22 },
    lid: 1, eyeScale: 1.06, arm: [5, 21, 2.3],
    eyes: 'squeezed', mouth: 'mouth_open',
    prop: 'gold_accents', propMotion: 'pop',
    blink: [2100, 4200], wink: [3200, 7000], earLag: 0.85, tailLag: 1.3,
    gaze: { x: 0, y: -0.15, wanderX: 0.35, wanderY: 0.2, hold: [900, 1900] },
    beat: { tx: 0, ty: -0.012, roll: 5, every: [1100, 2000] },
  },

  /** Working something out. Leaning away, looking off, one arm up, and slow — the
   * rates here are the lowest in the set, because thought reads as unhurried. */
  thinking: {
    roll: [-8, 4, 0.33], tx: [0, 0.011, 0.3], ty: [0, 0.005, 0.58],
    squash: [1, 0.007, 0.58], lid: 0.92, eyeScale: 1, arm: [8, 5, 0.5], reach: 'R',
    eyes: ['glance', 'half', 'open'], eyeHold: [1900, 3600], mouth: 'mouth_smile',
    blink: [3400, 7000], earLag: 0.6, tailLag: 0.9,
    gaze: { x: -0.5, y: -0.55, wanderX: 0.7, wanderY: 0.35, hold: [1500, 3000] },
    beat: { tx: 0, ty: 0, roll: -14, every: [2600, 4400] },
  },

  /** Concentrating. Almost nothing moves. The brow does the work, and the stillness
   * is the point — every other state is busier, so this one reads as effort. */
  focused: {
    roll: [2, 0.7, 0.5], tx: [0.002, 0.002, 0.9], ty: [0.004, 0.003, 1.2],
    squash: [0.997, 0.005, 1.5], lid: 0.86, eyeScale: 0.98, arm: [3, 4, 2.1],
    eyes: 'focused', mouth: 'mouth_smile',
    blink: [3200, 6800], earLag: 0.35, tailLag: 0.45,
    gaze: { x: 0.1, y: 0.3, wanderX: 0.25, wanderY: 0.12, hold: [800, 1700] },
  },

  /** Caught off guard. Pulled up and stretched, held there, trembling slightly. The
   * accents pop once on entry rather than repeating — a surprise happens once. */
  surprised: {
    roll: [0, 1.1, 8.5], tx: [0, 0.002, 0.9], ty: [-0.013, 0.003, 0.9],
    squash: [1.035, 0.008, 1.4], shake: [0.0012, 22],
    lid: 1, eyeScale: 1.16, arm: [-8, 5, 1.6],
    eyes: 'wide', mouth: 'mouth_round',
    prop: 'gold_accents', propMotion: 'pop',
    blink: [2000, 3800], earLag: 0.95, tailLag: 1.4,
    gaze: { x: 0, y: -0.1, wanderX: 0.15, wanderY: 0.1, hold: [1500, 3000] },
    beat: { tx: 0, ty: -0.01, roll: 3, every: [2800, 5200] },
  },

  /** Going under. Sitting low, breathing long and deep, lids down, and the only state
   * whose blink is off — it is already shut. */
  sleepy: {
    roll: [3, 1.6, 0.25], tx: [0, 0.004, 0.19], ty: [0.016, 0.008, 0.33],
    squash: [1, 0.024, 0.33], lid: 0.22, eyeScale: 1, arm: [14, 2.5, 0.33],
    eyes: ['sleepy', 'closed'], eyeHold: [4200, 8500], mouth: 'mouth_sleepy',
    prop: 'zzz', propMotion: 'drift',
    blink: null, earLag: 0.45, tailLag: 0.6,
    gaze: { x: 0, y: 0.3, wanderX: 0.12, wanderY: 0.08, hold: [4000, 8000] },
    beat: { tx: 0, ty: 0.01, roll: 2, every: [4600, 8200] },
  },

  // The four product moments. Each is one illustration with its own set dressing, so
  // nothing is articulated: the whole picture drifts, leans and breathes as a unit.
  // Building these out of parts would buy nothing — the shelf, the card, the book and
  // the confetti are not poses.

  /** Peeking over the ledge. Rises a little, as though just arrived. */
  onboarding: {
    scene: 'scene_onboarding',
    roll: [0, 0.9, 0.4], tx: [0, 0.004, 0.3], ty: [0.004, 0.006, 0.62],
    squash: [1, 0.009, 0.62], lid: 1, eyeScale: 1, arm: [0, 0, 0],
    eyes: 'open', mouth: 'mouth_smile', blink: [4000, 9000], earLag: 0, tailLag: 0,
    gaze: { x: 0, y: 0, wanderX: 0.4, wanderY: 0.25, hold: [2200, 4600] },
  },

  /** Holding up the finished card. A small proud lift and a settle. */
  learningComplete: {
    scene: 'scene_learning_complete',
    roll: [0, 1.6, 0.8], tx: [0, 0.004, 0.7], ty: [-0.004, 0.007, 1.1],
    squash: [1.01, 0.013, 1.1], lid: 1, eyeScale: 1, arm: [0, 0, 0],
    eyes: 'open', mouth: 'mouth_smile', blink: [2800, 6000], earLag: 0, tailLag: 0,
    gaze: { x: 0, y: -0.1, wanderX: 0.25, wanderY: 0.15, hold: [1800, 3600] },
    beat: { tx: 0, ty: -0.008, roll: 2.5, every: [2400, 4200] },
  },

  /** Reading. The steadiest thing in the set, barely more than breathing. */
  studyReview: {
    scene: 'scene_study_review',
    roll: [0, 0.8, 0.36], tx: [0, 0.002, 0.24], ty: [0.002, 0.005, 0.54],
    squash: [1, 0.010, 0.54], lid: 0.95, eyeScale: 1, arm: [0, 0, 0],
    eyes: 'open', mouth: 'mouth_smile', blink: [3200, 7000], earLag: 0, tailLag: 0,
    gaze: { x: 0, y: 0.3, wanderX: 0.2, wanderY: 0.1, hold: [2000, 4000] },
  },

  /** The reward. Off the ground entirely, turning slowly, confetti already in the air
   * — so this one floats rather than hops: it never lands. */
  streakReward: {
    scene: 'scene_streak_reward',
    roll: [0, 3.2, 0.62], tx: [0, 0.007, 0.5], ty: [-0.012, 0.012, 0.72],
    squash: [1.012, 0.014, 0.72], lid: 1, eyeScale: 1.04, arm: [0, 0, 0],
    eyes: 'squeezed', mouth: 'mouth_open', blink: [3000, 6500], earLag: 0, tailLag: 0,
    gaze: { x: 0, y: -0.1, wanderX: 0.2, wanderY: 0.12, hold: [1600, 3200] },
    beat: { tx: 0, ty: -0.01, roll: 4, every: [1800, 3400] },
  },
};

export interface MascotPose {
  roll: number; tx: number; ty: number; sx: number; sy: number;
  lid: number; eyeScale: number; arm: number; armSwing: number;
  /** Degrees the legs are swung apart. Zero whenever the feet are on the ground. */
  splay: number;
  /** Upward displacement from a hop, applied kinematically rather than as a spring
   * target: a spring chasing it rounds off the launch and swallows the apex. */
  lift: number;
}

/** Offsetting by the value at t=0 keeps the first frame in the authored rest pose. */
function wave(t: number, rate: number, phase: number) {
  'worklet';
  return Math.sin(t * rate + phase) - Math.sin(phase);
}

function hopAt(h: HopSpec, clock: number, out: MascotPose): number {
  'worklet';
  const b = h.beats ?? HOP_BEATS;
  const total = b[0] + b[1] + b[2] + b[3] + b[4];
  let u = ((clock * h.rate) % 1) * total;
  if (u < 0) u += total;
  // Crouch: gathering, and the squash that anticipates the launch.
  if (u < b[0]) { const s = u / b[0]; out.lift = -h.crouch * s * s; return 1 - h.squash * s * s; }
  u -= b[0];
  // Rise: fast off the ground, decelerating into the apex, stretched.
  if (u < b[1]) {
    const s = u / b[1];
    out.lift = -h.crouch + (h.height + h.crouch) * (1 - (1 - s) * (1 - s));
    return 1 + h.squash * 1.3 * (1 - s) * (1 - s);
  }
  u -= b[1];
  // Fall: accelerating back down, straightening out.
  if (u < b[2]) { const s = u / b[2]; out.lift = h.height * (1 - s * s); return 1 + h.squash * 0.35 * s * s; }
  u -= b[2];
  // Land: the impact, absorbed.
  if (u < b[3]) { const s = u / b[3]; const k = 1 - s; out.lift = 0; return 1 - h.squash * 1.6 * k * k; }
  // Ground: still. Without this the hop has a frequency but no rhythm.
  out.lift = 0;
  return 1;
}

/** Writes this frame's target pose for `mood` into `out`. Runs on the UI thread. */
export function mascotPose(mood: MascotMood, clock: number, out: MascotPose) {
  'worklet';
  const s = MASCOT_STATES[mood];
  const shake = s.shake ? Math.sin(clock * s.shake[1]) * s.shake[0] : 0;

  out.roll = s.roll[0] + wave(clock, s.roll[2], 0) * s.roll[1];
  out.tx = s.tx[0] + wave(clock, s.tx[2], 1.1) * s.tx[1] + shake;
  out.ty = s.ty[0] + wave(clock, s.ty[2], 0.4) * s.ty[1];

  let squash = s.squash[0] + wave(clock, s.squash[2], 0) * s.squash[1];
  out.lift = 0;
  out.splay = 0;
  if (s.hop) {
    squash *= hopAt(s.hop, clock, out);
    // Both the lean and the legs follow how far off the ground the body is, so they
    // gather on the crouch, open at the apex and close again as it comes down.
    const air = out.lift / s.hop.height;
    out.roll += air * (s.hop.tilt ?? 0);
    out.splay = Math.max(0, air) * (s.hop.splay ?? 0);
  }
  // Volume is roughly preserved: what compresses vertically spreads horizontally.
  out.sy = squash;
  out.sx = 1 + (1 - squash) * 0.85;

  out.lid = s.lid;
  out.eyeScale = s.eyeScale;
  out.arm = s.arm[0];
  out.armSwing = s.arm[1];
}

/** Rate multiplier for the arm's own clock, so a swing can run off the body's beat. */
export function armRate(mood: MascotMood) {
  'worklet';
  return MASCOT_STATES[mood].arm[2];
}
