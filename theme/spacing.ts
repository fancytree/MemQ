// 4px base scale — used for paddings/gaps via the s() helper.
export const space = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '14': 56,
  '16': 64,
} as const;

export const radius = {
  none: 0,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 10,
  '2xl': 12,
  pill: 999,
} as const;

export const hairline = 1; // 1px border (RN renders sub-px on retina anyway)
