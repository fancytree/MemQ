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

import { colors } from './colors';
import { layout, radius, space } from './spacing';

/** The scale's own sheet corner. It was 28 — a number that appears nowhere else in
 *  the app, sitting between the card's 24 and the large card's 32 and matching
 *  neither, which is what a measured-by-eye radius looks like six months later. */
const RADIUS = radius.xl;

export const sheet = {
  /** The dimmed screen behind it. Press it to dismiss. */
  scrim: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  /** The surface itself: square at the bottom, where the screen edge cuts it off.
   *
   *  Canvas, not white — the same ground the screens stand on. A sheet is a place for
   *  cards, and cards are white: on a white sheet their edges disappear and only the
   *  lip underneath shows, which is the same way a white row vanished inside a white
   *  card elsewhere in the app. */
  surface: {
    borderTopLeftRadius: RADIUS,
    borderTopRightRadius: RADIUS,
    backgroundColor: colors.bg,
    overflow: 'hidden' as const,
  },
  /** The grab bar. It says the sheet can be pulled down, so it belongs on sheets that
   *  can be, and only those. */
  handle: {
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    alignSelf: 'center' as const,
    marginTop: space[2],
    marginBottom: space[3],
  },
  /** The row of title and actions across the top of a sheet, with no rule under it:
   *  the gap below does that work. It keeps the page's own side margin, which is
   *  what the bodies underneath it keep: at the 20 it used to take, every sheet's
   *  title stood four points out from the content it named. */
  head: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space[2],
    paddingHorizontal: layout.screenInline,
    paddingTop: space[1],
    paddingBottom: space[3],
  },
} as const;
