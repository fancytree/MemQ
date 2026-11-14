/** What a sheet looks like when it comes up over a screen.
 *
 * Every modal in the app was drawing its own: top radii of 16, 20 and 28, some with a
 * hairline outline around the top edge, some with a grab handle and some without, and
 * scrims from two different tokens. They are the same object — a surface sliding up
 * over the screen you were on — and when the corner radius changes between two of
 * them the app looks assembled rather than designed.
 *
 * The radius matches the cards a sheet is usually opened from, so the thing that
 * arrives belongs to the same set as the thing that was tapped. There is no outline:
 * this palette separates surfaces by colour and by the lip underneath them, never by
 * a line drawn around them.
 */

import { homeColors } from './colors';
import { colors } from './index';

/** The same radius the cards carry, so a sheet belongs to the set it opened from. */
const RADIUS = 28;

export const sheet = {
  /** The dimmed screen behind it. Press it to dismiss. */
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.modalScrim,
  },
  /** The surface itself: square at the bottom, where the screen edge cuts it off. */
  surface: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    backgroundColor: homeColors.white,
    overflow: 'hidden' as const,
  },
  /** The grab bar. It says the sheet can be pulled down, so it belongs on sheets that
   *  can be, and only those. */
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: homeColors.border,
    alignSelf: 'center' as const,
    marginTop: 10,
    marginBottom: 14,
  },
  /** The row of title and actions across the top of a sheet, with no rule under it:
   *  the gap below does that work. */
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
} as const;
