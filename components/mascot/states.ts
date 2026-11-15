import type { MascotMood } from './rig/rig';

/** The empty and error states, as pictures.
 *
 * Each is the character and one thing: it sits behind the thing with its hands
 * over the edge, the way it sits behind the hill on Today, and the thing says what
 * the state is. An empty card for nothing here yet, a search field for nothing
 * found, a blanket for nothing left to do, a card in two pieces for something
 * broke, and a card with the signal struck through for no connection. The character says how to
 * take it: at ease when the place is merely empty, sorry when something failed.
 *
 * The thing is drawn here, from numbers, in the character's own units and measured
 * from its body's centre, so it stays put under the hands at any size. This file is
 * only the description. What colours the inks are and how it gets on screen is
 * MascotState's business, which keeps this readable by anything that can draw a
 * path.
 */
export type MascotStateKind = 'empty' | 'noResults' | 'caughtUp' | 'error' | 'offline';

/** What a shape is drawn in. Names, not colours: the character's own ink for what
 * should read as part of the drawing, and the page's quiet tones for the rest. */
export type StateInk = 'outline' | 'gold' | 'paper' | 'soft' | 'line' | 'faint';

export interface StateShape {
  d: string;
  fill?: StateInk;
  stroke?: StateInk;
  width?: number;
  /** Dash and gap, for an outline of something that is not there yet. */
  dash?: [number, number];
  /** Degrees clockwise, about a point. */
  turn?: [number, number, number];
}

export interface MascotStateSpec {
  mood: MascotMood;
  /** Added to wherever the mood looks. */
  look?: { x?: number; y?: number };
  /** What it holds, back to front. */
  prop: StateShape[];
  /** What a screen would say under it. The picture is made to go with words like
   * these; a screen writes its own. */
  title: string;
  copy: string;
}

/** The height the hands rest at, and where each is, from the body's centre. These
 * are the rig's level hands; every edge below is drawn to pass under them. */
const EDGE = 54;

const n = (v: number) => Math.round(v * 100) / 100;
/** A rectangle with round corners. */
function box(x: number, y: number, w: number, h: number, r: number) {
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}Q${n(x + w)} ${n(y)} ${n(x + w)} ${n(y + r)}V${n(y + h - r)}`
    + `Q${n(x + w)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)}H${n(x + r)}Q${n(x)} ${n(y + h)} ${n(x)} ${n(y + h - r)}`
    + `V${n(y + r)}Q${n(x)} ${n(y)} ${n(x + r)} ${n(y)}Z`;
}
function ring(cx: number, cy: number, r: number) {
  return `M${n(cx - r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx + r)} ${n(cy)}A${r} ${r} 0 1 0 ${n(cx - r)} ${n(cy)}Z`;
}
const line = (...p: number[]) => `M${p[0]} ${p[1]}` + p.slice(2).reduce(
  (d, v, i) => d + (i % 2 === 0 ? `L${v}` : ` ${v}`), '');

// --- Nothing here yet: a card that has not been made ------------------------------

const EMPTY: StateShape[] = [
  { d: box(-98, EDGE, 188, 60, 16), fill: 'paper', stroke: 'line', width: 3.5, dash: [9, 8] },
  { d: line(-15, 89, 7, 89), stroke: 'outline', width: 5 },
  { d: line(-4, 78, -4, 100), stroke: 'outline', width: 5 },
];

// --- Nothing found: a search field with something typed and nothing under it ------

const NO_RESULTS: StateShape[] = [
  { d: box(-102, EDGE, 196, 58, 29), fill: 'paper', stroke: 'outline', width: 5 },
  { d: ring(-72, 87, 8.5), stroke: 'outline', width: 4.5 },
  { d: line(-65.5, 93.5, -58.5, 100.5), stroke: 'outline', width: 4.5 },
  // What was typed.
  { d: line(-42, 89, 0, 89), stroke: 'faint', width: 8 },
  // The cross that clears it.
  { d: line(60, 83, 72, 95), stroke: 'line', width: 3.5 },
  { d: line(72, 83, 60, 95), stroke: 'line', width: 3.5 },
];

// --- Nothing left to do: tucked in --------------------------------------------------

const BLANKET_TOP = `M-112 ${EDGE + 9}Q-92 ${EDGE - 5} -68 ${EDGE + 2}T-22 ${EDGE + 1}T28 ${EDGE + 2}T76 ${EDGE + 1}Q94 ${EDGE - 3} 104 ${EDGE + 9}`;
const CAUGHT_UP: StateShape[] = [
  { d: `${BLANKET_TOP}V94Q104 112 86 113Q-4 119 -94 113Q-112 112 -112 94Z`, fill: 'soft', stroke: 'outline', width: 5 },
  // The turned-back hem.
  { d: `M-112 ${EDGE + 25}Q-92 ${EDGE + 11} -68 ${EDGE + 18}T-22 ${EDGE + 17}T28 ${EDGE + 18}T76 ${EDGE + 17}Q94 ${EDGE + 13} 104 ${EDGE + 25}`, stroke: 'outline', width: 3.5 },
  // Spots, staggered the way a printed blanket's are.
  { d: ring(-76, 95, 3.4), fill: 'gold' },
  { d: ring(-40, 103, 3.4), fill: 'gold' },
  { d: ring(-4, 95, 3.4), fill: 'gold' },
  { d: ring(32, 103, 3.4), fill: 'gold' },
  { d: ring(68, 95, 3.4), fill: 'gold' },
];

// --- Something broke: one card, in two pieces ----------------------------------------

/** How far each piece has dropped at the break. They hinge on the hands. */
const SAG = 6;
const ERROR: StateShape[] = [
  {
    d: 'M-82 54H-10L-19 67L-6 79L-17 93L-8 112H-82Q-98 112 -98 96V70Q-98 54 -82 54Z',
    fill: 'paper', stroke: 'outline', width: 5, turn: [SAG, -63, EDGE],
  },
  { d: line(-82, 82, -40, 82), stroke: 'faint', width: 7, turn: [SAG, -63, EDGE] },
  { d: line(-82, 97, -54, 97), stroke: 'faint', width: 7, turn: [SAG, -63, EDGE] },
  {
    d: 'M-2 54H74Q90 54 90 70V96Q90 112 74 112H0L-9 93L2 79L-11 67Z',
    fill: 'paper', stroke: 'outline', width: 5, turn: [-SAG, 55, EDGE],
  },
  { d: line(22, 82, 72, 82), stroke: 'faint', width: 7, turn: [-SAG, 55, EDGE] },
  { d: line(22, 97, 52, 97), stroke: 'faint', width: 7, turn: [-SAG, 55, EDGE] },
];

// --- No connection: a card with no signal on it ---------------------------------------

/** A quarter of a circle, opening upward: one bar of the signal mark. */
function bar(cx: number, cy: number, r: number) {
  const k = r * Math.SQRT1_2;
  return `M${n(cx - k)} ${n(cy - k)}A${r} ${r} 0 0 1 ${n(cx + k)} ${n(cy - k)}`;
}
const OFFLINE: StateShape[] = [
  { d: box(-98, EDGE, 188, 64, 16), fill: 'paper', stroke: 'outline', width: 5 },
  { d: ring(-4, 107, 4), fill: 'line' },
  { d: bar(-4, 107, 14), stroke: 'line', width: 5 },
  { d: bar(-4, 107, 26), stroke: 'line', width: 5 },
  { d: bar(-4, 107, 38), stroke: 'line', width: 5 },
  // Struck through. The wider stroke under it is the card's own colour, so the bars
  // stop short of the line instead of running into it.
  { d: line(-33, 76, 23, 111), stroke: 'paper', width: 12 },
  { d: line(-33, 76, 23, 111), stroke: 'outline', width: 5 },
];

export const MASCOT_STATES: Record<MascotStateKind, MascotStateSpec> = {
  empty: {
    mood: 'wondering', prop: EMPTY,
    title: 'Nothing here yet', copy: 'Make your first lesson and it will show up here.',
  },
  noResults: {
    mood: 'searching', prop: NO_RESULTS,
    title: 'No matches', copy: 'Try a different word, or clear the search.',
  },
  caughtUp: {
    mood: 'sleepy', prop: CAUGHT_UP,
    title: 'All caught up', copy: 'Nothing is due. Come back tomorrow.',
  },
  error: {
    mood: 'oops', prop: ERROR,
    title: 'Something went wrong', copy: 'That didn’t load. Try again.',
  },
  offline: {
    mood: 'oops', prop: OFFLINE,
    title: 'You’re offline', copy: 'Check your connection and try again.',
  },
};

export const MASCOT_STATE_KINDS = Object.keys(MASCOT_STATES) as MascotStateKind[];
