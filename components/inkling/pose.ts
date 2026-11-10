/** Motion vocabulary for the Inkling, rebuilt from a study of a public Grok-icon
 * replica. Every state below mirrors the *behaviour* that study describes — the
 * posture, the rhythm, where the eyes go and how often they move — re-derived for
 * this character, whose body is roughly half the reference's width and which has
 * arms the reference does not have. No geometry, palette, timing table or code from
 * that study is reproduced here; it is under a study-only licence.
 */

import type { EyeName } from './eye';

export type InklingMood =
  // Lifecycle
  | 'sleeping' | 'waking' | 'idle' | 'listening' | 'thinking' | 'searching' | 'working'
  // Reactions
  | 'excited' | 'surprised' | 'suspicious' | 'angry' | 'drowsy' | 'happy' | 'curious'
  | 'confused' | 'bored' | 'proud' | 'shy' | 'sad' | 'laughing' | 'scared' | 'playful' | 'celebrate';

export const MOOD_GROUPS: { label: string; moods: InklingMood[] }[] = [
  { label: 'Lifecycle', moods: ['sleeping', 'waking', 'idle', 'listening', 'thinking', 'searching', 'working'] },
  { label: 'Reactions', moods: ['excited', 'surprised', 'suspicious', 'angry', 'drowsy', 'happy', 'curious', 'confused', 'bored', 'proud', 'shy', 'sad', 'laughing', 'scared', 'playful', 'celebrate'] },
];
export const ALL_MOODS: InklingMood[] = MOOD_GROUPS.flatMap((g) => g.moods);

/** Eye outlines live in ./eye, which owns their geometry; this file only names them. */

/** A state is a posture plus a rhythm. Translations are in viewBox units, rotations
 * in degrees. Each term is [base, amplitude, rate]; the oscillators are detuned
 * against each other so no state reads as a loop.
 */
export interface StatePose {
  roll: [number, number, number];
  /** A second, much slower roll, which is what stops the sway from being a metronome. */
  rollSlow?: [number, number];
  tx: [number, number, number];
  ty: [number, number, number];
  squash: [number, number, number];
  /** A hop, if this state hops. See HopSpec. */
  hop?: HopSpec;
  /** Jitter driven at a fixed rate, for fear and anger. */
  shake?: [number, number];
  lid: number;
  /** Slow lid drift, for the states that are fighting to stay awake. */
  lidWave?: [number, number];
  eyeScale: number;
  /** Arms: resting droop, swing either side of it, and their own rate multiplier. */
  arm: [number, number, number];
}

/** A hop, as a trajectory rather than an oscillation.
 *
 * What this replaces was `ty -= abs(sin(rate * t)) * amplitude`, which never leaves
 * the ground, never lands, and spends equal time everywhere: it reads as a wobble. A
 * jump is five segments, each its own parabola, and much of what sells it is the two
 * that are not the arc — the crouch that anticipates the launch, and the pause on the
 * ground afterwards, which is what gives a hop a rhythm rather than a frequency.
 *
 * The arc is split at the apex into a rise and a fall with durations of their own, so
 * the character can hang at the top. Both halves have zero slope where they meet, so
 * the apex stays smooth however the two are weighted against each other.
 */
export interface HopSpec {
  /** Peak height above the resting line, in viewBox units. */
  height: number;
  /** Hops per second, counting the whole cycle including the pause. */
  rate: number;
  /** How far the body sinks before it launches. */
  crouch: number;
  /** Depth of the squash at the bottom of the crouch and on landing. */
  squash: number;
  /** Relative durations of crouch, rise, fall, land and ground. */
  beats?: readonly [number, number, number, number, number];
}
const HOP_BEATS: readonly [number, number, number, number, number] = [0.15, 0.24, 0.28, 0.13, 0.2];

/** Writes this frame's lift into `out` and returns the squash multiplier.
 *
 * The split matters. The lift is applied straight to the rendered position, because a
 * spring chasing it would round off the launch and swallow the apex; the squash is
 * handed to the squash spring, whose overshoot is what makes the landing wobble.
 */
function hopAt(h: HopSpec, clock: number, out: PoseOut): number {
  'worklet';
  const b = h.beats ?? HOP_BEATS;
  const total = b[0] + b[1] + b[2] + b[3] + b[4];
  let u = ((clock * h.rate) % 1) * total;
  if (u < 0) u += total;

  if (u < b[0]) {
    // Crouch: sinking and compressing, accelerating into the launch.
    const s = u / b[0];
    out.lift = -h.crouch * s * s;
    return 1 - h.squash * s * s;
  }
  u -= b[0];
  if (u < b[1]) {
    // Rise: from the bottom of the crouch to the apex, stretched on the way up.
    const s = u / b[1];
    out.lift = -h.crouch + (h.height + h.crouch) * (1 - (1 - s) * (1 - s));
    return 1 + h.squash * 1.3 * (1 - s) * (1 - s);
  }
  u -= b[1];
  if (u < b[2]) {
    // Fall: the apex's other half, accelerating back down.
    const s = u / b[2];
    out.lift = h.height * (1 - s * s);
    return 1 + h.squash * 0.35 * s * s;
  }
  u -= b[2];
  if (u < b[3]) {
    // Land: back on the ground, taking the impact and recovering out of it.
    const s = u / b[3];
    const k = 1 - s;
    out.lift = 0;
    return 1 - h.squash * 1.5 * k * k;
  }
  // Ground: still. Without this the hop has a frequency but no rhythm.
  out.lift = 0;
  return 1;
}

/** Per-state hops, in viewBox units against a 176-unit-tall frame. */
const HOPS: Record<string, HopSpec> = {
  excited: { height: 5.6, rate: 1.25, crouch: 1.5, squash: 0.075 },
  happy: { height: 3.6, rate: 1.05, crouch: 1.1, squash: 0.06 },
  // Laughing is a chatter, not a jump: low, quick, barely off the ground.
  laughing: { height: 2, rate: 2.1, crouch: 0.7, squash: 0.045, beats: [0.16, 0.26, 0.3, 0.14, 0.14] },
  playful: { height: 4.2, rate: 0.95, crouch: 1.35, squash: 0.07 },
  celebrate: { height: 6.4, rate: 0.85, crouch: 1.9, squash: 0.085 },
};

/** The resting eye bar is 11 units tall, so a lid of 0.2 is almost shut. */
export const POSES: Record<InklingMood, StatePose> = {
  sleeping:  { roll: [4, 1, 0.25],   tx: [-1, 0, 0],      ty: [4, 1.5, 0.55], squash: [1, 0.016, 0.55], lid: 0.08, eyeScale: 1,    arm: [15, 1.5, 0.3] },
  waking:    { roll: [0, 3, 0.9],    tx: [0, 1, 0.5],     ty: [-2, 1.5, 0.9], squash: [1.02, 0.01, 0.9], lid: 1,  eyeScale: 1.1,  arm: [2, 8, 1.2] },
  idle:      { roll: [0, 1.5, 0.5],  rollSlow: [0.6, 0.17], tx: [0, 1, 0.27], ty: [0, 1.8, 0.85], squash: [1, 0.014, 0.85], lid: 1, eyeScale: 1, arm: [0, 14, 1] },
  listening: { roll: [8, 1.5, 0.5],  tx: [1, 0.6, 0.4],   ty: [-1, 0.5, 0.8], squash: [1.015, 0.006, 0.8], lid: 1, eyeScale: 1.02, arm: [-3, 8, 1.1] },
  thinking:  { roll: [-9, 5, 0.35],  tx: [0, 2.5, 0.3],   ty: [0, 1.2, 0.6],  squash: [1, 0.006, 0.6],  lid: 0.9,  eyeScale: 1,    arm: [7, 6, 0.55] },
  searching: { roll: [0, 13, 1.3],   tx: [0, 3.5, 1.3],   ty: [0, 1.5, 1.7],  squash: [1, 0.008, 1.7],  lid: 1,    eyeScale: 1.04, arm: [-2, 16, 1.7] },
  working:   { roll: [4, 2.5, 10],   tx: [1.5, 0.4, 0.9], ty: [1, 1.2, 10],   squash: [0.995, 0.01, 10], lid: 0.95, eyeScale: 1,   arm: [2, 9, 2.2] },

  excited:   { roll: [0, 7, 6.9],    tx: [0, 2, 1.1],     ty: [1, 0, 0],      squash: [1.01, 0.03, 2.2], hop: HOPS.excited, lid: 1, eyeScale: 1.06, arm: [4, 22, 2.3] },
  surprised: { roll: [0, 1.5, 11],   tx: [0, 0.4, 0.9],   ty: [-2, 0.4, 0.9], squash: [1.03, 0.01, 1.4], lid: 1,    eyeScale: 1.16, arm: [-6, 5, 1.5] },
  suspicious:{ roll: [-6, 3, 0.3],   tx: [-2, 2, 0.25],   ty: [0.5, 0.6, 0.45], squash: [1, 0.005, 0.45], lid: 0.85, eyeScale: 1,  arm: [6, 4, 0.5] },
  angry:     { roll: [0, 0, 0],      tx: [0, 0, 0],       ty: [1.8, 0, 0],    squash: [0.975, 0.004, 3], shake: [4, 18], lid: 0.8, eyeScale: 0.98, arm: [9, 7, 1.8] },
  drowsy:    { roll: [0, 2.5, 0.32], tx: [0, 1.5, 0.2],   ty: [3, 1.1, 0.36], squash: [1, 0.022, 0.36], lid: 0.34, lidWave: [0.07, 0.8], eyeScale: 1, arm: [13, 3, 0.35] },
  happy:     { roll: [0, 3, 1.2],    tx: [0, 1.5, 1.1],   ty: [0, 0, 0],      squash: [1, 0.02, 2.4],  hop: HOPS.happy, lid: 1, eyeScale: 1.05, arm: [11, 20, 2] },
  curious:   { roll: [10, 6, 0.7],   tx: [0, 2.5, 0.6],   ty: [-1, 0.8, 0.9], squash: [1.01, 0.006, 0.9], lid: 1,  eyeScale: 1.1,  arm: [-4, 10, 1.6] },
  confused:  { roll: [0, 12, 0.8],   tx: [0, 1.5, 0.8],   ty: [0, 1, 0.5],    squash: [1, 0.005, 0.5],  lid: 0.9,  eyeScale: 1,    arm: [4, 9, 0.8] },
  bored:     { roll: [-3, 4, 0.25],  tx: [0, 2, 0.2],     ty: [2.5, 0.8, 0.35], squash: [0.99, 0.006, 0.35], lid: 0.6, eyeScale: 0.98, arm: [12, 3, 0.4] },
  proud:     { roll: [0, 2.5, 0.4],  tx: [0, 1, 0.35],    ty: [-2, 0.5, 0.6], squash: [1.03, 0.005, 0.6], lid: 0.9, eyeScale: 1.02, arm: [-7, 5, 0.7] },
  shy:       { roll: [-8, 3, 0.5],   tx: [-1.5, 1, 0.4],  ty: [1.5, 0.3, 0.6], squash: [0.98, 0.005, 0.6], lid: 0.85, eyeScale: 0.95, arm: [10, 3, 0.6] },
  sad:       { roll: [3, 2, 0.3],    tx: [0, 0.8, 0.25],  ty: [3.5, 0.5, 0.4], squash: [0.97, 0.006, 0.4], lid: 0.7, eyeScale: 0.97, arm: [14, 2, 0.4] },
  laughing:  { roll: [0, 4, 20],     tx: [0, 1, 2],       ty: [0, 0, 0],      squash: [1, 0.03, 20],   hop: HOPS.laughing, lid: 0.7, eyeScale: 1, arm: [8, 16, 2.6] },
  scared:    { roll: [0, 2, 24],     tx: [-1, 1, 30],     ty: [1, 0.6, 1.5],  squash: [0.97, 0.004, 1.5], shake: [1.6, 26], lid: 1.05, eyeScale: 1.12, arm: [-8, 6, 2.4] },
  playful:   { roll: [0, 8, 1.4],    tx: [0, 2, 1.1],     ty: [0, 0, 0],      squash: [1, 0.015, 2.2], hop: HOPS.playful, lid: 1, eyeScale: 1.06, arm: [2, 18, 1.9] },
  celebrate: { roll: [0, 1, 1.6],    tx: [0, 0.5, 1.2],   ty: [0, 0, 0],      squash: [1, 0.012, 1.6], hop: HOPS.celebrate, lid: 1.1, eyeScale: 1.1, arm: [-2, 20, 2.1] },
};

/** Where the eyes rest, how far they wander from there, and how long a look is held. */
export interface GazeSpec { x: number; y: number; wanderX: number; wanderY: number; hold: [number, number] }
export const GAZE: Record<InklingMood, GazeSpec> = {
  sleeping:  { x: 0, y: 1.5, wanderX: 0, wanderY: 0, hold: [6000, 10000] },
  waking:    { x: 0, y: -0.5, wanderX: 0.5, wanderY: 0.3, hold: [800, 800] },
  idle:      { x: 0, y: 0, wanderX: 0.6, wanderY: 0.4, hold: [2500, 5500] },
  listening: { x: 0, y: 0, wanderX: 1.6, wanderY: 0.9, hold: [2200, 4200] },
  thinking:  { x: 1.8, y: -1.8, wanderX: 1, wanderY: 0.5, hold: [1500, 2800] },
  searching: { x: 0, y: 0, wanderX: 2.6, wanderY: 1.6, hold: [550, 1150] },
  working:   { x: 0, y: 1.2, wanderX: 1, wanderY: 0.5, hold: [1200, 2400] },
  excited:   { x: 0, y: -0.8, wanderX: 2.2, wanderY: 1.2, hold: [700, 1400] },
  surprised: { x: 0, y: -0.4, wanderX: 0, wanderY: 0, hold: [1600, 2600] },
  suspicious:{ x: -2.2, y: 0.4, wanderX: 0.4, wanderY: 0.2, hold: [2200, 4200] },
  angry:     { x: 0, y: 0.3, wanderX: 0.4, wanderY: 0.2, hold: [1800, 3200] },
  drowsy:    { x: 0, y: 1.4, wanderX: 0.7, wanderY: 0.4, hold: [2500, 4500] },
  happy:     { x: 0, y: -1, wanderX: 1.5, wanderY: 0.8, hold: [1800, 3400] },
  curious:   { x: -1.2, y: 0, wanderX: 2.2, wanderY: 1.3, hold: [950, 1900] },
  confused:  { x: 0, y: -0.4, wanderX: 2, wanderY: 1, hold: [1200, 2200] },
  bored:     { x: 1.6, y: 0.8, wanderX: 1.2, wanderY: 0.5, hold: [3000, 5200] },
  proud:     { x: 0, y: -1.2, wanderX: 0.5, wanderY: 0.3, hold: [3000, 5000] },
  shy:       { x: -1.4, y: 1.2, wanderX: 0.6, wanderY: 0.4, hold: [2500, 4500] },
  sad:       { x: 0, y: 1.6, wanderX: 0.5, wanderY: 0.3, hold: [3500, 6000] },
  laughing:  { x: 0, y: -0.6, wanderX: 1, wanderY: 0.5, hold: [1200, 2400] },
  scared:    { x: 0, y: -0.6, wanderX: 2.4, wanderY: 1.2, hold: [500, 1100] },
  playful:   { x: 0, y: -0.6, wanderX: 2, wanderY: 1.1, hold: [1000, 2000] },
  celebrate: { x: 0, y: -1, wanderX: 1.2, wanderY: 0.6, hold: [1400, 2600] },
};

/** Blink cadence in ms; null means the state holds its lid. */
export const BLINK_EVERY: Record<InklingMood, [number, number] | null> = {
  sleeping: null, waking: null, idle: [6000, 14000], listening: [3000, 7000],
  thinking: [3500, 7000], searching: [1600, 4000], working: [2800, 5500],
  excited: [2000, 4000], surprised: [1800, 3500], suspicious: [4500, 8000],
  angry: [3500, 7000], drowsy: null, happy: [2500, 5000], curious: [2500, 5500],
  confused: [2800, 5500], bored: [4000, 8000], proud: [3500, 7000], shy: [3000, 6000],
  sad: [4000, 8000], laughing: [2500, 5000], scared: [1200, 3000], playful: [2000, 4500],
  celebrate: [2200, 4500],
};

/** Each state cycles its own small set of eye shapes, held for its own span. */
export const EYE_PLAYLIST: Record<InklingMood, EyeName[]> = {
  sleeping: ['slit'], waking: ['wide', 'neutral'], idle: ['neutral', 'tall'],
  listening: ['neutral', 'wide', 'glance'], thinking: ['glance', 'squint', 'focused', 'tall'],
  searching: ['glance', 'wide', 'focused', 'dot'], working: ['focused', 'squint', 'neutral'],
  excited: ['huge', 'arc', 'wide'], surprised: ['huge', 'wide'],
  suspicious: ['sly', 'squint'], angry: ['cross', 'squint'], drowsy: ['slit', 'squint'],
  happy: ['arc', 'neutral', 'wide'], curious: ['wide', 'glance', 'tall', 'huge'],
  confused: ['squint', 'glance', 'tall'], bored: ['squint', 'slit', 'neutral'],
  proud: ['arc', 'neutral'], shy: ['downcast', 'squint', 'dot'],
  sad: ['downcast', 'slit'], laughing: ['arc'], scared: ['huge', 'wide'],
  playful: ['arc', 'wide', 'glance'], celebrate: ['arc', 'huge'],
};
export const EYE_HOLD: Record<InklingMood, [number, number]> = {
  sleeping: [6000, 10000], waking: [800, 800], idle: [9000, 16000], listening: [2800, 5000],
  thinking: [2000, 3600], searching: [1000, 1800], working: [1800, 3200], excited: [1100, 2000],
  surprised: [2500, 4000], suspicious: [2600, 4500], angry: [2200, 3800], drowsy: [4000, 8000],
  happy: [2500, 4500], curious: [1800, 3200], confused: [2200, 3800], bored: [3500, 6000],
  proud: [3500, 6000], shy: [3000, 5500], sad: [4000, 7000], laughing: [1200, 2400],
  scared: [900, 1800], playful: [1500, 3000], celebrate: [1400, 2600],
};

/** The punctuation beat: a velocity impulse into the springs, so it kicks and
 * settles. This is the nod, the lunge, the hop, the flinch, the sigh.
 */
export interface BeatSpec { tx: number; ty: number; roll: number; every: [number, number] }
export const BEAT: Record<InklingMood, BeatSpec | null> = {
  sleeping: { tx: 0, ty: 10, roll: 3, every: [5000, 9000] },
  waking: null,
  idle: null,
  listening: { tx: 0, ty: -16, roll: 7, every: [1800, 3200] },
  thinking: { tx: 0, ty: 0, roll: -26, every: [2600, 4200] },
  searching: { tx: 26, ty: 0, roll: 18, every: [1400, 2600] },
  working: { tx: 0, ty: -12, roll: 5, every: [1600, 2800] },
  excited: { tx: 10, ty: -30, roll: 14, every: [900, 1600] },
  surprised: { tx: 0, ty: -22, roll: 0, every: [2600, 4200] },
  suspicious: { tx: -14, ty: 0, roll: -18, every: [4000, 7000] },
  angry: { tx: 0, ty: 26, roll: 0, every: [1800, 3200] },
  drowsy: { tx: 0, ty: 20, roll: 9, every: [2500, 4500] },
  happy: { tx: 0, ty: -24, roll: 0, every: [1400, 2400] },
  curious: { tx: 20, ty: 0, roll: 22, every: [1600, 2800] },
  confused: { tx: 0, ty: 0, roll: 24, every: [2600, 4200] },
  bored: { tx: 0, ty: 14, roll: -8, every: [4000, 7000] },
  proud: { tx: 0, ty: -10, roll: 0, every: [3500, 6000] },
  shy: { tx: -10, ty: 6, roll: -10, every: [3000, 5500] },
  sad: { tx: 0, ty: 12, roll: 4, every: [4000, 7000] },
  laughing: { tx: 0, ty: -18, roll: 8, every: [1100, 2000] },
  scared: { tx: -16, ty: 10, roll: 0, every: [900, 1800] },
  playful: { tx: 14, ty: -20, roll: 16, every: [1500, 2800] },
  celebrate: { tx: 0, ty: -26, roll: 0, every: [1200, 2200] },
};

export interface PoseOut {
  roll: number; tx: number; ty: number; sx: number; sy: number;
  lid: number; eyeScale: number; arm: number; armSwing: number; armRate: number;
  /** Upward displacement from the hop, applied kinematically, not as a spring target. */
  lift: number;
}

/** Offsetting by the value at t=0 keeps the first frame in the authored rest pose. */
function wave(t: number, rate: number, phase: number) {
  'worklet';
  return Math.sin(t * rate + phase) - Math.sin(phase);
}

/** Writes this frame's target pose for `mood` into `out`. Runs on the UI thread. */
export function poseFor(mood: InklingMood, clock: number, sinceEnter: number, out: PoseOut) {
  'worklet';
  const p = POSES[mood];
  let roll = p.roll[0] + wave(clock, p.roll[2], 0) * p.roll[1];
  if (p.rollSlow) roll += wave(clock, p.rollSlow[1], 0) * p.rollSlow[0];
  let tx = p.tx[0] + wave(clock, p.tx[2], 0) * p.tx[1];
  let ty = p.ty[0] + wave(clock, p.ty[2], 0) * p.ty[1];
  if (p.shake) {
    roll += Math.sin(clock * p.shake[1]) * p.shake[0];
    tx += Math.cos(clock * p.shake[1] * 1.3) * p.shake[0] * 0.3;
  }
  let squash = p.squash[0] + wave(clock, p.squash[2], 0) * p.squash[1];
  out.lift = 0;
  if (p.hop) squash *= hopAt(p.hop, clock, out);
  let lid = p.lid;
  if (p.lidWave) lid += Math.sin(clock * p.lidWave[1]) * p.lidWave[0];

  // Waking is the one state with an entry: it surfaces, overshoots, then settles.
  if (mood === 'waking') {
    const rise = Math.min(sinceEnter / 1.1, 1);
    ty -= (1 - Math.pow(1 - rise, 3)) * 6 - Math.sin(rise * Math.PI) * 3;
    lid = Math.min(1, 0.08 + rise * 1.6);
  }

  out.roll = roll;
  out.tx = tx;
  out.ty = ty;
  out.sx = 2 - squash;
  out.sy = squash;
  out.lid = lid;
  out.eyeScale = p.eyeScale;
  out.arm = p.arm[0];
  out.armSwing = p.arm[1];
  out.armRate = p.arm[2];
}
