/** Manrope: primary UI. Inter: compact utility/numbers. Caveat: short supportive annotations.
 * All faces are bundled and loaded by theme/font-assets.ts; no network font request at runtime.
 */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extraBold: 'Manrope_800ExtraBold',
  utility: 'Inter_400Regular',
  utilitySemibold: 'Inter_600SemiBold',
  annotation: 'Caveat_400Regular',
  code: 'JetBrainsMono_400Regular', // Implementation extension for actual code samples only.
  // Legacy aliases; they no longer imply serif or monospace application typography.
  grotesk: 'Manrope_400Regular',
  serif: 'Manrope_400Regular',
  mono: 'Inter_400Regular',
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

/** Runtime adaptations. Explicit line heights for Auto roles and zero RAW tracking
 * are implementation choices pending visual calibration; 12pt nav improves readability.
 * Body/learning roles are extensions, not extracted study specifications.
 */
export const type = {
  sheetHeading: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 30 },
  formLabel: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 19 },
  detailLabel: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20 },
  lessonTitle: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 31 },
  lessonStatistic: { fontFamily: fonts.semibold, fontSize: 24, lineHeight: 31 },
  termTitle: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 25 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  input: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyReading: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  controlLink: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  wordmark: { fontFamily: fonts.extraBold, fontSize: 25, lineHeight: 32, letterSpacing: -1.1 },
  dailyGreeting: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 32, letterSpacing: -1.1 },
  dailyInvitation: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 20 },
  dueCount: { fontFamily: fonts.bold, fontSize: 48, lineHeight: 54, letterSpacing: -1.1 },
  dueLabel: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 23, letterSpacing: -1.1 },
  dueEstimate: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  heroAction: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 24 },
  page: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 34 },
  noteCount: { fontFamily: fonts.semibold, fontSize: 19, lineHeight: 26 },
  section: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 26 },
  goalLabel: { fontFamily: fonts.regular, fontSize: 20, lineHeight: 28 },
  button: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  courseTitle: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 19 },
  meta: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  streak: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  navActive: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  navInactive: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  greeting: { fontFamily: fonts.utility, fontSize: 14, lineHeight: 20 },
  initial: { fontFamily: fonts.utilitySemibold, fontSize: 14, lineHeight: 20 },
  goalNumber: { fontFamily: fonts.utility, fontSize: 15, lineHeight: 21 },
  annotation: { fontFamily: fonts.annotation, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25 },
  bodyMd: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 25 },
  learning: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 29 },
  small: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  micro: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  // Compatibility type roles, neutralized; new code should prefer the named roles above.
  display: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 34 },
  h1: { fontFamily: fonts.bold, fontSize: 30, lineHeight: 34 },
  h2: { fontFamily: fonts.bold, fontSize: 19, lineHeight: 26 },
  h3: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 19 },
} as const;
