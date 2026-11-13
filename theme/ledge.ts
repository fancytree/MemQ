/** How deep the coloured lip under a raised surface is.
 *
 * Every raised thing in this app is two layers: a darker shell with a lighter face
 * sitting on it, offset so a band of the shell shows along the bottom edge. In a
 * flat palette with no shadows that band is the only depth there is, so it has to be
 * consistent — mixed depths read as several designs sharing a screen rather than one.
 *
 * The scale is by weight, not by size. The deeper the lip, the more the surface is
 * asking for:
 *
 *   lead     the one filled button on a screen, the thing it wants you to press
 *   raised   a card that holds content
 *   control  a small control: a social button, a chip, a toggle
 *
 * A surface's shell is its face plus its lip, so a 60-point square face needs a
 * 60 by 62 shell at `control`. Sizing the shell instead of the face is the mistake
 * this scale exists to stop: it leaves the face shorter than it is wide.
 */
export const ledge = {
  lead: 5,
  raised: 3,
  control: 2,
} as const;

export type LedgeDepth = keyof typeof ledge;
