/** Which rendered part art each state's face is made of.
 *
 * `pose.ts` names expressions in a vocabulary that was invented for an eye drawn as a
 * polygon, where any shape could be built on demand and morphed into any other. The
 * mascot's eyes are rendered art, so the vocabulary now has to land on a fixed set of
 * six variants. Several names share one: `squint`, `slit`, `sly` and `downcast` are
 * all a narrowed eye, and at the size this character is drawn the differences between
 * them were carried by the tilt, which rendered art cannot vary.
 *
 * What is kept is the distinction that reads: open, wide, narrowed, squeezed shut,
 * the angled brow, and the two blink frames. Scale and offset do the rest, which is
 * honest — those six names differed mostly in scale to begin with.
 */
import type { InklingMood } from '../inkling/pose';
import type { EyeName } from '../inkling/eye';
import type { MascotPartName } from './parts';

export interface EyeArt {
  /** `pair` draws the two neutral whites; anything else is a single part spanning both. */
  whites: 'pair' | MascotPartName;
  /** Whether the pupils are drawn on top. The closed and narrowed art already has
   * whatever it needs baked in; the open, wide and focused whites do not. */
  pupils: boolean;
  /** Extra scale on the eye group, about its own centre. */
  sx: number;
  sy: number;
  /** Vertical nudge as a fraction of the canvas, positive is lower. */
  dy: number;
}

const OPEN: EyeArt = { whites: 'pair', pupils: true, sx: 1, sy: 1, dy: 0 };

export const EYE_ART: Record<EyeName, EyeArt> = {
  neutral: OPEN,
  wide: { whites: 'eyes_wide', pupils: true, sx: 1, sy: 1, dy: 0 },
  huge: { whites: 'eyes_wide', pupils: true, sx: 1.09, sy: 1.09, dy: -0.004 },
  tall: { ...OPEN, sx: 0.93, sy: 1.11 },
  focused: { whites: 'eyes_focused', pupils: true, sx: 1, sy: 1, dy: 0 },
  glance: { ...OPEN, sx: 0.97, sy: 1.04, dy: -0.005 },
  dot: { ...OPEN, sx: 0.74, sy: 0.74 },
  squint: { whites: 'eyes_sleepy', pupils: false, sx: 1, sy: 1, dy: -0.03 },
  slit: { whites: 'eyes_sleepy', pupils: false, sx: 1, sy: 0.72, dy: -0.028 },
  arc: { whites: 'eyes_squeezed', pupils: false, sx: 1, sy: 1, dy: 0 },
  // The angled brow is the one piece of art that carries anger on its own.
  cross: { whites: 'eyes_focused', pupils: true, sx: 1, sy: 1, dy: 0.004 },
  sly: { whites: 'eyes_sleepy', pupils: false, sx: 1, sy: 0.88, dy: -0.03 },
  downcast: { whites: 'eyes_sleepy', pupils: false, sx: 1, sy: 1, dy: -0.022 },
};

/** The two blink frames, chosen by the lid spring rather than tweened: a blink in
 * rendered art is a frame swap, and the spring supplies its timing. */
export const BLINK_ART = {
  half: 'eyes_blink_half' as MascotPartName,
  closed: 'eyes_blink_closed' as MascotPartName,
};
/** Blink frame thresholds, as fractions of the state's own resting lid rather than
 * absolute values. A state that rests at 0.6 is squinting, not blinking, and must not
 * be stuck in the half-blink frame because it sits below an absolute threshold. */
export const LID_CLOSED = 0.42;
export const LID_HALF = 0.78;

export type MouthName = 'mouth_smile' | 'mouth_open' | 'mouth_round' | 'mouth_sleepy';

/** A mouth per state. The polygon character had none, so there is nothing to port —
 * these follow the expression sheet: open for the loud states, round for the startled
 * ones, a lowered line for the ones that are going under, a small smile otherwise. */
export const MOUTH: Record<InklingMood, MouthName> = {
  sleeping: 'mouth_sleepy', waking: 'mouth_smile', idle: 'mouth_smile',
  listening: 'mouth_smile', thinking: 'mouth_smile', searching: 'mouth_smile',
  working: 'mouth_smile', excited: 'mouth_open', surprised: 'mouth_round',
  suspicious: 'mouth_smile', angry: 'mouth_smile', drowsy: 'mouth_sleepy',
  happy: 'mouth_open', curious: 'mouth_round', confused: 'mouth_round',
  bored: 'mouth_sleepy', proud: 'mouth_smile', shy: 'mouth_smile',
  sad: 'mouth_sleepy', laughing: 'mouth_open', scared: 'mouth_round',
  playful: 'mouth_open', celebrate: 'mouth_open',
};

/** The small accents that belong to a state rather than to a scene. The laptop, book
 * and card are set dressing for the four scene illustrations and are deliberately not
 * reachable from here. */
export const PROP: Partial<Record<InklingMood, MascotPartName>> = {
  sleeping: 'zzz', drowsy: 'zzz',
  excited: 'gold_accents', surprised: 'gold_accents', celebrate: 'gold_accents',
};

/** States that hold an arm out far enough to clear the body, where the reaching art
 * replaces the resting nub. Below this the resting arm is what shows. */
export const REACH_ARM: Partial<Record<InklingMood, boolean>> = {
  thinking: true, happy: true, excited: true, celebrate: true, playful: true,
  proud: true, searching: true, laughing: true,
};
