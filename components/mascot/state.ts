/** The mascot's own motion vocabulary.
 *
 * The model is the part that has survived three changes of medium and is the part
 * worth keeping: nothing is keyframed, every frame computes a target pose and a
 * damped spring per quantity chases it, discrete accents arrive as velocity impulses,
 * and the oscillators are detuned so no state reads as a loop. Every number below is
 * authored for this body. It is round, soft and bottom-heavy, which means more squash
 * and a slower recovery than a thin figure would want: weight is read from how long a
 * deformation takes to come back.
 *
 * What changed is what the numbers drive. The character is now flat vector art drawn
 * in Figma, eight frames of it, so a state names the frame it is drawn from rather
 * than assembling a face out of an eye-shape vocabulary. The frame carries the
 * expression; the springs carry the life. That removed four things the clay model
 * needed and this one does not have: arms, legs, a reaching pose and whole-scene
 * illustrations. Nothing here should pretend otherwise.
 *
 * Translations are fractions of the square canvas; rotations are degrees.
 */

export type MascotMood =
  // The six expressions.
  | 'idle' | 'happy' | 'excited' | 'thinking' | 'focused' | 'surprised' | 'sleepy'
  // The four product moments.
  | 'onboarding' | 'learningComplete' | 'studyReview' | 'streakReward';

/** The drawn frames, by the name the importer gives each Figma frame. */
export type MascotFrame =
  | 'neutral' | 'aha' | 'thinking' | 'focused' | 'happy' | 'completed' | 'sleepy' | 'icon';

export const MASCOT_GROUPS: { label: string; moods: MascotMood[] }[] = [
  { label: 'Expressions', moods: ['idle', 'happy', 'excited', 'thinking', 'focused', 'surprised', 'sleepy'] },
  { label: 'Product moments', moods: ['onboarding', 'learningComplete', 'studyReview', 'streakReward'] },
];
export const ALL_MASCOT_MOODS: MascotMood[] = MASCOT_GROUPS.flatMap((g) => g.moods);

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
   * tilt is what makes it read as thrown. It is applied on top of the roll spring
   * rather than through it, because the spring runs at 5 rad/s and the hop drives it
   * at about 8, which arrived measurably halved. */
  tilt?: number;
  beats?: readonly [number, number, number, number, number];
}
const HOP_BEATS: readonly [number, number, number, number, number] = [0.17, 0.23, 0.26, 0.14, 0.2];

export interface GazeSpec { x: number; y: number; wanderX: number; wanderY: number; hold: [number, number] }
export interface BeatSpec { tx: number; ty: number; roll: number; every: [number, number] }

export interface MascotState {
  /** Which drawn frame this state wears. */
  frame: MascotFrame;
  /** [resting, amplitude, rate] for each quantity. */
  roll: [number, number, number];
  tx: [number, number, number];
  ty: [number, number, number];
  /** Resting scale, breath amplitude, rate. Under 1 is compressed. */
  squash: [number, number, number];
  hop?: HopSpec;
  /** Fast jitter, for the startled state. [amplitude, rate] */
  shake?: [number, number];
  /** How open the eyes rest. Under 1 narrows them; a blink drives it to nothing. */
  lid: number;
  eyeScale: number;
  /** How far the horns trail the body's lean, 0 rigid and 1 very loose, and the same
   * for the tail. They are separate paths in the artwork, so they can lag behind the
   * head instead of being welded into one silhouette. */
  hornLag: number;
  tailLag: number;
  blink: [number, number] | null;
  /** How often one eye winks on its own, if this state winks at all. */
  wink?: [number, number];
  gaze: GazeSpec;
  beat?: BeatSpec;
  /** How the frame's decorations behave: a pop punctuates a beat, a drift rises and
   * fades, a float bobs where it is. Which decorations exist comes from the frame. */
  propMotion?: 'pop' | 'drift' | 'float';
}

export const MASCOT_STATES: Record<MascotMood, MascotState> = {
  /** Alive and doing nothing. Everything here is small; the state has to survive being
   * looked at for a minute without becoming a tic. */
  idle: {
    frame: 'neutral',
    roll: [0, 1.2, 0.44], tx: [0, 0.004, 0.27], ty: [0, 0.006, 0.78],
    squash: [1, 0.013, 0.78], lid: 1, eyeScale: 1,
    blink: [4800, 11000], wink: [9000, 19000], hornLag: 0.5, tailLag: 0.8,
    gaze: { x: 0, y: 0, wanderX: 0.5, wanderY: 0.35, hold: [2400, 5200] },
  },

  /** Pleased. The hop is small and lands softly — this is contentment, not a party.
   * The frame's eyes are already closed crescents, so it does not blink. */
  happy: {
    frame: 'happy',
    roll: [0, 2.4, 1.05], tx: [0, 0.005, 1], ty: [0, 0, 0],
    squash: [1, 0.018, 2.1], hop: { height: 0.030, rate: 1.0, crouch: 0.010, squash: 0.06, tilt: 7 },
    lid: 1, eyeScale: 1.04,
    propMotion: 'pop',
    blink: null, hornLag: 0.72, tailLag: 1.1,
    gaze: { x: 0, y: -0.1, wanderX: 0.3, wanderY: 0.2, hold: [1600, 3200] },
  },

  /** Bursting. Faster and higher than happy, and the accents pop on every landing,
   * which is what separates excitement from cheerfulness: it punctuates. */
  excited: {
    frame: 'aha',
    roll: [0, 4.5, 5.2], tx: [0, 0.008, 1.1], ty: [0, 0, 0],
    squash: [1.008, 0.026, 2.3], hop: { height: 0.046, rate: 1.28, crouch: 0.013, squash: 0.075, tilt: 16 },
    lid: 1, eyeScale: 1.06,
    propMotion: 'pop',
    blink: [2100, 4200], wink: [2200, 4800], hornLag: 0.85, tailLag: 1.3,
    gaze: { x: 0, y: -0.15, wanderX: 0.35, wanderY: 0.2, hold: [900, 1900] },
    beat: { tx: 0, ty: -0.012, roll: 5, every: [1100, 2000] },
  },

  /** Working something out. Leaning away, looking off, and slow — the rates here are
   * the lowest in the set, because thought reads as unhurried. */
  thinking: {
    frame: 'thinking',
    roll: [-8, 4, 0.33], tx: [0, 0.011, 0.3], ty: [0, 0.005, 0.58],
    squash: [1, 0.007, 0.58], lid: 0.92, eyeScale: 1,
    propMotion: 'float',
    blink: [3400, 7000], hornLag: 0.6, tailLag: 0.9,
    gaze: { x: -0.5, y: -0.55, wanderX: 0.7, wanderY: 0.35, hold: [1500, 3000] },
    beat: { tx: 0, ty: 0, roll: -14, every: [2600, 4400] },
  },

  /** Concentrating. Almost nothing moves. The brow does the work, and the stillness
   * is the point — every other state is busier, so this one reads as effort. */
  focused: {
    frame: 'focused',
    roll: [2, 0.7, 0.5], tx: [0.002, 0.002, 0.9], ty: [0.004, 0.003, 1.2],
    squash: [0.997, 0.005, 1.5], lid: 0.86, eyeScale: 0.98,
    blink: [3200, 6800], hornLag: 0.35, tailLag: 0.45,
    gaze: { x: 0.1, y: 0.3, wanderX: 0.25, wanderY: 0.12, hold: [800, 1700] },
  },

  /** Caught off guard. Pulled up and stretched, held there, trembling slightly. The
   * accents pop once on entry rather than repeating — a surprise happens once. */
  surprised: {
    frame: 'aha',
    roll: [0, 1.1, 8.5], tx: [0, 0.002, 0.9], ty: [-0.013, 0.003, 0.9],
    squash: [1.035, 0.008, 1.4], shake: [0.0012, 22],
    lid: 1, eyeScale: 1.16,
    propMotion: 'pop',
    blink: [2000, 3800], hornLag: 0.95, tailLag: 1.4,
    gaze: { x: 0, y: -0.1, wanderX: 0.15, wanderY: 0.1, hold: [1500, 3000] },
    beat: { tx: 0, ty: -0.01, roll: 3, every: [2800, 5200] },
  },

  /** Going under. Sitting low, breathing long and deep, and the only state whose
   * blink is off — the frame's eyes are already shut. */
  sleepy: {
    frame: 'sleepy',
    roll: [3, 1.6, 0.25], tx: [0, 0.004, 0.19], ty: [0.016, 0.008, 0.33],
    squash: [1, 0.024, 0.33], lid: 1, eyeScale: 1,
    propMotion: 'drift',
    blink: null, hornLag: 0.45, tailLag: 0.6,
    gaze: { x: 0, y: 0.3, wanderX: 0.12, wanderY: 0.08, hold: [4000, 8000] },
    beat: { tx: 0, ty: 0.01, roll: 2, every: [4600, 8200] },
  },

  // The four product moments. Each borrows the frame that says what has happened and
  // differs in how it moves, which is where they actually differ: arriving, lifting
  // something up, reading, and floating.

  /** Peeking in. Rises a little, as though just arrived. */
  onboarding: {
    frame: 'neutral',
    roll: [0, 0.9, 0.4], tx: [0, 0.004, 0.3], ty: [0.004, 0.006, 0.62],
    squash: [1, 0.009, 0.62], lid: 1, eyeScale: 1,
    blink: [4000, 9000], hornLag: 0.4, tailLag: 0.7,
    gaze: { x: 0, y: 0, wanderX: 0.4, wanderY: 0.25, hold: [2200, 4600] },
  },

  /** Holding up the finished card. A small proud lift and a settle, and the one state
   * that wears the badge. */
  learningComplete: {
    frame: 'completed',
    roll: [0, 1.6, 0.8], tx: [0, 0.004, 0.7], ty: [-0.004, 0.007, 1.1],
    squash: [1.01, 0.013, 1.1], lid: 1, eyeScale: 1,
    propMotion: 'pop',
    blink: null, hornLag: 0.55, tailLag: 0.9,
    gaze: { x: 0, y: -0.1, wanderX: 0.25, wanderY: 0.15, hold: [1800, 3600] },
    beat: { tx: 0, ty: -0.008, roll: 2.5, every: [2400, 4200] },
  },

  /** Reading. The steadiest thing in the set, barely more than breathing. */
  studyReview: {
    frame: 'focused',
    roll: [0, 0.8, 0.36], tx: [0, 0.002, 0.24], ty: [0.002, 0.005, 0.54],
    squash: [1, 0.010, 0.54], lid: 0.95, eyeScale: 1,
    blink: [3200, 7000], hornLag: 0.3, tailLag: 0.45,
    gaze: { x: 0, y: 0.3, wanderX: 0.2, wanderY: 0.1, hold: [2000, 4000] },
  },

  /** The reward. Off the ground entirely, turning slowly — so this one floats rather
   * than hops: it never lands. */
  streakReward: {
    frame: 'happy',
    roll: [0, 3.2, 0.62], tx: [0, 0.007, 0.5], ty: [-0.012, 0.012, 0.72],
    squash: [1.012, 0.014, 0.72], lid: 1, eyeScale: 1.04,
    propMotion: 'pop',
    blink: null, hornLag: 0.8, tailLag: 1.2,
    gaze: { x: 0, y: -0.1, wanderX: 0.2, wanderY: 0.12, hold: [1600, 3200] },
    beat: { tx: 0, ty: -0.01, roll: 4, every: [1800, 3400] },
  },
};

export interface MascotPose {
  roll: number; tx: number; ty: number; sx: number; sy: number;
  lid: number; eyeScale: number;
  /** Upward displacement from a hop, applied kinematically rather than as a spring
   * target: a spring chasing it rounds off the launch and swallows the apex. */
  lift: number;
  /** The hop's own lean, kinematic for the same reason and measured to need it. */
  tilt: number;
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
  out.tilt = 0;
  if (s.hop) {
    squash *= hopAt(s.hop, clock, out);
    // The lean follows how far off the ground the body is, so it gathers on the
    // crouch, opens at the apex and closes again as it comes down.
    out.tilt = (out.lift / s.hop.height) * (s.hop.tilt ?? 0);
  }
  // Volume is roughly preserved: what compresses vertically spreads horizontally.
  out.sy = squash;
  out.sx = 1 + (1 - squash) * 0.85;

  out.lid = s.lid;
  out.eyeScale = s.eyeScale;
}
