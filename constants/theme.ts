/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const MemQTheme = {
  color: {
    bg: '#FAFAF8',
    surface: '#FFFFFF',
    inner: '#F4F2F8',
    border: '#E5E3DE',
    accent: '#1A8A72',
    accentDark: '#146B59',
    accentLight: '#E6F5F2',
    textHigh: '#1A1916',
    text: '#37352F',
    muted: '#9B9790',
    dim: '#D8D5CF',
    success: '#0F7E4A',
    successBg: '#EDFBF3',
    successBorder: '#6EE7B7',
    danger: '#E03E3E',
    dangerBg: '#FEF2F2',
    dangerBorder: '#FCA5A5',
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 14,
    xxl: 18,
    pill: 999,
  },
  space: {
    xs: 8,
    sm: 10,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    pageX: 20,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
