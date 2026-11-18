/** What the drawings are painted in, and the record of the supplied source.
 *
 * This is NOT the design system. Nothing on a screen reads from here: the colours
 * below belong to the illustrations — the Inkling, the paper, the tape, the pins
 * and the flowers — and to the measurements taken from the design that was handed
 * over on 2026-10-21. They are kept so that the artwork can be re-drawn and so the
 * source can be checked, not so that a button can be painted in one of them.
 *
 * The system itself is `colors`, further down: structural interface only.
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

/** The design system's colour.
 *
 * One namespace, one name per job. A colour may serve several jobs — the deep
 * purple is both the secondary ink and the shell under a pressed button — and then
 * it has a name for each, because those are different decisions that happen to
 * agree today. What it must not have is synonyms: `muted`, `supporting`,
 * `accentText` and `homeColors.deep` were four names for one ink, which is how a
 * palette grows without anyone deciding anything.
 *
 * Structural interface only. What the drawings are painted in is `referenceColors`
 * above, and no screen reads from it.
 */
const ink = {
  /** Headings, and anything the eye should land on first. */
  text: '#301a50',
  /** Reading copy, labels, most of what is written. The app's workhorse. */
  sub: '#4b2c78',
  /** Small print, and the edge of a control.
   *
   *  Softened from #795ba3, which made a line like "Tap to see question again"
   *  read as something to attend to rather than as a note about how the card
   *  works. This is as far as it goes: on `panel`, the darkest of the three
   *  surfaces small print is set on, it measures 4.63:1, and scripts/check-ui
   *  holds this ink to the 4.5:1 that body copy is owed. Anything lighter is a
   *  different token, not a lighter version of this one. */
  faint: '#7f61a9',
  /** A hint inside an input, before anything is typed. */
  placeholder: '#857098',
  /** Type and controls that are switched off. */
  disabled: '#686863',
  /** Reversed out of a filled action or a dark ground. */
  onAction: '#ffffff',
  /** The wordmark's own near-black, and only there. */
  wordmark: '#151719',
} as const;

const surface = {
  /** The page. */
  bg: '#fcfced',
  /** A card on the page. */
  surf: '#ffffff',
  /** A panel inside a card, and a control that is off. */
  panel: '#f7f5fa',
  /** A ground tinted with the action's colour: charts, progress, the AI sheets. */
  tint: '#ede1fd',
  /** A hairline, the lip under a raised surface, an empty step in a chart. */
  line: '#e5dfeb',
  /** Over the page, under a sheet. */
  scrim: 'rgba(36, 36, 36, 0.31)',
  /** White laid over the lime, for a chip that sits on the gradient. */
  veil: 'rgba(255,255,255,0.6)',
} as const;

const lime = {
  /** Whole fields of it on the welcome screens. */
  lime: '#eefc41',
  /** The shell a lime button sits on, and what pressing it reveals. Depth here is
   *  the same colour with the light taken out of it, never a second hue: a purple
   *  lip under a lime face reads as two things stacked, not as one raised one. */
  limeShell: '#bccb20',
  /** The two stops at the head of a page, brightest first. */
  limeBright: '#f6ff7c',
  limePale: '#f3ffa6',
  /** A chip, a cover, and the gradient's last stop before the canvas. */
  limeSurface: '#f4fab1',
} as const;

const state = {
  green: '#176B46', greenL: '#EAF7EF',
  red: '#B52F2F', redL: '#FFF0ED',
  /** The shell a destructive button sits on, and what pressing it reveals. Read
   *  the same way as `limeShell` and `actionShell`: the same hue with the light
   *  taken out of it, sixteen points of lightness down, never a second colour. */
  redShell: '#741E1E',
  warn: '#875807', warnL: '#FFF5E4',
  info: '#304FA8', infoL: '#EEF2FF',
  /** The ground a flashcard is swiped onto. */
  swipeGreen: '#c5efd5', swipeRed: '#f8cdc8',
  /** The outline on a choice that was wrong. */
  wrong: '#ff6900',
  google: '#4285F4',
  notification: '#FF231F7C',
} as const;

export const colors = {
  ...ink,
  ...surface,
  ...lime,
  ...state,

  /** The one thing a screen wants pressed, and progress along it. */
  action: '#6c3cbc',
  /** The shell a filled action sits on, and what pressing reveals. The secondary
   *  ink's value: the same purple, a different decision. */
  actionShell: ink.sub,

  /** The chart ramp's middle steps. Its ends are the action and the line. */
  chartBar: '#9d66ed',
  chartSoft: '#c59af0',

  transparent: 'transparent',
  /** The language is flat: depth is a painted lip, never a shadow. */
  shadow: 'transparent',
} as const;

/** The You page's charts: one purple ramp, light to deep, so every chart reads the
 * same way — the deeper the colour, the further along or the more of it. */
export const chartColors = {
  /** A cell with nothing in it is a ruled line, not a fifth tint of purple. */
  empty: colors.line,
  faint: '#dcc8f7',
  /** The stages a card moves through, in order. */
  stages: [colors.line, '#dcc8f7', colors.chartSoft, colors.chartBar, colors.action, colors.actionShell],
  /** How much was studied on a day, from a little to the most. */
  heat: [colors.line, '#dcc8f7', colors.chartSoft, colors.chartBar, colors.action],
} as const;

export const decorationOpacity = { todayTape: 0.51, peachTape: 0.82, lilacTape: 0.90 } as const;
export type ColorToken = keyof typeof colors;


/**
 * Preset lesson cover gradients.
 *
 * Each is one hue, pale to mid, in the app's own register: a cover is a tile
 * behind a symbol, not a picture, so the darker stop stays light enough to keep
 * `colors.sub` legible on it.
 *
 * The first six are also the pool a lesson is given one from when nobody has
 * chosen (see lib/lessonCover.ts). The rest were added later and are offered in
 * the picker only — a new colour must not quietly repaint shelves of lessons
 * that were never touched.
 */
export const lessonCoverPalettes = [
  { id: 'lime', label: 'Lime', colors: ['#F4FFB5', '#D4EB79'] },
  { id: 'lavender', label: 'Lavender', colors: ['#EDE0FF', '#C9B0F1'] },
  { id: 'peach', label: 'Peach', colors: ['#FFE4C7', '#F4B69E'] },
  { id: 'sky', label: 'Sky', colors: ['#DDF4FB', '#A7D8E9'] },
  { id: 'mint', label: 'Mint', colors: ['#DDF7E4', '#A8DFC0'] },
  { id: 'rose', label: 'Rose', colors: ['#FFE2EA', '#EFAFC5'] },
  { id: 'butter', label: 'Butter', colors: ['#FFF6CC', '#F2DD86'] },
  { id: 'blue', label: 'Blue', colors: ['#E0E8FF', '#AFC0F0'] },
  { id: 'teal', label: 'Teal', colors: ['#D6F3EE', '#96D6CA'] },
  { id: 'plum', label: 'Plum', colors: ['#F7DBEF', '#D9A3CB'] },
  { id: 'clay', label: 'Clay', colors: ['#FBE4D6', '#DCAB8E'] },
  { id: 'stone', label: 'Stone', colors: ['#EEEBF3', '#C2BCD1'] },
] as const;
