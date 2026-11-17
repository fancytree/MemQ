/** The four-point grid.
 *
 * Everything that separates two things — a gap, a padding, a margin — is one of
 * these nine values. The app had thirty-five: 5 and 6 and 7, 13 and 14, 17 and 18,
 * which is not a rhythm, it is thirty-five separate guesses. On a grid the eye can
 * tell 8 from 12; it cannot tell 13 from 14, so the difference only ever cost
 * someone a decision.
 *
 * `hair` is the exception the grid earns: two points, for a label sitting directly
 * over the thing it names, where four already reads as a gap.
 *
 * The keys count in fours — `space[3]` is three fours — so the scale stays legible
 * when it is read back in a style: `gap: space[2], padding: space[4]`.
 */
export const space = {
  hair: 2,
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
} as const;

/** How round a thing is.
 *
 * Five steps. `pill` is for anything whose corners should disappear — a button, a
 * chip, a progress bar, an avatar — and it is a single large number rather than a
 * measured half-height, so a control that changes size stays round.
 */
export const radius = {
  /** An input, a small tag, a tile. */
  sm: 8,
  /** A panel inside a card. */
  md: 16,
  /** A card. */
  lg: 24,
  /** A sheet, and the large cards a screen is built from. */
  xl: 32,
  pill: 100,
} as const;

/** Page geometry: the one measurement that is not a gap between two things. */
export const layout = {
  /** Every page's side margin. A screen that sets its own is a screen that will
   *  not line up with the next one. */
  screenInline: 16,
} as const;

export const hairline = 1;
