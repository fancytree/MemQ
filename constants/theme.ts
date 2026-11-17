import { colors } from '@/theme/colors';
import { layout, radius, space } from '@/theme/spacing';

export const MemQTheme = {
  // Compatibility API: values always come from the canonical theme.
  color: {
    bg: colors.bg,
    surface: colors.surf,
    inner: colors.tint,
    border: colors.line,
    controlBorder: colors.faint,
    accent: colors.action,
    action: colors.action,
    actionPressed: colors.actionShell,
    onAction: colors.onAction,
    accentText: colors.sub,
    accentLight: colors.tint,
    textHigh: colors.text,
    text: colors.sub,
    muted: colors.sub,
    danger: colors.red,
    dangerBg: colors.redL,
    dangerBorder: colors.red,
  },
  radius: {
    sm: radius.md, md: radius.lg, lg: radius.xl,
    xl: 14, xxl: 18, pill: radius.pill, // Sheet radii remain legacy implementation extensions.
  },
  space: {
    xs: space[2], sm: space[3], md: space[3], lg: space[4],
    xl: space[5], xxl: layout.screenInline, pageX: layout.screenInline,
  },
} as const;
