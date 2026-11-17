import { colors } from './colors';
import { ledge } from './ledge';
import { layout, radius, space } from './spacing';
import { type } from './typography';

/** Reference-backed defaults plus explicitly labelled runtime adaptations. */
/** What a component is built from, where the shape is the component's own and not
 * a step in a scale. Everything that is a step — a size, a gap, a corner — comes
 * from theme/typography.ts and theme/spacing.ts instead, so there is one place to
 * change it. This held eleven blocks; ten described components that no longer
 * exist, or described them in numbers the scales now carry.
 */
export const componentTokens = {
  /** Every lipped button in the app. Three sizes, two weights, one radius.
   *
   * The sizes are what a button is for, not how big the designer felt that day:
   * `xl` is a screen whose whole job is one decision — signing in, starting out,
   * subscribing; `lg` is the one thing a working screen wants pressed; `md` is an
   * action within a section; `sm` is a control beside something else. Each carries
   * its own label role, so a button cannot end up 56 points tall with 14-point
   * type in it, which is what the profile screens had. The lip follows the same
   * reading as theme/ledge.ts: a filled action presses from the lead depth, and
   * everything quieter sits on the shallow control lip.
   *
   * Before these existed the same button was drawn at eight heights and ten radii
   * across twenty-four files.
   */
  button: {
    radius: radius.pill,
    // `height` is the face — what you see when the button is pressed flat. At rest
    // the lip sits under it, so a button stands `height + lip` tall. The face is
    // what the eye measures against the text beside it, which is why the scale is
    // set here and not on the shell: at 52 the lead button stood 57 and read as a
    // slab, and its pressed height was the one that looked right.
    xl: { height: 56, paddingHorizontal: space[6], gap: space[3], label: type.heading },
    lg: { height: 48, paddingHorizontal: space[6], gap: space[2], label: type.body },
    md: { height: 44, paddingHorizontal: space[5], gap: space[2], label: type.body },
    sm: { height: 40, paddingHorizontal: space[4], gap: space[1], label: type.small },
    lip: { lead: ledge.lead, control: ledge.control },
    primary: { shell: colors.sub, face: colors.action, label: colors.onAction },
    // A white face on a pale shell has no edge of its own on a white card, so the
    // face carries a hairline. On the canvas it is barely there; on a card it is
    // the whole button.
    secondary: { shell: colors.line, face: colors.surf, label: colors.sub, border: colors.line },
    /** The one that destroys something. Filled, like the primary, because it is
     *  the answer to the question a dialog is asking — not a quieter thing beside
     *  it. Two dialogs drew their own before this, flat and at the card's corner,
     *  so the button that deletes a lesson was the only button in the app with no
     *  lip under it. */
    danger: { shell: colors.redShell, face: colors.red, label: colors.onAction },
    /** No surface at all: a word that does something, where a filled button beside
     *  the real action would argue with it. `ghost` leads to somewhere, `quiet`
     *  steps out of the way — skipping, dismissing, "not now". */
    ghost: { shell: colors.transparent, face: colors.transparent, label: colors.action },
    quiet: { shell: colors.transparent, face: colors.transparent, label: colors.faint },
    disabledOpacity: 0.45,
    /** What a surfaceless button does instead of pressing flat. */
    pressedOpacity: 0.55,
  },

  /** A chip: a small thing you choose, rather than an action you take.
   *
   * It keeps its own corner — softer than a button's pill — so that a row of
   * choices does not read as a row of commands, and it carries the shallow lip
   * every small control in the app has. Chosen, it fills with the action colour,
   * which is the only place in a chip where that colour appears: a chip that is not
   * chosen is furniture.
   */
  chip: {
    radius: radius.md,
    lip: ledge.control,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
    gap: space[2],
    label: type.small,
    /** Not chosen: the page's own colours, with a hairline so that the chip has an
     *  edge on any surface. Without it, a chip on the canvas shows only its lip. */
    off: { shell: colors.line, face: colors.bg, label: colors.sub, border: colors.line },
    on: { shell: colors.actionShell, face: colors.action, label: colors.onAction },
  },

  /** Somewhere to type.
   *
   * A well with a hairline, filled a shade off the card it sits on so the place
   * to type is visible before anything is in it. Eight screens drew their own
   * before this, at four heights and three corners, and half of them left the
   * hint in a grey nobody could read.
   */
  field: {
    minHeight: 52,
    radius: radius.md,
    fill: colors.panel,
    border: colors.line,
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    /** A field that takes a paragraph rather than a line. */
    multilineMinHeight: 96,
    /** Between the label and the well, and between the well and what follows. */
    gap: space[2],
    label: type.small,
    text: type.body,
  },

  /** Looking through a list. It sits on the page rather than inside a card, so it
   *  is white with the page showing through its hairline — the same field the
   *  library and a lesson's cards are searched with. */
  search: {
    minHeight: 52,
    radius: radius.lg,
    fill: colors.surf,
    border: colors.line,
    paddingHorizontal: space[4],
    gap: space[2],
  },

  /** A button that is only a glyph. Three sizes, one corner, one depth — it is a
   *  small control whatever it does, so it presses from the shallow lip. The app
   *  had five different round buttons before this: a white disc on a lip, a square
   *  filled with canvas, a circle in nav grey, and twice a bare glyph with no edge
   *  to aim at. */
  iconButton: {
    /** The diameter, lip included. A round button's lip lives inside its circle,
     *  not under it: added on, it made the button taller than it is wide and the
     *  disc read as an egg. The face is this minus the lip, and the band of shell
     *  showing along the bottom completes the circle. */
    size: { xl: 76, lg: 48, md: 44, sm: 36 },
    radius: radius.pill,
    /** Deep enough to see at the button's own scale. Two points under a 76-point
     *  disc is a hairline; the big one is also the one a screen wants pressed, so
     *  it takes the lead depth and the small ones stay at the control depth. */
    lip: { xl: ledge.lead, lg: ledge.control, md: ledge.control, sm: ledge.control },
  },

  /** A raised surface: the white a screen's content sits on.
   *
   * It is the same two layers as a button — a shell in the line colour with a
   * lighter face on it, a band of the shell showing along the bottom — because it
   * is the same idea, held rather than pressed. Three ways of saying that had
   * grown up side by side: a real pair of layers, an `elevation.card` that faked
   * the band with a 4-point box shadow, and twenty-two box shadows written out by
   * hand. Two of them were shadows, which this palette does not have, and all
   * three disagreed about the depth.
   *
   * `lg` is the card a screen is made of. `xl` is for the tall ones a character
   * perches on, where the corner has to carry a much larger surface.
   */
  card: {
    radius: { lg: radius.lg, xl: radius.xl },
    /** Held, not pressed, so it sits at the middle depth. A card that opens
     *  something presses from the same lip rather than a deeper one: it is still
     *  a card, and it has already said how high it stands. */
    lip: ledge.raised,
    shell: colors.line,
    face: colors.surf,
    /** A card that is the chosen one of several — a plan, a mode. Both layers take
     *  the action's colour so the whole surface is picked out, not just an edge. */
    selected: { shell: colors.actionShell, face: colors.tint },
    /** Inside the face. `md` is the card the app is mostly made of; `lg` is one
     *  whose content is the whole screen's subject; `sm` is a card inside a card. */
    pad: { sm: space[3], md: space[4], lg: space[5] },
    gap: space[3],
  },
} as const;

/** Interaction/accessibility extensions, not approved Figma states. */
export const interaction = {
  minTarget: 44, focusWidth: 3, focusOffset: 3,
  pressed: colors.actionShell,
  disabled: { backgroundColor: colors.panel, color: colors.disabled },
} as const;
export const sourceReference = {
  fileKey: 'YkyRSgXn9qY2lHKd1plTss', page: '33:1145',
  homeDesignFileKey: 'mH3dfsUnPuRiCAUBTWE6cX', homeDesignNode: '1:176',
  lessonEditor: '66:2808', deadlineSheet: '66:2995', deleteLessonDialog: '66:3168',
  library: '57:2036', lessonDetail: '59:2455',
  today: '33:1146', todayRedesign: '96:606', decorations: '33:1262', inkling: '33:1394',
  inspectionDate: '2026-10-21',
  tokenStatus: 'Implementation aliases; no local Figma styles or variable bindings in primary references',
} as const;
