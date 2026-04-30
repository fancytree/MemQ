import { MemQTheme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const ThemeColors = {
  light: {
    text: MemQTheme.color.textHigh,
    background: MemQTheme.color.bg,
    tint: MemQTheme.color.accent,
    icon: MemQTheme.color.muted,
    tabIconDefault: MemQTheme.color.muted,
    tabIconSelected: MemQTheme.color.accent,
  },
  dark: {
    text: MemQTheme.color.textHigh,
    background: MemQTheme.color.bg,
    tint: MemQTheme.color.accent,
    icon: MemQTheme.color.muted,
    tabIconDefault: MemQTheme.color.muted,
    tabIconSelected: MemQTheme.color.accent,
  },
} as const;

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof ThemeColors.light & keyof typeof ThemeColors.dark
) {
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return ThemeColors[theme][colorName];
  }
}
