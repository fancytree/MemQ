// Type system — three families. The platform must register these fonts
// (e.g. via expo-font) for the family names to resolve. Until then the
// system default is used.

export const fonts = {
  // 全局统一使用 JetBrains Mono
  grotesk: 'JetBrainsMono_400',
  // 保留 key，避免业务代码改动；实际仍使用 JetBrains Mono
  serif: 'JetBrainsMono_400',
  // Numeric / labels
  mono: 'JetBrainsMono_400',
} as const;

export type FontFamily = keyof typeof fonts;

// Centralized type ramps — RN does not support all CSS properties
// (no letter-spacing in pixels on Android prior to 0.70 — uses points;
//  no font-variant-numeric — handled per-platform via fontVariant array).
export const type = {
  display: { fontSize: 52, fontWeight: '900', letterSpacing: -2 },
  h1:      { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  h2:      { fontSize: 19, fontWeight: '800', letterSpacing: -0.5 },
  h3:      { fontSize: 17, fontWeight: '700', letterSpacing: -0.4 },
  body:    { fontSize: 14, fontWeight: '400' },
  bodyMd:  { fontSize: 13, fontWeight: '500' },
  small:   { fontSize: 12, fontWeight: '400' },
  micro:   { fontSize: 11, fontWeight: '500' },
  // Section labels — uppercase tracked
  label:   { fontSize: 10, fontWeight: '500', letterSpacing: 0.45, textTransform: 'uppercase' as const },
} as const;
