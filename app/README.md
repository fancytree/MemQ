# MemQ design system

The current system is **white / ink, color in the details**, based on the user-supplied Today, hand-drawn decoration and Inkling inspection dated 2026-10-21. This supersedes the older orange-led editorial rules.

- [Implementation guide, provenance and migration boundaries](../docs/design-system/README.md)
- [Supplied source design language](../docs/design-system/source-design-language.md)
- [Reviewable design-system specimen](../docs/design-system/index.html)
- [Canonical tokens](../theme/index.ts) and [machine-readable reference/runtime definitions](../theme/tokens.json)

Manrope carries application UI, Inter compact utility/numbers and Caveat short supportive annotations. Structural controls, actions, progress and selection are neutral. Color belongs in authored paper/illustration details. A pale note is not the universal container; course rows sit directly on white. Use approved artwork, not invented mascot replacements.

New reusable components: `PrimaryButton`, `CourseRow`, `DailyGoal`, `BottomNavigation` under `components/ui/`. The approved navigation taxonomy is Today / Create / Library; legacy application route migration is explicitly tracked in the implementation guide.

Run `npm run tokens:sync`, `npm run design-system:build`, `npm run check:ui` and `npm run typecheck` after system changes. Measured source values and accessibility adaptations are kept separate. No Figma variables/components were published by this repository update.
