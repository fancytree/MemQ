# WCAG 2.2 A/AA visual optimization

> Historical record of the earlier orange-led pass. The current visual authority and token values are documented in [design-system/README.md](design-system/README.md). Rerun `npm run check:ui` for current results; contrast examples below describe that earlier snapshot.

Goal: improve all production screens visually, consolidate tokens, and remove inline colors.
Baseline: 2026-10-21. Existing working-tree changes are preserved.

## Plan

- [x] Inventory Expo/React Native routes, shared components and both token APIs; baseline typecheck passes.
- [x] Audit source and calculate contrast using WCAG relative luminance.
- [x] Repair visual issues and consolidate semantic colors, control boundaries and readable labels.
- [x] Migrate all production TS/TSX colors; generate CSS tokens from the same source.
- [x] Verify contrast pairs, prevent inline color regressions, typecheck and build; document manual checks.

## Accepted visual direction

User correction: primary buttons use charcoal / near-black with white labels. The product primary color stays the original orange (#F58A35); use it for brand, illustrations, decorative progress and accents. Dedicated action/actionPressed/onAction tokens separate actions from brand and learning-status colors.

## Initial findings

| Severity | Location | Criterion | Finding / remediation |
| --- | --- | --- | --- |
| Major | Primary buttons, links, tabs, send icon | 1.4.3, 1.4.11 | Original orange on white is 2.45:1. Use charcoal actions with white labels; keep the original brand orange and use a separate readable orange foreground for status labels. |
| Major | Helper text, placeholders, metadata | 1.4.3 | Original muted on white is 3.52:1. Use readable muted foreground across light surfaces. |
| Major | Inputs, switches, answer outlines | 1.4.11 | Decorative pale borders cannot identify controls reliably. Introduce control border and inactive switch track. |
| Major | AI assistant send button | 1.4.3, 1.4.11 | Enabled and disabled buttons share a translucent fill. Give enabled state an opaque accessible action color. |
| Major | Tab bar, quiz choices, study settings | 1.3.1, 4.1.2 | Expose selected/checked states and names alongside visual feedback. |
| Minor | Small action controls and metadata | 2.5.8, 1.4.4 | Expand action areas and remove small fixed text containers where practical. Minimum 12pt labels are a product readability choice, not a WCAG minimum font-size rule. |
| Major | Legacy theme and CSS | Consistency | Duplicate color literals diverge. Alias legacy theme to canonical colors; generate CSS variables. |

## Scope and verification boundaries

Production: app/, components/, context/, lib/, data/, constants/ and theme/ TS/TSX, plus generated CSS and native launch colors. Static HTML concepts in app/memq/ and source SVG/raster artwork are design references/assets, not runtime styling. Embedded React Native SVG colors are tokenized (including brand artwork).

WCAG 2.2 reference: https://www.w3.org/WAI/WCAG22/quickref/
This work targets visual and related semantic criteria; it does not certify whole-product WCAG compliance. Screen readers, keyboard flow, modal focus, 200% text scaling, narrow viewport layouts, third-party native purchase sheets and every authenticated/error state require runtime review.

## Completed verification (2026-10-21)

- `npm run check:ui`: 91 production TypeScript files, 86 foreground/background contracts, zero failures. No inline color literals remain in the scanned production sources. Generated CSS/native colors match the canonical palette.
- `npm run typecheck`: passes.
- `git diff --check`: passes.
- Expo export: iOS, Android and Web bundles generated successfully (bundle validation, not native binary/store validation).
- iOS simulator: visually inspected Today, Library and Explore in the existing authenticated session. Verified charcoal CTAs, original orange illustrations/progress, readable metadata, category selection and tab navigation. Other screens received source-level review; no claim of end-to-end testing for every screen/state.
- 435 inline color values migrated across 47 files; additional changes update shared controls, state semantics, typography, native launch colors and documentation.

| Contract | Result | Required minimum |
| --- | --- | --- |
| White label / charcoal action | 14.46:1 | 4.5:1 |
| Muted text / white | 6.76:1 | 4.5:1 |
| Readable orange / orange tint | 5.24:1 | 4.5:1 |
| Control outline / white | 4.25:1 | 3:1 |
| Dark text / original orange | 6.68:1 | 4.5:1 |

Original orange progress fills remain decorative where adjacent numeric percentages convey the same data. Semantic states also include text, check/cross symbols, weight or shape. Onboarding active dots now differ in shape and have a contrasting boundary. The buddy uses a brief entrance animation, honors reduced motion, and no longer loops indefinitely.

## Manual follow-up checklist

- [ ] VoiceOver and TalkBack: reading order, input labels, radio/tab announcements, hidden faces on cards and modal focus/return.
- [ ] Full keyboard navigation on Web: focus visibility, focus order and no traps/obscured focus, particularly modal portals and native purchase sheets.
- [ ] 200% Dynamic Type and 320px equivalent viewport: no lost content/actions, keyboard avoidance, long translations and text-spacing overrides.
- [ ] Remaining authenticated routes: creation, lesson details/settings, quiz/study feedback, subscription, account forms, empty/loading/error/disabled states.
- [ ] Real Android and iOS device checks, including third-party native flows.

These checks are explicitly pending. Automated token/contrast contracts do not establish full WCAG A/AA conformance.
