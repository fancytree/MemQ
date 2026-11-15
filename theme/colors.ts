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

/** Colors from the Today home design. */
export const homeColors = {
  gradientStart: '#f3ffa6', gradientBright: '#f6ff7c', gradientSoft: '#f5f7c0', canvas: '#fcfced',
  deep: '#4b2c78', white: '#ffffff', black: '#000000', placeholder: '#d9d9d9',
  focus: 'rgba(255,255,255,0.6)', primary: '#6c3cbc', border: '#e5dfeb',
  muted: '#795ba3', chartBackground: '#ede1fd', chartBar: '#9d66ed',
  // The hills' own yellow, opaque. It was only ever here at 36% as goalBackground;
  // the welcome screens stand whole fields of it and need the solid colour.
  hill: '#eefc41',
  goalBackground: 'rgba(238,252,71,0.36)', darkest: '#301a50', track: '#f0e4fc',
  nav: '#f7f5fa', selected: '#f4fab1', streakBorder: '#c59af0',
  swipeGreen: '#c5efd5', swipeGreenLight: '#eaf7ef',
  swipeRed: '#f8cdc8', swipeRedLight: '#fff0ed', quizWrongOutline: '#ff6900',
} as const;

/** The You page's charts. One purple ramp, light to deep, so every chart reads the
 * same way: the deeper the colour, the further along or the more of it. */
export const chartColors = {
  /** A cell or a bar with nothing in it, on a white card. */
  empty: '#efeaf5',
  faint: '#dcc8f7',
  /** The stages a card moves through, in order. */
  stages: ['#efeaf5', '#dcc8f7', homeColors.streakBorder, homeColors.chartBar, homeColors.primary, homeColors.deep],
  /** How much was studied on a day, from a little to the most. */
  heat: ['#efeaf5', '#dcc8f7', homeColors.streakBorder, homeColors.chartBar, homeColors.primary],
} as const;

/** Stable runtime API. Old accent/gradient names are compatibility aliases, neutralized.
 * New components should use semanticColor or the explicit action/text/surface tokens.
 */
export const colors = {
  bg: homeColors.canvas,
  surf: homeColors.white,
  surfaceSubtle: homeColors.nav,
  border: homeColors.border,
  borderS: homeColors.border,
  controlBorder: homeColors.muted,
  focus: homeColors.deep,

  brand: extension.buddyBody, // Deprecated: only for the legacy buddy, never structural UI.
  accent: homeColors.primary,
  accentText: homeColors.deep,
  accentDark: homeColors.darkest,
  accentL: homeColors.chartBackground,
  accentRing: homeColors.track,
  accentShadow: 'transparent',
  accentShadowLg: 'transparent',
  onAccent: referenceColors.canvas,
  action: homeColors.primary,
  actionPressed: homeColors.deep,
  onAction: referenceColors.canvas,
  actionShadow: 'transparent',
  onDark: referenceColors.canvas,

  text: homeColors.darkest,
  sub: homeColors.deep,
  supporting: homeColors.deep,
  selectionNeutral: referenceColors.selectionNeutral,
  sheetHandle: referenceColors.sheetHandle,
  modalScrim: referenceColors.modalScrim,
  paperIvory: referenceColors.ruledPage,
  muted: homeColors.deep,
  dim: referenceColors.lineSubtle,
  disabledBg: extension.disabledBg,
  disabledText: extension.textMuted,
  switchTrack: extension.controlBorder,

  green: extension.green, greenL: extension.greenL,
  red: extension.red, redL: extension.redL,
  warn: extension.warn, warnL: extension.warnL,
  info: extension.info, infoL: extension.infoL,
  ai: homeColors.primary,
  aiL: homeColors.chartBackground,
  aiGradientEnd: homeColors.deep,

  heroBg: homeColors.chartBackground, // A hero is not automatically a paper note.
  heroBorder: homeColors.border,
  progressTrack: homeColors.track,
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


/** Preset lesson cover gradients. */
export const lessonCoverPalettes = [
  { id: 'lime', label: 'Lime', colors: ['#F4FFB5', '#D4EB79'] },
  { id: 'lavender', label: 'Lavender', colors: ['#EDE0FF', '#C9B0F1'] },
  { id: 'peach', label: 'Peach', colors: ['#FFE4C7', '#F4B69E'] },
  { id: 'sky', label: 'Sky', colors: ['#DDF4FB', '#A7D8E9'] },
  { id: 'mint', label: 'Mint', colors: ['#DDF7E4', '#A8DFC0'] },
  { id: 'rose', label: 'Rose', colors: ['#FFE2EA', '#EFAFC5'] },
] as const;
