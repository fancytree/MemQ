/** Observed values are role-specific, not proof of a universal 4px/8px system. */
export const layout = {
  screenInline: 16, // Product-wide page inset; tightened from the 24px Figma reference.
  heroInline: 18, // Today redesign 96:747 / 96:761: greeting and hero card inset.
  listInline: 24, // Today redesign 96:648 / 96:659: progress and course list inset.
  heroTop: 46, // Today redesign 96:761: space between the greeting and the hero card.
  navLabel: 4,
  courseText: 6,
  profile: 10,
  courseInline: 14,
  heroStack: 18,
  goalInline: 20,
  sectionBottom: 22,
  heroBottom: 26,
  goalBottom: 28,
} as const;

/** Compatibility utility scale; an implementation convenience, not a measured grid. */
export const space = { '0': 0, '1': 4, '2': 8, '3': 12, '4': 16, '5': 20, '6': 24, '8': 32, '10': 40, '14': 56, '16': 64 } as const;
/** Retained extension radii for unmeasured form/sheet controls. Only pill is reference-backed. */
export const radius = { none: 0, sm: 4, md: 6, lg: 8, xl: 10, '2xl': 12, pill: 100 } as const;
export const hairline = 1;
