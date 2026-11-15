/** The mascot as a rig: every part on its own channels, and one table of poses.
 *
 * The character used to be eight drawn frames with springs on the box they sat in.
 * A state named the frame it wore, so an expression changed by swapping one drawing
 * for another behind a blink, and the only things that could move on their own were
 * the things that happened to be separate paths. This replaces the frames with
 * numbers. A pose is one value per channel below — where the body is, how open each
 * eye is, which way each horn is turned — and a mood is a pose plus the rhythm it
 * is held with. Nothing is swapped: going from one mood to another is every channel
 * travelling to its new value on its own spring, so an eye closes into a smile
 * rather than being replaced by a picture of one.
 *
 * The poses are measured, not invented. Each is read off the Figma frame that draws
 * that expression (assets/mascot/rig/frames), relative to the body's centre, so the
 * rig at rest in a mood is that frame.
 *
 * Units: positions are in the artwork's own units (the body is 154 across), angles
 * are degrees, clockwise, and everything is measured from the body's centre.
 */
import { RIG_MEASURE } from './art';

/** What the character can be asked to be. */
export type MascotMood =
  // The expressions.
  | 'idle' | 'happy' | 'excited' | 'thinking' | 'focused' | 'surprised' | 'sleepy'
  // The product moments.
  | 'onboarding' | 'learningComplete' | 'studyReview' | 'streakReward' | 'working'
  // Today's own resting state: the same shape as idle, moving more often.
  | 'todayIdle'
  // The states: nothing here, nothing found, something broke.
  | 'wondering' | 'searching' | 'oops';

export const MASCOT_GROUPS: { label: string; moods: MascotMood[] }[] = [
  { label: 'Expressions', moods: ['idle', 'happy', 'excited', 'thinking', 'focused', 'surprised', 'sleepy'] },
  { label: 'Product moments', moods: ['todayIdle', 'onboarding', 'learningComplete', 'studyReview', 'streakReward', 'working'] },
  { label: 'States', moods: ['wondering', 'searching', 'oops'] },
];
export const ALL_MASCOT_MOODS: MascotMood[] = MASCOT_GROUPS.flatMap((g) => g.moods);

/** Every channel there is. Each is one number, sprung on its own, and each can be
 * moved by hand without anything else being asked. */
export const CHANNELS = [
  // Body. `squash` is the vertical scale; the horizontal one is derived from it so
  // volume is kept.
  'x', 'y', 'rot', 'squash',
  // The face slides on the body as one piece: this is what turns the head.
  'faceX', 'faceY', 'eyeGap',
  // Eyes. `open` is each lid; the rest shape both.
  'openL', 'openR', 'lidDrop', 'lidTilt', 'cheek', 'arc', 'eyeScale', 'winkL', 'winkR',
  'eyeLX', 'eyeLY', 'eyeRX', 'eyeRY',
  // Pupils. `look` aims the pair; the per-pupil offsets move one without the other.
  'lookX', 'lookY', 'converge', 'pupilW', 'pupilH',
  'pupilLX', 'pupilLY', 'pupilRX', 'pupilRY',
  // Horns: where each meets the head, and how it is turned there.
  'hornLX', 'hornLY', 'hornLRot', 'hornRX', 'hornRY', 'hornRRot',
  // Tail: the angle it leaves the body at, how tightly it curls, and its tip.
  'tailRaise', 'tailCurl', 'tailTip',
  // Hands.
  'hands', 'handLift', 'handLX', 'handLY', 'handLRot', 'handRX', 'handRY', 'handRRot',
  // Mouth: the round one, the frowning arc, and where it sits.
  'mouthO', 'mouthArc', 'mouthX', 'mouthY',
  // The marks beside the character, each present from 0 to 1.
  'spark', 'question', 'zzz', 'badge',
] as const;
export type Channel = typeof CHANNELS[number];
export const CHANNEL_COUNT = CHANNELS.length;
/** Channel name to its index in a pose. */
export const CH = Object.fromEntries(CHANNELS.map((name, i) => [name, i])) as Record<Channel, number>;

export type PosePatch = Partial<Record<Channel, number>>;

// --- Where things are on the body ----------------------------------------------

/** The body's centre in the 256 square the character is drawn in: where the default
 * frame puts it, which is the frame that draws the hands. The expression frames sit
 * it fourteen units further left to make room for their marks; the screens were
 * laid out around this one, so this is the one the rig keeps, and the marks are let
 * past the square's edge instead (see `bleed` on the component). */
export const RIG_ORIGIN = { x: 124, y: 142 } as const;
export const RIG_VIEW = 256;

const { body, tail } = RIG_MEASURE;
/** The foot of the body: the outside of the outline, on the centre line. Squash and
 * lean pivot here, or the body sinks through the floor as it compresses. */
export const GROUND_Y = body.ry + body.stroke / 2;

/** Each eye's centre, from the Idle frame. */
export const EYE = { x: 27.5, y: -7.5 } as const;
/** How far a pupil travels for a full look, and how far the whole face slides with
 * it. The second is what makes a look a turn of the head rather than of the eyes. */
export const LOOK_REACH = { x: 10, y: 8 } as const;
export const FACE_TURN = { x: 4, y: 2.5 } as const;
export const MOUTH_Y = 28.5;

/** Where each horn meets the head, from the Idle frame. */
export const HORN = {
  L: { x: -28, y: -48, axis: -99.1, length: 50.6 },
  R: { x: 32.8, y: -43, axis: -80.9, length: 50.6 },
} as const;

/** Where the tail leaves the body, and its three bones. The bones are the control
 * polygon of the curve Figma drew, so the tail at rest is that curve exactly, and
 * turning a bone bends it. */
export const TAIL_ROOT = { x: 44, y: 60.3 } as const;
export const TAIL_BONES = tail.bones.map((b) => ({
  length: Math.hypot(b.x, b.y),
  angle: Math.atan2(b.y, b.x) * 180 / Math.PI,
}));

export const HAND = { L: RIG_MEASURE.handL, R: RIG_MEASURE.handR } as const;

/** Where the hands rest when the character is leaning on something with a level
 * edge — a card, a laptop lid. The default frame draws them at two heights, the
 * right one lower and turned, which is a pose; set on a straight edge it is one paw
 * on the edge and the other draped over it. So on an edge both sit at one height,
 * each slid along the outline to keep the distance from it the drawing gives it. */
export const HAND_LEVEL = {
  L: { x: -63, y: 54 },
  R: { x: 55, y: 54 },
} as const;

// What a screen lays itself out against, as fractions of the character's square.

/** The height of the hands' middles when they rest on a level edge. A card that is
 * being held is ridden up to a little below this, so the paws lap onto it. */
export const RIG_HAND_LINE = (RIG_ORIGIN.y + HAND_LEVEL.L.y) / RIG_VIEW;
/** How far the drawing's mass sits left of its square's middle. The body and the
 * hands are what the eye reads as the character — the tail is a thin thing off to
 * one side — so a screen that wants the character at a point adds this to get it
 * there rather than short of it. */
export const RIG_INK_OFFSET = (() => {
  const left = Math.min(-body.rx, HAND_LEVEL.L.x - RIG_MEASURE.handL.w / 2);
  const right = Math.max(body.rx, HAND_LEVEL.R.x + RIG_MEASURE.handR.w / 2);
  return (RIG_VIEW / 2 - (RIG_ORIGIN.x + (left + right) / 2)) / RIG_VIEW;
})();

/** Where each mark's pivot rests. */
export const MARK = {
  spark: { x: 86, y: -54 },
  question: { x: 105, y: -52.4 },
  zzz: { x: 86, y: -62 },
  badge: { x: 35.5, y: 57 },
} as const;

// --- Poses ---------------------------------------------------------------------

/** The Idle frame. Every mood is this with a few channels changed. */
const BASE: Record<Channel, number> = {
  x: 0, y: 0, rot: 0, squash: 1,
  faceX: 0, faceY: 0, eyeGap: 0,
  openL: 1, openR: 1, lidDrop: 0, lidTilt: 0, cheek: 0,
  // The shape of a closed eye: +1 is the arch of a smile, -1 the sag of sleep. A
  // blink is neither, so it rests a little below flat.
  arc: -0.3, eyeScale: 1, winkL: 0, winkR: 0,
  eyeLX: 0, eyeLY: 0, eyeRX: 0, eyeRY: 0,
  // The Idle frame draws the pupils turned in toward each other by this much.
  lookX: 0, lookY: 0, converge: 7, pupilW: 1, pupilH: 1,
  pupilLX: 0, pupilLY: 0, pupilRX: 0, pupilRY: 0,
  hornLX: 0, hornLY: 0, hornLRot: 0, hornRX: 0, hornRY: 0, hornRRot: 0,
  tailRaise: 0, tailCurl: 0, tailTip: 0,
  hands: 0, handLift: 0, handLX: 0, handLY: 0, handLRot: 0, handRX: 0, handRY: 0, handRRot: 0,
  mouthO: 0, mouthArc: 0, mouthX: 0, mouthY: 0,
  spark: 0, question: 0, zzz: 0, badge: 0,
};

// Faces, each measured from its frame. A mood is built from these.

/** Eyes shut into arches. Horns pushed out and the right one tipped, as the happy
 * frame draws them. */
const SMILE: PosePatch = {
  openL: 0, openR: 0, arc: 1,
  hornLX: -8, hornLY: -1, hornRX: 4.6, hornRY: -2.2, hornRRot: 11,
};
/** The aha frame: looking up and to the left, mouth a small o, horns drawn in. */
const AHA: PosePatch = {
  faceX: -5, lookX: -0.55, lookY: -0.44, converge: 0,
  mouthO: 1, mouthY: -0.5,
  hornLX: -2, hornRX: -4, hornRY: -4,
};
const THINK: PosePatch = {
  faceX: -5.5, faceY: -3.5, eyeGap: 0.5, lookX: -0.55, lookY: -0.44, converge: 0,
  mouthArc: 1, mouthY: 3.9,
  hornLX: 3, hornLY: -1, hornRX: 10.6, hornRY: -1.2, hornRRot: 11,
};
/** The focused frame: the upper lids come down at a slant and the pupils widen. */
const FOCUS: PosePatch = {
  faceX: -1.6, faceY: 4, eyeGap: 3.5,
  lidDrop: 0.353, lidTilt: 20.6, converge: 4.6, lookY: -0.19, pupilW: 1.35, pupilH: 1.04,
  mouthO: 1, mouthX: 1.6, mouthY: 2.9,
  hornLX: -8, hornLY: -1, hornRX: 4.6, hornRY: -2.2, hornRRot: 11,
};
const SLEEP: PosePatch = {
  openL: 0, openR: 0, arc: -1, faceX: -3.3,
  hornLX: -4, hornLY: -6, hornRX: -0.4, hornRY: -8.2, hornRRot: 11,
};
/** The completed frame: the smile, lifted, with the horns up. */
const PROUD: PosePatch = {
  openL: 0, openR: 0, arc: 1, faceY: -9,
  hornLX: -4, hornLY: -6, hornRX: -0.4, hornRY: -8.2, hornRRot: 11,
};

/** Sorry. The lids come down at the slant opposite to concentration's — outer ends
 * low — the eyes go to whatever is in its hands, and the mouth turns down. */
const SORRY: PosePatch = {
  faceY: 3, eyeGap: 1, lidDrop: 0.26, lidTilt: -17, lookY: 0.62, converge: 5,
  mouthArc: 1, mouthY: 3.2,
  hornLX: -5, hornLY: 3, hornLRot: -9, hornRX: 5, hornRY: 3, hornRRot: 12,
};

/** Tail carriage.
 *
 * Every Figma frame draws the same tail, and that curve is the rest pose in every
 * mood: the hook is the character's, not an expression's. A mood only nudges it,
 * and by amounts chosen off a sheet of the tail drawn over the designed one, small
 * enough that it is still that hook. The first version did more — it opened the
 * curve by ten degrees for the lively moods and eighteen for the startled one —
 * and what came out was a straight stick with an arrowhead on it. What says a mood
 * in a tail is how it moves, which is the wag and the links, not its outline. */
const PERKY: PosePatch = { tailRaise: 5, tailCurl: -3 };
const ON_END: PosePatch = { tailRaise: 3, tailCurl: -8, tailTip: -4 };
/** Let go: the whole curve dropped at the root, its shape kept. */
const LIMP: PosePatch = { tailRaise: -10 };

/** Holding the finished card up: the right hand moves out to the card's corner so
 * it is under it rather than over the tick. */
const HOLDING: PosePatch = {
  hands: 1, y: -1, squash: 1.01, ...PERKY, badge: 1, spark: 1, handRX: 9, handRY: 5,
};

/** A hop, as a trajectory rather than an oscillation: crouch, rise, fall, land, and
 * a pause on the ground. The pause is what gives it a rhythm instead of a frequency. */
export interface HopSpec { height: number; rate: number; crouch: number; squash: number }

export interface RigMood {
  /** The pose this mood rests in, then the ones it drifts through on its own. */
  faces: PosePatch[];
  /** How long each is held, in ms, when there is more than one. */
  faceHold?: [number, number];
  /** Multiplies every spring's frequency but the lids'. */
  tempo?: number;
  /** [amplitude, rate] of the rise and fall, the breath, and the lean. */
  bob: [number, number];
  breath: [number, number];
  sway?: [number, number];
  hop?: HopSpec;
  /** A startled tremble: [amplitude, rate]. */
  shake?: [number, number];
  /** The tail's own swing, in degrees at the tip, and its rate. What the tail mostly
   * does is trail the body; this is what it does when the body is still. */
  wag: [number, number];
  handSwing?: [number, number];
  gaze: { wanderX: number; wanderY: number; hold: [number, number] };
  blink: [number, number] | null;
  wink?: [number, number];
  /** A kick: velocity into the body, on a random interval. */
  beat?: { y: number; rot: number; every: [number, number] };
}

const MOODS: Record<MascotMood, RigMood> = {
  /** Alive and doing nothing. Small on purpose; it has to survive being watched. */
  idle: {
    faces: [{ hands: 1 }, { hands: 1 }, { hands: 1 }, { hands: 1, ...SMILE }],
    faceHold: [6000, 13000],
    bob: [5, 1.15], breath: [0.034, 1.15],
    wag: [7, 1.9], handSwing: [1.75, 0.42],
    gaze: { wanderX: 0.5, wanderY: 0.35, hold: [2400, 5200] },
    blink: [4800, 11000], wink: [9000, 19000],
  },
  /** Today's resting state. It is idle, looking up a little more often: the eyes
   * close about every five and a half seconds rather than every eight, and the face
   * changes a little sooner, because this is the screen a person opens first and a
   * character that does nothing for ten seconds reads as not having noticed them.
   *
   * It used to be more than that — a deeper breath, a higher bob, a sway, every
   * spring a third faster. Those numbers were written for a character that moved as
   * one rigid picture, where they were what it took to be seen at all. On a body
   * whose parts each answer to it they are far too much: at the size this screen
   * draws it the outline visibly pulsed and everything hanging off it was thrown
   * about. The body's own motion is idle's, which is the one that was looked at and
   * agreed. */
  todayIdle: {
    faces: [{ hands: 1 }, { hands: 1 }, { hands: 1 }, { hands: 1, ...SMILE }],
    faceHold: [5000, 10000],
    bob: [5, 1.15], breath: [0.034, 1.15],
    wag: [7, 1.9], handSwing: [1.75, 0.42],
    gaze: { wanderX: 0.5, wanderY: 0.35, hold: [2200, 4600] },
    blink: [3600, 7600], wink: [9000, 19000],
  },
  /** Pleased. A small hop that lands softly, and a tail that will not keep still. */
  happy: {
    faces: [{ hands: 1, ...PERKY, ...SMILE }, { hands: 1, ...PERKY, ...AHA, lookX: 0, faceX: 0, spark: 1 }],
    faceHold: [2600, 5200],
    bob: [0, 1], breath: [0.018, 2.1],
    hop: { height: 7.7, rate: 1.0, crouch: 3.1, squash: 0.095 },
    wag: [14, 7], handSwing: [2.5, 1.0],
    gaze: { wanderX: 0.3, wanderY: 0.2, hold: [1600, 3200] },
    blink: null,
  },
  /** Bursting: faster, higher, and it punctuates. */
  excited: {
    faces: [
      { hands: 1, ...PERKY, squash: 1.008, eyeScale: 1.06, ...AHA, lookX: 0, lookY: -0.2, faceX: 0, spark: 1 },
      { hands: 1, ...PERKY, squash: 1.008, spark: 1, ...SMILE },
    ],
    faceHold: [1400, 2800],
    bob: [0, 1], breath: [0.026, 2.3],
    hop: { height: 12.8, rate: 1.28, crouch: 4.1, squash: 0.125 },
    wag: [18, 10], handSwing: [4, 2.3],
    gaze: { wanderX: 0.35, wanderY: 0.2, hold: [900, 1900] },
    blink: [2100, 4200], wink: [2200, 4800],
    beat: { y: -3.1, rot: 5, every: [1100, 2000] },
  },
  /** Working something out. Leaning away, looking off, and slow. */
  thinking: {
    faces: [
      { rot: -8, lidDrop: 0.06, tailTip: 6, question: 1, ...THINK },
      { rot: -8, tailTip: 6, question: 1, ...FOCUS, mouthO: 0, mouthArc: 1 },
    ],
    faceHold: [2200, 4200],
    bob: [2.3, 0.58], breath: [0.007, 0.58],
    wag: [8, 1.1],
    gaze: { wanderX: 0.4, wanderY: 0.25, hold: [1500, 3000] },
    blink: [3400, 7000],
    beat: { y: 0, rot: -14, every: [2600, 4400] },
  },
  /** Concentrating. Almost nothing moves, and that is the point. */
  focused: {
    faces: [{ rot: 2, x: 0.5, y: 1, squash: 0.997, ...FOCUS }],
    bob: [1.3, 1.2], breath: [0.005, 1.5],
    wag: [2, 1.5],
    gaze: { wanderX: 0.25, wanderY: 0.12, hold: [800, 1700] },
    blink: [3200, 6800],
  },
  /** Caught off guard: pulled up, stretched, eyes wide, tail on end, trembling. */
  surprised: {
    faces: [{
      hands: 1, y: -3.3, squash: 1.035, eyeScale: 1.12, pupilW: 0.85, pupilH: 0.85,
      ...ON_END, spark: 1, ...AHA,
    }],
    bob: [1, 0.9], breath: [0.008, 1.4], shake: [1.8, 20],
    wag: [2.5, 9], handSwing: [0.75, 1.6],
    gaze: { wanderX: 0.15, wanderY: 0.1, hold: [1500, 3000] },
    blink: [2000, 3800],
    beat: { y: -2.6, rot: 3, every: [2800, 5200] },
  },
  /** Going under: sitting low, breathing long, tail let go. */
  sleepy: {
    faces: [{ rot: 3, y: 4.1, ...LIMP, zzz: 1, ...SLEEP }],
    bob: [3.3, 0.33], breath: [0.03, 0.33],
    wag: [2, 0.5],
    gaze: { wanderX: 0.12, wanderY: 0.08, hold: [4000, 8000] },
    blink: null,
    beat: { y: 2.6, rot: 2, every: [4600, 8200] },
  },
  /** Just arrived, and looking about. */
  onboarding: {
    faces: [{ hands: 1, y: 1 }, { hands: 1, y: 1, ...SMILE }],
    faceHold: [4000, 9000],
    bob: [2.6, 0.62], breath: [0.013, 0.62],
    wag: [10, 2.6], handSwing: [1.5, 0.4],
    gaze: { wanderX: 0.95, wanderY: 0.3, hold: [1000, 2000] },
    blink: [4000, 9000],
  },
  /** Holding up the finished card. */
  learningComplete: {
    faces: [
      { ...HOLDING, ...PROUD },
      { ...HOLDING, ...AHA, lookX: 0.2, lookY: 0.3, faceX: 0 },
    ],
    faceHold: [2400, 4600],
    bob: [2.8, 1.1], breath: [0.013, 1.1],
    wag: [10, 4], handSwing: [2, 0.9],
    gaze: { wanderX: 0.25, wanderY: 0.15, hold: [1800, 3600] },
    blink: null,
    beat: { y: -2, rot: 2.5, every: [2400, 4200] },
  },
  /** Reading. Barely more than breathing, eyes down. */
  studyReview: {
    faces: [{ y: 0.5, lidDrop: 0.14, lookY: 0.35, converge: 5 }, { y: 0.5, lookY: 0.2 }],
    faceHold: [3000, 6500],
    bob: [2, 0.54], breath: [0.014, 0.54],
    wag: [3, 0.9],
    gaze: { wanderX: 0.2, wanderY: 0.1, hold: [2000, 4000] },
    blink: [3200, 7000],
  },
  /** Waiting on the network. The thinking face without the question: nothing is
   * being asked, work is being done. */
  working: {
    faces: [{ hands: 1, ...PERKY, ...THINK, lookY: -0.2 }],
    bob: [0, 1], breath: [0.02, 2],
    hop: { height: 9.2, rate: 1.15, crouch: 3.3, squash: 0.1 },
    wag: [10, 6], handSwing: [3, 1.4],
    gaze: { wanderX: 0.55, wanderY: 0.25, hold: [900, 1800] },
    blink: [2600, 5200],
  },
  /** Nothing here yet. It looks at the empty thing it is holding, then up at you,
   * and is not troubled by it: an empty place is somewhere to start, so this is
   * idle's ease with its attention pointed down. */
  wondering: {
    faces: [
      { hands: 1, y: 1, faceY: 2, lookY: 0.75, converge: 5 },
      { hands: 1, y: 1 },
      { hands: 1, y: 1, faceY: 2, lookY: 0.75, converge: 5 },
      { hands: 1, y: 1, ...SMILE },
    ],
    faceHold: [2600, 5200],
    bob: [3.2, 0.9], breath: [0.022, 0.9],
    wag: [8, 2.2], handSwing: [1.2, 0.4],
    gaze: { wanderX: 0.3, wanderY: 0.12, hold: [1800, 3600] },
    blink: [4000, 8600],
  },
  /** Nothing found. The head goes one way and then the other, the way anyone looks
   * for a thing that ought to be there, and the question stays up throughout. */
  searching: {
    faces: [
      { hands: 1, rot: -3, question: 1, tailTip: 6, faceX: -7, faceY: 2, lookX: -0.8, lookY: 0.45, converge: 2, mouthArc: 1, mouthY: 3.9 },
      { hands: 1, rot: -3, question: 1, tailTip: 6, faceX: 7, faceY: 2, lookX: 0.8, lookY: 0.45, converge: 2, mouthArc: 1, mouthY: 3.9 },
      { hands: 1, rot: -3, question: 1, tailTip: 6, faceX: 0, faceY: -2, lookX: 0, lookY: -0.3, mouthArc: 1, mouthY: 3.9 },
    ],
    faceHold: [1300, 2400],
    bob: [2, 0.7], breath: [0.012, 0.7],
    wag: [6, 1.4],
    gaze: { wanderX: 0.15, wanderY: 0.08, hold: [1200, 2400] },
    blink: [3200, 6400],
  },
  /** Something broke, and it knows. Sitting low, tail let go, looking at the damage
   * and now and then up at you to see how it has been taken. Slow: nothing about a
   * failure should be lively. */
  oops: {
    faces: [
      { hands: 1, y: 3, squash: 0.985, ...LIMP, ...SORRY },
      { hands: 1, y: 3, squash: 0.985, ...LIMP, ...SORRY, lookY: 0, lidDrop: 0.18, faceY: 0 },
    ],
    faceHold: [3200, 6000],
    bob: [1.6, 0.45], breath: [0.02, 0.45],
    wag: [2, 0.6],
    gaze: { wanderX: 0.12, wanderY: 0.06, hold: [2400, 4800] },
    blink: [2600, 5400],
    beat: { y: 2.2, rot: -2, every: [5200, 9000] },
  },
  /** The reward. It floats rather than hops: it never lands. */
  streakReward: {
    faces: [
      { hands: 1, y: -3, squash: 1.012, ...PERKY, spark: 1, ...SMILE },
      { hands: 1, y: -3, squash: 1.012, ...PERKY, spark: 1, eyeScale: 1.04, ...AHA, lookX: 0, faceX: 0 },
    ],
    faceHold: [1800, 3400],
    bob: [4.4, 0.72], breath: [0.014, 0.72], sway: [1.5, 0.72],
    wag: [11, 3], handSwing: [2.5, 0.6],
    gaze: { wanderX: 0.2, wanderY: 0.12, hold: [1600, 3200] },
    blink: null,
    beat: { y: -2.6, rot: 4, every: [1800, 3400] },
  },
};

/** A mood with its poses resolved to full arrays, which is what the solver reads. */
export interface CompiledMood extends Omit<RigMood, 'faces'> { faces: number[][] }

/** The channels that are the face. When a mood drifts from one of its poses to the
 * next, these are all that may change.
 *
 * The body, the horns, the tail, the hands and the marks belong to the mood and
 * come from its first pose. The frames each face was measured from put the horns
 * in different places — wider and tipped for the smile, drawn in for the surprise —
 * and carried over with the face they made the horns slide across the head and
 * turn every few seconds, for no reason anyone watching could see. And a mark is
 * an announcement: a character that threw up celebration marks whenever its face
 * happened to wander would be lying about what had happened. */
const FACE: ReadonlySet<Channel> = new Set<Channel>([
  'faceX', 'faceY', 'eyeGap',
  'openL', 'openR', 'lidDrop', 'lidTilt', 'cheek', 'arc', 'eyeScale', 'winkL', 'winkR',
  'eyeLX', 'eyeLY', 'eyeRX', 'eyeRY',
  'lookX', 'lookY', 'converge', 'pupilW', 'pupilH', 'pupilLX', 'pupilLY', 'pupilRX', 'pupilRY',
  'mouthO', 'mouthArc', 'mouthX', 'mouthY',
]);

function compile(faces: PosePatch[]): number[][] {
  const first = faces[0];
  return faces.map((patch, i) => CHANNELS.map((name) => {
    const from = i === 0 || FACE.has(name) ? patch : first;
    return from[name] ?? BASE[name];
  }));
}
export const RIG_MOODS = Object.fromEntries(
  (Object.keys(MOODS) as MascotMood[]).map((mood) => [
    mood, { ...MOODS[mood], faces: compile(MOODS[mood].faces) },
  ]),
) as Record<MascotMood, CompiledMood>;

// --- Springs -------------------------------------------------------------------

/** [frequency, damping] for a channel.
 *
 * Nothing here is critically damped except the lids. A soft body that arrives on
 * target and stops dead reads as mechanical, so everything that carries weight
 * overshoots a little and settles. A lid is the exception because a blink has to
 * snap: a soft blink reads as a droop. */
const SPRING: Partial<Record<Channel, [number, number]>> = {
  x: [2.6, 0.7], y: [3, 0.68], rot: [3.2, 0.62], squash: [7, 0.5],
  faceX: [6, 0.7], faceY: [6, 0.7], eyeGap: [6, 0.7],
  openL: [26, 1], openR: [26, 1],
  lidDrop: [12, 0.8], lidTilt: [12, 0.8], cheek: [12, 0.8], arc: [14, 0.8],
  eyeScale: [7, 0.6], winkL: [20, 0.7], winkR: [20, 0.7],
  lookX: [14, 0.85], lookY: [14, 0.85], converge: [8, 0.8],
  pupilW: [7, 0.6], pupilH: [7, 0.6],
  hornLX: [5, 0.55], hornLY: [5, 0.55], hornLRot: [5, 0.5],
  hornRX: [5, 0.55], hornRY: [5, 0.55], hornRRot: [5, 0.5],
  tailRaise: [4.5, 0.45], tailCurl: [4.5, 0.45], tailTip: [4.5, 0.45],
  hands: [9, 0.6], handLift: [4.2, 0.52],
  mouthO: [10, 0.5], mouthArc: [10, 0.6], mouthX: [6, 0.7], mouthY: [6, 0.7],
  spark: [10, 0.48], question: [9, 0.5], zzz: [5, 0.8], badge: [10, 0.48],
};
const DEFAULT_SPRING: [number, number] = [8, 0.7];
export const SPRING_FREQ = CHANNELS.map((name) => (SPRING[name] ?? DEFAULT_SPRING)[0]);
export const SPRING_DAMP = CHANNELS.map((name) => (SPRING[name] ?? DEFAULT_SPRING)[1]);
/** Channels a mood's tempo does not speed up. */
export const SPRING_FIXED = CHANNELS.map((name) => name === 'openL' || name === 'openR');

// --- The parts, as a person would name them ------------------------------------

/** The parts the lab can take hold of, and the channels each one answers to. */
export type RigPart =
  | 'body' | 'hornL' | 'hornR' | 'eyeL' | 'eyeR' | 'lids' | 'pupils'
  | 'tail' | 'handL' | 'handR' | 'mouth' | 'marks';

export interface PartControl { channel: Channel; label: string; min: number; max: number; unit?: string }

export const RIG_PARTS: { part: RigPart; label: string; controls: PartControl[] }[] = [
  { part: 'body', label: 'Body', controls: [
    { channel: 'x', label: 'Shift', min: -30, max: 30 },
    { channel: 'y', label: 'Height', min: -30, max: 30 },
    { channel: 'rot', label: 'Lean', min: -25, max: 25, unit: '°' },
    { channel: 'squash', label: 'Squash', min: -0.25, max: 0.25 },
  ] },
  { part: 'hornL', label: 'Horn L', controls: [
    { channel: 'hornLRot', label: 'Turn', min: -45, max: 45, unit: '°' },
    { channel: 'hornLX', label: 'Slide', min: -16, max: 16 },
    { channel: 'hornLY', label: 'Raise', min: -16, max: 16 },
  ] },
  { part: 'hornR', label: 'Horn R', controls: [
    { channel: 'hornRRot', label: 'Turn', min: -45, max: 45, unit: '°' },
    { channel: 'hornRX', label: 'Slide', min: -16, max: 16 },
    { channel: 'hornRY', label: 'Raise', min: -16, max: 16 },
  ] },
  { part: 'eyeL', label: 'Eye L', controls: [
    { channel: 'openL', label: 'Open', min: -1, max: 0.15 },
    { channel: 'winkL', label: 'Wink', min: 0, max: 1 },
    { channel: 'eyeLX', label: 'Across', min: -12, max: 12 },
    { channel: 'eyeLY', label: 'Down', min: -12, max: 12 },
  ] },
  { part: 'eyeR', label: 'Eye R', controls: [
    { channel: 'openR', label: 'Open', min: -1, max: 0.15 },
    { channel: 'winkR', label: 'Wink', min: 0, max: 1 },
    { channel: 'eyeRX', label: 'Across', min: -12, max: 12 },
    { channel: 'eyeRY', label: 'Down', min: -12, max: 12 },
  ] },
  { part: 'lids', label: 'Lids', controls: [
    { channel: 'lidDrop', label: 'Upper lid', min: 0, max: 0.8 },
    { channel: 'lidTilt', label: 'Slant', min: -30, max: 30, unit: '°' },
    { channel: 'cheek', label: 'Lower lid', min: 0, max: 1 },
    { channel: 'arc', label: 'Closed shape', min: -1.3, max: 1.3 },
    { channel: 'eyeScale', label: 'Size', min: -0.3, max: 0.3 },
  ] },
  { part: 'pupils', label: 'Pupils', controls: [
    { channel: 'lookX', label: 'Look across', min: -1, max: 1 },
    { channel: 'lookY', label: 'Look down', min: -1, max: 1 },
    { channel: 'converge', label: 'Turn in', min: -8, max: 8 },
    { channel: 'pupilW', label: 'Width', min: -0.5, max: 0.6 },
    { channel: 'pupilH', label: 'Height', min: -0.5, max: 0.4 },
    { channel: 'pupilLX', label: 'Left only', min: -12, max: 12 },
    { channel: 'pupilRX', label: 'Right only', min: -12, max: 12 },
  ] },
  { part: 'tail', label: 'Tail', controls: [
    { channel: 'tailRaise', label: 'Raise', min: -45, max: 45, unit: '°' },
    { channel: 'tailCurl', label: 'Curl', min: -40, max: 40, unit: '°' },
    { channel: 'tailTip', label: 'Tip', min: -60, max: 60, unit: '°' },
  ] },
  { part: 'handL', label: 'Hand L', controls: [
    { channel: 'handLX', label: 'Across', min: -24, max: 24 },
    { channel: 'handLY', label: 'Down', min: -24, max: 24 },
    { channel: 'handLRot', label: 'Turn', min: -45, max: 45, unit: '°' },
  ] },
  { part: 'handR', label: 'Hand R', controls: [
    { channel: 'handRX', label: 'Across', min: -24, max: 24 },
    { channel: 'handRY', label: 'Down', min: -24, max: 24 },
    { channel: 'handRRot', label: 'Turn', min: -45, max: 45, unit: '°' },
  ] },
  { part: 'mouth', label: 'Mouth', controls: [
    { channel: 'mouthO', label: 'Round', min: -1, max: 1.5 },
    { channel: 'mouthArc', label: 'Frown', min: -1, max: 1 },
    { channel: 'mouthX', label: 'Across', min: -12, max: 12 },
    { channel: 'mouthY', label: 'Down', min: -12, max: 12 },
  ] },
  { part: 'marks', label: 'Marks', controls: [
    { channel: 'spark', label: 'Spark', min: -1, max: 1 },
    { channel: 'question', label: 'Question', min: -1, max: 1 },
    { channel: 'zzz', label: 'Zzz', min: -1, max: 1 },
    { channel: 'badge', label: 'Badge', min: -1, max: 1 },
    { channel: 'hands', label: 'Hands', min: -1, max: 1 },
  ] },
];
export const RIG_PART_INDEX = Object.fromEntries(
  RIG_PARTS.map((p, i) => [p.part, i]),
) as Record<RigPart, number>;
