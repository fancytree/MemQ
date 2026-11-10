import { colors } from '@/theme/colors';
import { layout, radius, space } from '@/theme/spacing';

export const MemQTheme = {
  // Compatibility API: values always come from the canonical theme.
  color: {
    bg: colors.bg,
    surface: colors.surf,
    inner: colors.accentL,
    border: colors.border,
    controlBorder: colors.controlBorder,
    accent: colors.accent,
    action: colors.action,
    actionPressed: colors.actionPressed,
    onAction: colors.onAction,
    accentDark: colors.accentDark,
    accentText: colors.accentText,
    accentLight: colors.accentL,
    textHigh: colors.text,
    text: colors.sub,
    muted: colors.muted,
    danger: colors.red,
    dangerBg: colors.redL,
    dangerBorder: colors.red,
  },
  radius: {
    sm: radius.md, md: radius.lg, lg: radius.xl,
    xl: 14, xxl: 18, pill: radius.pill, // Sheet radii remain legacy implementation extensions.
  },
  space: {
    xs: space[2], sm: layout.profile, md: space[3], lg: space[4],
    xl: layout.goalInline, xxl: layout.screenInline, pageX: layout.screenInline,
  },
} as const;
