import { colors } from './colors';
import { layout, radius, space } from './spacing';
import { type } from './typography';

/** Reference-backed defaults plus explicitly labelled runtime adaptations. */
export const componentTokens = {
  lessonEditor: { fieldRadius: 14, fieldPadding: 14, fieldMinHeight: 52, descriptionMinHeight: 92, groupGap: 24, optionPadding: 12, radioSize: 22, sheetRadius: 24, calendarDayHeight: 44, dialogPadding: 24 },
  lessonDetail: { gap: 16, sectionGap: 24, controlRadius: 14, searchHeight: 46, termPadding: 16, overviewRadius: 20, overviewPadding: 16 },
  createNavigation: { width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.action },
  // Library 57:2036: 238px reference card minus the deferred 52px cover and its 5px gap.
  libraryCard: { minHeight: 181, borderRadius: 14, padding: 12, gap: 5, gridGap: 12, progressHeight: 4 },
  primaryAction: {
    minHeight: 52, borderRadius: radius.pill,
    paddingHorizontal: space[6], paddingVertical: 15,
    backgroundColor: colors.action, color: colors.onAction,
    label: type.button,
  },
  // Today redesign 96:762: neutral hero card; the Inkling overflows its top-right corner.
  todayHero: { minHeight: 223, borderRadius: 24, padding: 18, textGap: 7, backgroundColor: colors.surfaceSubtle, inklingWidth: 192, inklingTop: -57, inklingRight: -20 },
  heroAction: { minHeight: 44, borderRadius: radius.pill, paddingHorizontal: space[6], paddingVertical: 12, gap: space[2], backgroundColor: colors.action, label: type.heroAction },
  profile: { size: 44, borderRadius: radius.pill, backgroundColor: colors.surfaceSubtle, label: type.initial },
  course: { minHeight: 72, illustrationSize: 52, gap: layout.courseInline, textGap: layout.courseText, disclosureWidth: 32, disclosureMinHeight: 44, title: type.courseTitle, meta: type.meta },
  progress: { height: 5, borderRadius: radius.pill, backgroundColor: colors.progressTrack, fill: colors.action },
  navigation: { minItemHeight: 48, capsuleWidth: 52, capsuleMinHeight: 28, iconSize: 21, iconStroke: 1.7, gap: layout.navLabel, backgroundColor: colors.surfaceSubtle, activeLabel: type.navActive, inactiveLabel: type.navInactive },
  icon: { actionSize: 18, actionStroke: 1.8, disclosureSize: 17, disclosureStroke: 1.5 },
} as const;

/** Interaction/accessibility extensions, not approved Figma states. */
export const interaction = {
  minTarget: 44, focusWidth: 3, focusOffset: 3,
  pressed: colors.actionPressed,
  disabled: { backgroundColor: colors.disabledBg, color: colors.disabledText },
} as const;
export const elevation = { none: { shadowOpacity: 0, elevation: 0 } } as const;
export const sourceReference = {
  fileKey: 'YkyRSgXn9qY2lHKd1plTss', page: '33:1145',
  lessonEditor: '66:2808', deadlineSheet: '66:2995', deleteLessonDialog: '66:3168',
  library: '57:2036', lessonDetail: '59:2455',
  today: '33:1146', todayRedesign: '96:606', decorations: '33:1262', inkling: '33:1394',
  inspectionDate: '2026-10-21',
  tokenStatus: 'Implementation aliases; no local Figma styles or variable bindings in primary references',
} as const;
