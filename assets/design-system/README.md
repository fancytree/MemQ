# Original Figma SVG exports

Source: MemQ / Untitled, file `YkyRSgXn9qY2lHKd1plTss`, exported 2026-10-21 via Figma design context. SVG contents are unmodified. No temporary Figma asset URLs are used at runtime.

Runtime replacements preserve the existing slot geometry. `DesignAsset` renders each SVG at its own root dimensions; `FittedDesignAsset` scales a wrapper proportionally to fit an existing slot. The four expression files use 160 × 148 roots. `MemqBuddy` retains `size × (size * 1.12)` at every existing callsite. The wordmark retains its previous width and `height || width / 3.8` slot.

| Export | Source node | Root dimensions | Current use |
| --- | --- | --- | --- |
| inkling-curious.svg | 33:1425 (pose 33:1424) | 160 × 148 | Existing curious mascot slots |
| inkling-thinking.svg | 33:1413 (pose 33:1412) | 160 × 148 | Existing thinking mascot slots |
| inkling-happy.svg | 33:1447 (pose 33:1446) | 160 × 148 | Existing happy mascot slots |
| inkling-sleepy.svg | 33:1526 (pose 33:1525) | 160 × 148 | Existing sleepy mascot slots |
| wordmark-rays.svg | 33:1160 | 18 × 26 | Existing logo slots, with Manrope wordmark |
| arrow-right.svg | 33:1186 | 18 × 18 | PrimaryButton default icon |
| nav-today.svg | 33:1248 | 21 × 21 | Existing Today icon, active |
| nav-today-inactive.svg | 39:14260 | 21 × 21 | Existing Today icon, inactive |
| nav-library-active.svg | 39:14266 | 21 × 21 | Existing Library icon, active |
| nav-library.svg | 33:1258 | 21 × 21 | Existing Library icon, inactive |

The user subsequently requested the Today homepage layout from node 33:1146. It now uses notebook-paper.svg (212 × 100, 33:1170), streak-flame.svg (25 × 29, 33:1197) and chevron-right.svg (17 × 17, 33:1215) at their natural roots. The Curious illustration is mirrored horizontally inside the source 160 × 158 slot. Homepage wordmark rays retain their natural 18 × 26 dimensions. Course cover exports remain unused and no blank image slot is rendered. Shared four-tab routes are retained.


Library 57:2036 uses library-chevron.svg, the original 17 × 17 disclosure export from node 57:2066 (also used at 57:2086 and 57:2108). It is separate from the Today disclosure export. Course covers remain intentionally unused.


Lesson detail 59:2455 uses the original review-arrow.svg (20.0521 × 19.7, node 59:2494), term-plus.svg (18 × 18, 59:2500), term-search.svg (18 × 18, 59:2504), term-chevron-down.svg (16 × 16, 59:2511) and term-volume.svg (18 × 18, 59:2521). The review arrow keeps its overflowing natural dimensions, centered in the source 18 × 18 slot. Native status/home indicators use the operating system. Course cover artwork remains deferred.


Lesson editor exports: edit-radio-selected.svg (22 × 22, 66:2845), edit-calendar.svg (18 × 18, 66:3282), edit-chevron-down.svg (18 × 18, 66:3285), edit-trash.svg (18 × 18, 66:3288), edit-close.svg (18 × 18, 66:3309), edit-chevron-left.svg (18 × 18, 66:3312), edit-chevron-right.svg (18 × 18, 66:3315). Original SVG roots and contents are retained.
