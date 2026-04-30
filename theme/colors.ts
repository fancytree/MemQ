// Editorial palette — Notion / Linear-inspired.
// Warm off-white background, single teal accent, hairline borders.

export const colors = {
  bg: '#FAFAF8',
  surf: '#FFFFFF',
  border: '#E5E3DE',
  borderS: '#EFEDE8',

  accent: '#1A8A72',
  accentL: '#E6F5F2',
  accentRing: 'rgba(26, 138, 114, 0.12)',
  accentShadow: 'rgba(26, 138, 114, 0.25)',
  accentShadowLg: 'rgba(26, 138, 114, 0.35)',

  text: '#1A1916',
  sub: '#37352F',
  muted: '#9B9790',
  dim: '#D8D5CF',

  green: '#0F7E4A',
  greenL: '#EDFBF3',
  red: '#E03E3E',
  redL: '#FEF2F2',
  warn: '#B89A2E',
  warnL: '#FAF4DD',
} as const;

export type ColorToken = keyof typeof colors;
