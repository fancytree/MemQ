/** Geist is the UI family; Oswald is used for compact display and numeric emphasis. */
export const fonts = {
  regular: 'Geist_400Regular',
  medium: 'Geist_500Medium',
  semibold: 'Geist_600SemiBold',
  bold: 'Geist_700Bold',
  extraBold: 'Geist_800ExtraBold',
  display: 'Oswald_600SemiBold',
  utility: 'Geist_400Regular',
  utilitySemibold: 'Geist_600SemiBold',
  annotation: 'Geist_400Regular',
  code: 'Geist_400Regular', // Implementation extension for actual code samples only.
  // Legacy aliases; they no longer imply serif or monospace application typography.
  grotesk: 'Geist_400Regular',
  serif: 'Geist_400Regular',
  mono: 'Geist_400Regular',
} as const;
export type FontFamily = keyof typeof fonts;

/** Source measurements retain Auto and RAW tracking literally; no invented conversion. */
export const referenceTypography = {
  wordmark: { family: 'Manrope', weight: 800, size: 25, lineHeight: 32, tracking: -1.1 },
  dailyGreeting: { family: 'Manrope', weight: 500, size: 20, lineHeight: 32, tracking: -1.1 },
  dailyInvitation: { family: 'Manrope', weight: 400, size: 16, lineHeight: '113%' },
  dueCount: { family: 'Manrope', weight: 700, size: 48, lineHeight: '113%', tracking: -1.1 },
  dueLabel: { family: 'Manrope', weight: 700, size: 20, lineHeight: '113%', tracking: -1.1 },
  dueEstimate: { family: 'Manrope', weight: 400, size: 14, lineHeight: '113%' },
  heroAction: { family: 'Manrope', weight: 400, size: 16, lineHeight: 'Auto' },
  page: { family: 'Manrope', weight: 700, size: 30, lineHeight: '113%', tracking: -1.1, trackingUnit: 'RAW' },
  noteCount: { family: 'Manrope', weight: 600, size: 19, lineHeight: 'Auto', tracking: -0.6, trackingUnit: 'RAW' },
  section: { family: 'Manrope', weight: 700, size: 19, lineHeight: 'Auto', tracking: -0.6, trackingUnit: 'RAW' },
  goalLabel: { family: 'Manrope', weight: 400, size: 20, lineHeight: 'Auto' },
  button: { family: 'Manrope', weight: 600, size: 16, lineHeight: 'Auto' },
  courseTitle: { family: 'Manrope', weight: 600, size: 15, lineHeight: '125%', tracking: -0.25, trackingUnit: 'RAW' },
  meta: { family: 'Manrope', weight: 400, size: 12, lineHeight: 'Auto' },
  streak: { family: 'Manrope', weight: 600, size: 13, lineHeight: 'Auto' },
  navActive: { family: 'Manrope', weight: 600, size: 10, lineHeight: 'Auto' },
  navInactive: { family: 'Manrope', weight: 400, size: 10, lineHeight: 'Auto' },
  greeting: { family: 'Inter', weight: 400, size: 14, lineHeight: 'Auto' },
  initial: { family: 'Inter', weight: 600, size: 14, lineHeight: 'Auto' },
  status: { family: 'Inter', weight: 600, size: 15, lineHeight: 'Auto' },
  goalNumber: { family: 'Inter', weight: 'mixed 600/400', size: 15, lineHeight: 'Auto' },
  annotation: { family: 'Caveat', weight: 400, size: 18, lineHeight: 'Auto' },
} as const;

/** The type scale. Seven steps, and nothing else.
 *
 * Each step is a decision about what the words are doing, and the steps are far
 * enough apart that the decision is visible: a heading cannot be mistaken for body
 * copy at a glance, which is what a scale is for. Before this there were twenty-five
 * font sizes in the app — 12 and 13 and 14 and 15 — which is not a scale, it is a
 * record of twenty-five separate afternoons.
 *
 * The rhythm accelerates. Between reading sizes the steps are small (12 · 14 · 16),
 * because the eye needs fine distinctions there and a jump would shout; above them
 * they open out (20 · 26 · 34 · 46), because a display size is a different kind of
 * thing from a label, not a louder one.
 *
 * Line heights are multiples of four, so stacked text keeps to the same grid the
 * spacing scale uses, and they tighten as the size grows: 1.5 at body, 1.1 at the
 * largest, where generous leading only pulls a heading apart.
 *
 * Each step carries the weight it is normally set in. Where a role needs another —
 * a link in the body, a semibold label — the call site says so and nothing else
 * changes:
 *
 *     caption: { ...type.caption, fontFamily: fonts.semibold }
 */
export const type = {
  /** The one big number on a screen: cards due, a streak, a score. */
  display: { fontFamily: fonts.display, fontSize: 46, lineHeight: 52 },
  /** A screen that is mostly one statement — a finished session, a welcome. */
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  /** A screen's own title, and the term on a card being studied. */
  page: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32 },
  /** The heading over a section, and the largest thing inside a card. */
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28 },
  /** Reading copy, what is typed into an input, the label on a button. */
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  /** Secondary copy: a subtitle, a hint, the second line of a row. */
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  /** A label, a chip, a count — words that name something rather than say it. */
  caption: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16 },
} as const;

export type TypeRole = keyof typeof type;

/** A role with its leading taken off, for text that is one line.
 *
 * Leading is the room between lines, and iOS puts all of it ABOVE the glyphs
 * rather than splitting it: a 16-point word in a 24-point line box sits eight
 * points lower than its box suggests. On a paragraph that is what leading is for.
 * On a single line — a card's title, a label, what is typed into a field — there
 * is no next line to separate, so the eight points become a gap above the words
 * that nobody asked for, and the padding around them stops meaning what it says.
 *
 * Without a line height the font sets its own, which is what fits the glyphs.
 *
 *     sectionTitle: { ...oneLine(type.body), fontFamily: fonts.semibold }
 */
export function oneLine<T extends { lineHeight: number }>(role: T): Omit<T, 'lineHeight'> {
  const { lineHeight: _leading, ...rest } = role;
  return rest;
}
