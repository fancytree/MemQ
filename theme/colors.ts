/** MemQ · Today reference palette, supplied source inspection dated 2026-10-21.
 * Measured values are evidence, not a claim of WCAG compliance or published Figma variables.
 * Structural UI is neutral. Illustration colors must never become action/feedback colors.
 */
export const referenceColors = {
  canvas: '#FFFFFF',
  inkPrimary: '#242424',
  inkWordmark: '#151719',
  inkMuted: '#858580',
  inkSupporting: '#656560', // Library 57:2036 reading copy.
  surfaceNeutral: '#F7F7F4',
  selectionNeutral: '#F2F2EF',
  sheetHandle: '#DADAD5',
  modalScrim: 'rgba(36, 36, 36, 0.31)',
  lineSubtle: '#EEEEEB',
  inkAnnotation: '#76705A',
  todayNote: '#FCF6DB',
  paperPeach: '#FBECE5',
  paperLilac: '#F1ECFA',
  paperBlue: '#EAF4F9',
  todayTape: '#FFD1B7', // Source layer opacity is 0.51; do not bake it into this RGB.
  cup: '#DC7F69',
  brain: '#8D75BC',
  chart: '#5C9993',
  coin: '#E5B04E',
  wordmarkRays: '#9680F0',
  inklingBody: '#BAADEE',
  inklingFeatures: '#293133',
  drawnInk: '#30352E',
  notePaper: '#FFF5C8',
  paperFold: '#EADDA5',
  paperFineLine: '#E1D6A8',
  ruledPage: '#FAF9F1',
  paperRule: '#DDDCD1',
  clip: '#7C7194',
  reminderPeach: '#FCEBE3',
  pin: '#E58E77',
  pinLight: '#F3AB96',
  pinLine: '#A56C57',
  heart: '#E88D77',
  stamp: '#EA875F',
  stampHeart: '#FFE6A1',
  rays: '#D5AA58',
  tapePeach: '#F6B7AC', // Source layer opacity 0.82.
  tapeLilac: '#EEE8F9', // Source layer opacity 0.90.
  tapePeachLine: '#E69C90',
  tapeLilacLine: '#D7CEE9',
  paperclip: '#B6A8DD',
  flower: '#EAC765',
  flowerLight: '#F5E8B0',
  leaf: '#72AA96',
  leafLine: '#416A58',
  planeTrail: '#A7A094',
  bookPaper: '#FCFBF6',
  bookmarkBlue: '#EAF4F7',
} as const;

/** Implementation extensions. Accessible text/control values and semantic feedback
 * are explicit runtime decisions; they were NOT measured from the supplied references.
 */
const extension = {
  textSecondary: '#52524F',
  textMuted: '#686863',
  controlBorder: '#7A7A74',
  actionPressed: '#151719',
  disabledBg: '#EEEEEB',
  scrim: 'rgba(21, 23, 25, 0.48)',
  green: '#176B46', greenL: '#EAF7EF',
  red: '#B52F2F', redL: '#FFF0ED',
  warn: '#875807', warnL: '#FFF5E4',
  info: '#304FA8', infoL: '#EEF2FF',
  google: '#4285F4',
  notification: '#FF231F7C',
  // Quarantined legacy mascot artwork. Not Inkling; replace with authored assets during screen migration.
  buddyBody: '#F58A35', buddyHighlight: '#FFB86E', buddyInk: '#3B302A',
  buddyPupil: '#31383C', buddyBlush: '#FFD0AB', buddyBadge: '#FFD06B',
} as const;

/** Stable runtime API. Old accent/gradient names are compatibility aliases, neutralized.
 * New components should use semanticColor or the explicit action/text/surface tokens.
 */
export const colors = {
  bg: referenceColors.canvas,
  surf: referenceColors.canvas,
  surfaceSubtle: referenceColors.surfaceNeutral,
  border: referenceColors.lineSubtle,
  borderS: referenceColors.lineSubtle,
  controlBorder: extension.controlBorder,
  focus: referenceColors.inkPrimary,

  brand: extension.buddyBody, // Deprecated: only for the legacy buddy, never structural UI.
  accent: referenceColors.inkPrimary,
  accentText: referenceColors.inkPrimary,
  accentDark: referenceColors.inkWordmark,
  accentL: referenceColors.surfaceNeutral,
  accentRing: referenceColors.lineSubtle,
  accentShadow: 'transparent',
  accentShadowLg: 'transparent',
  onAccent: referenceColors.canvas,
  action: referenceColors.inkPrimary,
  actionPressed: extension.actionPressed,
  onAction: referenceColors.canvas,
  actionShadow: 'transparent',
  onDark: referenceColors.canvas,

  text: referenceColors.inkPrimary,
  sub: extension.textSecondary,
  supporting: referenceColors.inkSupporting,
  selectionNeutral: referenceColors.selectionNeutral,
  sheetHandle: referenceColors.sheetHandle,
  modalScrim: referenceColors.modalScrim,
  paperIvory: referenceColors.ruledPage,
  muted: extension.textMuted,
  dim: referenceColors.lineSubtle,
  disabledBg: extension.disabledBg,
  disabledText: extension.textMuted,
  switchTrack: extension.controlBorder,

  green: extension.green, greenL: extension.greenL,
  red: extension.red, redL: extension.redL,
  warn: extension.warn, warnL: extension.warnL,
  info: extension.info, infoL: extension.infoL,
  ai: referenceColors.inkPrimary,
  aiL: referenceColors.surfaceNeutral,
  aiGradientEnd: referenceColors.inkPrimary,

  heroBg: referenceColors.surfaceNeutral, // A hero is not automatically a paper note.
  heroBorder: referenceColors.lineSubtle,
  progressTrack: referenceColors.lineSubtle,
  studyGradientStart: referenceColors.canvas,
  studyGradientEnd: referenceColors.canvas,
  learningBg: referenceColors.surfaceNeutral,
  familiarBg: referenceColors.surfaceNeutral,
  proficientBg: referenceColors.surfaceNeutral,
  proficientText: referenceColors.inkPrimary,

  paperToday: referenceColors.todayNote,
  paperPeach: referenceColors.paperPeach,
  paperLilac: referenceColors.paperLilac,
  paperBlue: referenceColors.paperBlue,
  annotation: referenceColors.inkAnnotation,
  inklingBody: referenceColors.inklingBody,
  inklingFeatures: referenceColors.inklingFeatures,
  wordmark: referenceColors.inkWordmark,
  wordmarkRays: referenceColors.wordmarkRays,

  transparent: 'transparent',
  scrim: extension.scrim,
  shadow: 'transparent', // Flat reference language; native overlays remain system-owned.
  surfaceGlass: referenceColors.canvas,
  google: extension.google,
  buddyHighlight: extension.buddyHighlight,
  buddyInk: extension.buddyInk,
  buddyPupil: extension.buddyPupil,
  buddyBlush: extension.buddyBlush,
  buddyBadge: extension.buddyBadge,
  notification: extension.notification,
} as const;

/** Preferred semantic aliases for new patterns. */
export const semanticColor = {
  surface: { canvas: colors.bg, neutral: colors.surfaceSubtle },
  ink: { primary: colors.text, secondary: colors.sub, muted: colors.muted, annotation: colors.annotation, wordmark: colors.wordmark },
  line: { subtle: colors.border, control: colors.controlBorder },
  action: { primary: colors.action, pressed: colors.actionPressed, label: colors.onAction, focus: colors.focus },
  paper: { todayNote: colors.paperToday, peach: colors.paperPeach, lilac: colors.paperLilac, blue: colors.paperBlue },
  inkling: { body: colors.inklingBody, features: colors.inklingFeatures },
} as const;

export const decorationOpacity = { todayTape: 0.51, peachTape: 0.82, lilacTape: 0.90 } as const;
export type ColorToken = keyof typeof colors;
