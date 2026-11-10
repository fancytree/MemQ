# MemQ design system · v2

Updated 2026-10-21 from the user-supplied [source design language](source-design-language.md). This specification supersedes the orange-led editorial system. The visual foundation is **white / ink; color lives in the details**. It does not promote Inkling lilac, paper peach or illustration colors into a product action color.

## Authority and evidence

Primary references: [Today · 33:1146](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1146), [16 decorations · 33:1262](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1262), [12 Inkling poses · 33:1394](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1394), Page 2. Measurements are transcribed from the supplied inspection, not a new Figma audit in this update. Today governs structural UI; the two collections govern their artwork. Historical explorations and presentation-board labels are not production requirements.

The three primary references had no bound local variables/styles or component instances in the supplied inspection. All code token names are **implementation aliases**, not pre-existing Figma variables. This update changes repository files, not the Figma library.

| Status | Meaning | Storage |
| --- | --- | --- |
| Reference / measured | Values recorded in the supplied inspection | `referenceColors`, `referenceTypography`, source document |
| Runtime adaptation | Explicit implementation changes for contrast, scaling or platform behavior | `colors`, `type`, component tokens; differences below |
| Extension | A working default absent from the approved references | Body/learning type, feedback colors, form and interaction states |
| Unspecified / pending | Requires additional source verification or a later product decision | Page-level migration, authored asset export, missing states |

## Color

`theme/colors.ts` is the canonical source. `semanticColor` is the preferred nested API. Existing flat `colors` and `MemQTheme.color` remain compatibility APIs.

| Role | Source measurement | Runtime | Reason/status |
| --- | --- | --- | --- |
| Canvas | `#FFFFFF` | Same | Reference |
| Primary ink / action / progress | `#242424` | Same | Reference; neutral selection |
| Wordmark | `#151719` | Same | Wordmark, not a separate semantic role |
| Muted ink | `#858580` | `#686863` | Source gray is about 3.7:1 on white; use the adapted value for small text/icons |
| Secondary ink | Unspecified | `#52524F` | Readable implementation extension |
| Neutral surface | `#F7F7F4` | Same | Profile and navigation capsule |
| Subtle line | `#EEEEEB` | Same | Decorative track/separator; never the sole boundary identifying an input |
| Control boundary | Unspecified | `#7A7A74` | Contrast adaptation for unmeasured form controls |
| Annotation | `#76705A` | Same | Short Caveat aside on note paper; contrast checked |
| Note paper | `#FCF6DB` | Same | A selective paper detail, not every panel |
| Peach / lilac / blue backing | `#FBECE5` / `#F1ECFA` / `#EAF4F9` | Same | Artwork-specific backing, not action or feedback |
| Inkling | `#BAADEE` / `#293133` | Same in registry | Body / features; four poses exported locally |
| Hero Inkling (Today) | `#BAADEE` / `#293133` | `colors.text` / `colors.bg` | Runtime re-tone requested by the user: the Today 96:606 character reads as ink on paper. The exported SVG keeps the authored colors; `MemqBuddy` poses are unchanged |

Success, warning, destructive, error and information palettes **remain implementation extensions** from the accessibility pass. They are not extracted from the cup, heart, leaf or character. Use words/icons alongside feedback color. AI is a neutral structural feature, not a new purple theme.

All measured decoration colors and separate tape opacities are preserved in `referenceColors` / `decorationOpacity`. Preserve asset-specific near-matches; do not collapse them into an invented ramp. Do not use `referenceColors.inkMuted` as production metadata just to reproduce a failing contrast pair.

The `MemqBuddy` compatibility component now renders original exported Inkling SVG poses inside its previous size slots. It does not recolor or redraw the old mascot. Old orange illustration tokens remain deprecated compatibility entries; new code must use approved artwork. `accent`, `accentText`, `accentL` and former gradient aliases now resolve to neutral runtime colors. New code should use explicit surface/ink/action roles.

## Typography

- **Manrope:** primary application UI. Bundled regular, medium, semibold, bold and extra-bold faces.
- **Inter:** compact utility labels, greeting and goal numbers. Bundled regular and semibold.
- **Caveat Regular:** short supportive annotations only. Never questions, answers, validation or critical instructions.
- **JetBrains Mono:** retained extension for actual code samples; not the application or metadata typeface.

`theme/typography.ts` separates exact source measurements from runtime styles. `theme/font-assets.ts` registers packaged files through Expo Font before rendering. Static face names map through `fonts.*`; existing Avenir Next literals have been migrated. Non-Latin glyphs use platform fallback when these fonts do not contain the script; multilingual shaping still requires device review.

| Runtime role | Typeface | Size / line height | Provenance |
| --- | --- | --- | --- |
| Wordmark | Manrope 800 | 25 / 32 | Source; tracking −1.1 recorded |
| Page | Manrope 700 | 30 / 34 | Source 30 / 113%; line-height rounded for runtime |
| Section | Manrope 700 | 19 / 26 | Source size; 26 derives from observed box, explicit runtime choice |
| Note count | Manrope 600 | 19 / 26 | Source size; explicit runtime line-height |
| Course title | Manrope 600 | 15 / 19 | Source 15 / 125%; rounded runtime height |
| Button | Manrope 600 | 16 / 22 | Source size; explicit runtime height for Auto |
| Metadata | Manrope 400 | 12 / 17 | Source size; explicit runtime height |
| Streak | Manrope 600 | 13 / 18 | Source size; explicit runtime height |
| Navigation | Manrope 600 / 400 | 12 / 17 | **Adapted from measured 10px**, not a claim of original size |
| Greeting / initial | Inter 400 / 600 | 14 / 20 | Source size; runtime height |
| Goal number | Inter 600 + 400 | 15 / 21 | Completed count primary/semibold, total muted/regular |
| Annotation | Caveat 400 | 18 / 24 | Source size; runtime height |
| Body / learning | Manrope 400 | 16 / 25; 18 / 29 | **Extensions**, no approved long-form scale in primary sources |

Figma `Auto` is kept literally in reference data. It is not copied into CSS as an invented line-height. Negative `RAW` tracking remains recorded; runtime uses zero for those roles until conversion is calibrated. The wordmark's recorded −1.1 spacing is retained. New section headings use sentence/title case, not an imposed tracked-uppercase rule. Exact face files establish weight; do not combine an unrelated family literal and a conflicting weight.

## Layout and surfaces

Reference viewport: 402 × 844; content 354px with 24px inline margins. These are reference geometry, not fixed viewport requirements. Use `layout.screenInline`, fill-width/hug-height stacks, scrollable content and actual safe-area insets. Contextual gaps include 4, 5, 6, 10, 12, 14, 18, 20, 22, 24, 26 and 28. The compatibility utility scale is not evidence of a strict 4px or 8px grid.

Course rows and daily progress sit directly on white. Group with whitespace, alignment and thin neutral separators. A paper note is an editorial exception. Do not wrap every statistic, row or heading in a rounded card. Primary references contain **no shadows, blur or glossy effects**. New components use `elevation.none`; legacy shadow color aliases are transparent.

The 87px Figma navigation overflows the 844px frame; it is not a production safe-area token. `BottomNavigation` uses real device insets, 48px minimum item height, 10px top padding and at least 8px bottom padding. Content can grow rather than clipping a home indicator.

## Reusable components

| Component | Source-backed default | Explicit extension / limitation |
| --- | --- | --- |
| `ui/PrimaryButton` | Dark pill, min-height 52, 24px inline padding, 16px Manrope 600, white 18px arrow | Pressed, loading and disabled states are runtime extensions; grows with wrapping text; arrow path is a utility implementation, not a copied authored vector |
| `ui/CourseRow` | Open white row, min-height 72, optional 52px artwork slot, 14px gap, 15px title / 12px metadata, 32 × 44 disclosure wrapper | Caller supplies authored artwork; runtime permits wrapping; pressed state is an extension |
| `ui/DailyGoal` | Label/count hierarchy, 5px neutral track and primary-ink fill | Fill derives from data with finite-value/zero-total/clamping safeguards; 6/20 is **30%**, not the measured 24.2% drawing |
| `ui/BottomNavigation` | **Today / Create / Library** in that order; 52 × 28 neutral active capsule, 21px / 1.7px outline icon, no underline or saturated fill | Labels adapted to 12px; host owns route mapping and active state; real safe area; utility icon paths approximate the specified treatment |
| Profile | 44px neutral circle, Inter 14/600 initial | Default visual specification only, no approved menu state |
| Paper note | Pale irregular source silhouette, count + short Caveat aside, tape at recorded opacity | Use authored assets; no generic note-container component has been fabricated |

`ui/Button` remains a compatible touch wrapper for existing callers; it is not a substitute for the new primary-action specification. Forms, search, filters, sheets, dialogs, answer controls and secondary/destructive variants are **not fully source-specified**. Use the neutral/accessibility extensions while their specifications are developed; do not present those states as measured.

The running application's legacy four-destination tab router is intentionally retained in this **design-system update**. Its chrome uses neutral capsules and actual insets. The new system component defines the approved three-destination taxonomy. Moving Explore/account access and routing Create into the tab hierarchy belongs to a separate screen/navigation migration; no existing destination was silently removed.

## Artwork

`theme/artwork.ts` indexes all **16 decorations + 12 Inkling poses**, with source nodes, direct links, intended uses and per-entry availability. Curious, Thinking, Happy and Sleepy now have original local SVG exports; other poses/decorations retain `figma-source-only` status. The preview links to assets and never presents a fabricated mascot or replacement illustration as approved artwork.

Inkling uses a flat lilac pear/drop silhouette with tiny dark face/limbs. No textures, shading, blush, costumes, glossy treatment, extra stickers or transformed-wrapper quirks. Preserve supplied pose orientation. Frames of 160 × 158 include whitespace; 24/40/64 checks are examples, not a mandatory size scale. Keep the character subordinate to learning content. A streak uses the authored **flame**, not a star.

## Generated artifacts and usage

- `theme/tokens.json`: machine-readable reference + runtime definitions, authority and provenance; not a published Figma library.
- `theme/colors.css`, `theme/foundations.css`: generated platform variables.
- `theme/native-colors.json`: white launch canvas used by Expo config.
- `app/colors_and_type.css`: legacy CSS classes backed by the new variables.
- `docs/design-system/index.html` and `app/memq/MemQ Design System.html`: generated reviewable specimen.

```tsx
import { colors, type, layout } from '@/theme';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { DailyGoal } from '@/components/ui/DailyGoal';

<PrimaryButton label="Start learning" onPress={startLearning} />
<DailyGoal completed={6} total={20} />
```

```sh
npm run tokens:sync
npm run design-system:build
npm run check:ui
npm run typecheck
```

Font installation follows the [Expo Font loading workflow](https://docs.expo.dev/versions/latest/sdk/font/), using packaged [Expo Google Fonts](https://github.com/expo/google-fonts) assets; no runtime font CDN is required. Package font licenses accompany their distributions.

## Boundaries and next migration

This update establishes the system, loads the real fonts, updates runtime palette/explicit font references, safe-area chrome and reusable patterns. It is **not a complete port of Today or the adjacent Page 2 screens**. The user explicitly deferred layout changes: existing page blocks, spacing, dimensions and four-destination navigation remain in place. Original Inkling artwork, actual bundled fonts, neutral controls/icons, pill button shapes and flat visual treatments are applied to the running app. A full screen/navigation port remains a separate step. Historical HTML explorations are not authority; the prior design-system specimen is archived under `archive/`.

Open decisions remain: remaining authored asset export/import; approval of adjacent Page 2 states; body/learning typography and multilingual behavior; detailed form/answer feedback; secondary/destructive actions; nested navigation; RAW tracking calibration; responsive and large-text behavior. Runtime extensions are reversible working defaults, not newly approved designs. Contrast/token checks do not establish full WCAG A/AA conformance; screen-reader, keyboard/modal focus, 200% scaling and real-device checks remain necessary.

## Verification of this update

- `npm run check:ui`: 100 production source files, 103 contrast contracts, zero failures; generated tokens/specimen, bundled font files, 28 asset-source entries and progress edge cases also pass. Original runtime SVG files are checked for non-empty content and unchanged root dimensions.
- `npm run typecheck`: passes.
- Expo export: iOS, Android and Web bundles generated successfully. This verifies bundling, not a native binary/store build.
- Browser specimen: checked at the available narrow viewport; real Manrope, Inter and Caveat files loaded successfully. Primary/disabled actions, course type, progress and reference/status labels were visually reviewed.
- Full page ports, authored artwork import, native text rendering, multilingual/large-text behavior and end-to-end assistive-technology acceptance are not claimed by these checks.

## Visual-only rollout and live verification

Following the user's instruction to defer layout changes, the rollout changes fonts, colors, button shapes, shadows, original mascot art, wordmark and existing-slot navigation icons. It does not re-order routes, add page sections or move the course rows/hero. A before/after AST check confirmed layout properties unchanged in 72 existing source files. Mascot and logo internals were replaced while preserving their existing public slot dimensions.

The authenticated iOS Today screen was verified in the running development build: original page structure and four destinations, original lilac Inkling export, actual Manrope typography, neutral palette and pill CTA. The device had retained a stale development bundle; it is now connected to the current workspace. `npm run start:local` starts an IPv4-first loopback-only server, avoiding the localhost/IPv6 mismatch without opening the service to the LAN. Use the existing development build's “Enter URL manually” with `http://127.0.0.1:8081` when needed.


## Today homepage implementation (Figma 33:1146)

The user subsequently authorized implementing the linked Today homepage. The screen now composes the original brand rays, notebook paper, mirrored Curious Inkling, primary arrow, streak flame and course chevrons at the reference dimensions. It uses the shared PrimaryButton, DailyGoal and CourseRow with real account, due-card, goal, streak and lesson data. Course covers are deliberately omitted, including their reserved space; cover selection remains a future feature. Existing four-tab routing is retained. The former floating assistant entry becomes a quiet action after the course list so the assistant remains available without covering content.

Verified in the authenticated iOS development build: the new composition is visible, rows have no cover slots, and a course row opens its existing detail screen. Type checking and UI/token/contrast/asset checks pass. iOS, Android and Web export succeeds; this is not a native binary build or a full WCAG conformance claim.


## Library grid implementation (Figma 57:2036)

Library now follows the linked two-column lesson grid: 24px page insets, a 12px column gap, 14px card corners, reading copy, real card/mastery/review counts and 4px progress tracks. The new-lesson action remains connected to the existing creation flow. The total lesson/card/review summary follows the grid. Original course covers and their 52px slots are omitted per the user's earlier instruction, reducing the reference card minimum from 238px to 181px. Titles and descriptions can grow; narrow screens below 350px or font scaling above 1.3 switch to one column. Shared four-tab navigation remains unchanged.

The original 17 × 17 Library disclosure SVG is local and keeps its root dimensions. The reference supporting ink (#656560), reading/link typography and grid-card geometry are represented in generated tokens. Authenticated iOS verification covered the two-column screen, opening a course, opening/cancelling New Lesson, and scrolling to the dynamic summary. Type checking, token/contrast/asset checks and iOS/Android/Web export pass. Empty and large-text layouts are implemented but have not been interactively verified.


## Navigation consolidation

The user subsequently removed Explore and moved You to the Today avatar. Runtime Explore discovery, public-deck detail/import, local category data and lesson publishing controls/queries are removed. Historical database migrations and existing server records are preserved. You now lives at /you as a stack screen with a Today return action; account subpage fallback routes follow it. The bottom bar has Today and Library tabs with a prominent 48px neutral-dark Create action between them. Create opens the existing stack flow and cancelling returns to the original selected tab.

Authenticated iOS verification covered Today ↔ Library, avatar → You → account settings → You → Today, and the center Create action → cancel → Library. Type checking, UI/contrast/assets checks and all three platform exports pass. An existing simulator notification/keychain warning appeared when loading account settings; it is outside this navigation change.


## Lesson detail implementation (Figma 59:2455)

The lesson page now uses a compact identity block, live total/review/mastered statistics, mastery track, shared review CTA, full-width search, level filtering and quiet term cards. Course cover artwork remains deferred. Reference icons are local SVGs with unchanged root dimensions. Disclosure actions are absent from the list. Knowledge cards open a details sheet with edit/delete; language cards provide pronunciation, structured language information and deletion, while editing remains disabled per the user's latest instruction. The sheet and parent edit handler both exclude language editing. Deletion retains its confirmation dialog.

Authenticated iOS verification covered the compact page, separately accessible pronunciation controls, expanded language content and (before language actions were removed) edit prefill plus cancellation of the delete confirmation. No existing card was saved or deleted. Final language read-only changes pass TypeScript and UI/token/asset checks; native verification was interrupted by the user. The page implementation exports for iOS, Android and Web; the final action visibility refinements were type-checked.


## Compact page insets

Per the user's product-wide request, runtime layout.screenInline is now 16px (the original Figma reference remains 24px). Today, Library, lesson detail, creation flows, authentication/onboarding, You/account pages, study/quiz page wrappers and primary sheet headers/content use this shared page-edge token. Card/input interiors and primary button horizontal padding remain independent; PrimaryButton retains 24px. Library column widths derive from the new token, and Today artwork fitting accounts for it. Authenticated iOS visuals were checked on Today, Library and lesson detail. Type checking and UI/token/asset checks pass.


## Lesson editor and shared confirmation states (Figma 66:2808, 66:2995, 66:3168)

The lesson editor now uses the stacked form, page heading and dark Save pill from the linked reference. Learning modes use full-width radio rows, and optional deadlines include a calendar entry and explicit Clear action. Page insets follow the subsequently approved 16px runtime token. The deadline sheet uses a Monday-first month grid, local-noon dates and separate draft state: Clear and day selection affect the draft; Cancel/close discard it; Confirm copies it into the form; only Save persists it. Existing prevention of choosing past dates is retained as a runtime adaptation. The centered delete dialog identifies the lesson and retains explicit destructive confirmation. Save/delete invalidate the lesson, dashboard and library caches.

The selected radio, calendar, down/left/right chevrons, close and trash icons use untouched local Figma exports at their natural dimensions. Modal scrim, selection surface, sheet handle, ivory draft surface and editor geometry are represented in tokens. TypeScript, UI/token/contrast/assets checks and calendar regression checks pass. The simulator accessibility tree confirms the new form and live course values; further native visual/modal verification requires unlocking the Mac. No lesson was changed or deleted during validation.

## Today hero character motion

The Today 96:606 character is inlined as [`components/InklingCharacter.tsx`](../../components/InklingCharacter.tsx), with its motion vocabulary in [`components/inkling/pose.ts`](../../components/inkling/pose.ts), instead of being loaded through `DesignAsset`. Paths are traced from `assets/design-system/today-hero-inkling.svg`. Four deliberate departures, all requested: the mouth and both legs are dropped, the authored eye dots became rounded vertical bars, and the lilac body is re-toned to ink. The exported SVG is unchanged.

### Model

Nothing is keyframed. Every frame computes a *target* pose for the current state, and a damped spring per quantity chases it:

| Quantity | Frequency, damping | Why |
| --- | --- | --- |
| Roll | 5, 0.9 | Slight overshoot on a lean |
| Drift, bob | 3.5 / 4, 1 | Loose and floaty |
| Squash | 10, 0.8 | Under-damped, so the body reads as soft |
| Lid | 26, 1 | Stiff, so a blink snaps |
| Eye shape, size | 9, 0.85 | A morph with a little bounce |
| Gaze | 13, 1 | Quick but not instant |
| Arm | 6, 0.75 | Under-damped, so the arms are floppy |

Three things follow. A state change needs no cross-fade: the target jumps and the spring absorbs it. A one-off beat is injected as **velocity** into a spring, so it kicks and settles instead of tweening. And the oscillators can be driven hard, because the spring low-passes them.

### Layers

| Layer | Driven by |
| --- | --- |
| Whole character | Lean, drift, bob, bounce, shake and the beat |
| Body | Squash and stretch, pivoting where the blob meets the ground |
| Each arm | The state's droop and swing, around the point where it meets the body |
| Eyes | Shape, size, gaze offset and lid, each its own spring |

### States

Twenty-three states in two groups, browsable in the Motion lab. A state sets a posture (lean, height, squash, arm droop), a rhythm (the rate of each oscillator and the arm swing), a lid and eye size, a gaze target with a wander radius and a hold span, a playlist of eye shapes with its own hold span, a blink cadence, and a beat: a velocity impulse on a random interval, which is what makes listening nod, curious lunge, happy hop, angry jolt and drowsy slump.

**Lifecycle** — sleeping, waking, idle, listening, thinking, searching, working.
**Reactions** — excited, surprised, suspicious, angry, drowsy, happy, curious, confused, bored, proud, shy, sad, laughing, scared, playful, celebrate.

Today uses five of them: `thinking` while the first lesson fetch is out, `curious` when the account has no courses, `happy` when the daily goal is met, `drowsy` when nothing is due, `idle` otherwise.

### Eyes

Each eye is a rounded bar, 6.5 by 14.3 units at rest. A shape scales it, squares its corners, tilts it and offsets it; the tilt is **mirrored** between the two eyes, which is what turns a tilt into a brow — inward reads angry, outward reads sad. Thirteen shapes cover the vocabulary: neutral, wide, huge, tall, focused, dot, squint, arc, slit, sly, cross, downcast, glance. The bar is deliberately large for its face: at the authored size the difference between squint, cross and sly was too small to read.

### The body in three dimensions

The drawing is flat, so a turn has to be inferred. `BODY` is flattened once at module load and reduced to a **profile**: at each of 144 heights, where the centre of the body is (`c`) and how wide it is (`a`), both smoothed with a binomial `[1,4,6,4,1]/16` kernel so the rebuilt outline has no steps in it. That profile is read as a stack of circles threaded on a spine, and the spine is given depth — a lean a viewer reads as "tilted" is really a lean in space.

Yawing the stack gives a new profile, and the drawn path is rebuilt from it as a closed Catmull-Rom spline. Two constants carry the parts a flat drawing cannot tell us:

- `BODY_DEPTH` (0.82) — each cross-section is slightly shallower than it is wide, so the body narrows a little as it comes round. At 1 nothing would narrow at all.
- `CROWN_DEPTH` (−1.15) — how much of the spine's lean points at the viewer rather than across the frame. This decides whether the crown swings with the turn or against it.

Round-trip checked: at a yaw of zero the rebuilt edges match the original path to within 0.1 units, so the profile is a faithful stand-in for the drawing.

The turn is a fixed design parameter rather than something that animates, so the yawed profile and its path are resolved once at module load and cost nothing per frame. The arms are re-anchored onto it by how far across the body their pivot sat, or they would detach from the edge.

**The honest limit.** A roundish body barely changes silhouette under a small yaw — the width scales by `sqrt(cos²θ + depth²·sin²θ)`, and `sin²(20°)` is 0.117, so at 20 degrees the body narrows by 2% and the crown moves 2.5 units. That is correct, and it is invisible. The body turn only starts to read at about 30 degrees, which is why `FACE_TURN_DEG` is 30: at 20 it was the eyes doing all the work.

### The silhouette, as a lookup

`BODY` is flattened once at module load into a polyline and reduced to a table of the outline's left and right edge at 160 evenly spaced heights. `spanAt(y)` interpolates it, and it is a worklet, so the frame callback can ask *where is the body at this height* without touching the path.

Everything about the face hangs off this. Placing features against two constants — one centre, one radius, sampled once at one height — is only right at that height and only while the body is at rest. Reading the span per eye, per frame, at that eye's own y means the face sits on the outline wherever the outline actually is.

### The three-quarter turn

The body is a fixed 2D path, so the turn is carried by where the eyes sit. Each eye is a point on the ring the body makes at its own height: the span gives the centre and radius there, the authored position gives the lateral angle, `FACE_TURN_DEG` is added, and the result is projected back.

Foreshortening is the **ratio** of the turned cosine to the resting one, not the turned cosine alone. That matters: an eye that already sat near the edge of the face narrows much faster than one that started face-on, which is what happens on a real head. Only narrowing is exaggerated (`** FORESHORTEN`); an eye swinging toward the camera is left to widen honestly. Measured on device, the far eye renders 12–13px wide against the near eye's 18–19px.

Two more things follow from the same angle. The eye fades out below `EYE_BEHIND` as it goes round the back. And the whole eye is **clamped inside the outline** — the span is sampled at its top, middle and base, and the tightest bounds win — so it can never poke through the silhouette when the body squashes. That clamp is blended out as the eye nears the limb: holding it there would shove the eye back toward the middle and undo the turn.

Simply sliding the pair sideways and narrowing the far eye is not enough. With the eyes still straddling the middle of the silhouette the face keeps reading as frontal, because the cue a viewer reads is **asymmetry of mass**: a turned head puts the whole face in one half of the outline and leaves the other half as the back of the head.

`FACE_TURN_DEG` is positive, which turns the face toward the right of the character's **own** frame. The Today hero mirrors the whole character with `scaleX: -1`, so on that card it lands pointing left, at the copy, rather than off the edge; the Motion lab does not mirror, so there the face is on the right. Flip the sign to turn the other way, and remember the mirror when judging which way that is.

### Why the two eyes are not one object

A single shared gaze spring moves both eyes identically, and a pair of eyes that moves identically reads as a printed sticker, not a face. Each eye now carries its own idle drift: two detuned sines across, one down, phase-shifted per eye on top of the shared gaze. Measured over six consecutive frames the two eyes travel in opposite vertical directions.

Lids are per eye too, which is what makes a **wink** possible — one eye, on its own asymmetric curve, snapping shut over the first 40% of its window and drifting back open over the rest.

The blink schedule holds the lid shut for a beat (`{0, 0.05}, {85, 0.05}, {170, 1.08}, {320, null}`). The repeated key is the whole point: without that hold a blink reads as a twitch however fast the spring is. A change of eye shape also swells the eye `MORPH_PULSE` on its way over, so an expression change has a moment of its own instead of sliding between two states.

The arms are not foreshortened to match. Their equal length is doing enough work; shortening the far one again would read as the lopsided drawing coming back.

### Arms

The drawing gives the two arms neither a common angle nor a common length: the left is level and 8.5 units long, the right is raised about 45 degrees and 13.5. That was fine for a still, but once the arms move it reads as lopsided. `armPath` redraws each one along its authored direction at `ARM_LENGTH`, and `ARM_NEUTRAL_DEG` rotates both to the same angle below horizontal; every state measures its droop and swing from there. Those two numbers are the whole carriage: change one to lengthen both arms, the other to raise or lower them.

The pivots keep their authored positions, which sit about 3.5 units apart vertically, because the blob's own outline is not symmetric and an arm should meet it where it is widest.

Arm swing is an angle, and an arm is only 13 units long, so the angles have to be generous: a few degrees moves the tip less than a point and reads as completely still. Posture is expressed as **droop**, with a per-arm sign for the direction that lowers the tip, because raising an arm tucks it behind the blob and it disappears.

### Reviewing it

`app/motion-lab.tsx` previews every state against both the hero card and plain paper, with buttons to fire a blink or a beat on demand. Its readout is generated from the motion tables, so it cannot drift out of step. The entry sits at the bottom of Profile > About, wrapped in `__DEV__` so it never reaches a release build.

### Provenance

The design was studied from a public replica of the Grok app's icon, whose own licence limits it to study and forbids commercial use and redistribution. What was taken is the shape of the technique: springs chasing per-state targets rather than keyframes, velocity impulses for discrete beats, posture-first states, gaze as its own spring with per-state targets and hold times, an eye-shape playlist per state, detuned oscillators, and an integrated clock. **No geometry, palette, timing table or code from it is reproduced here.** Its character has no limbs, so the arm design is MemQ's own, as are the eye-shape vocabulary and every value in `pose.ts`.

The whole animation is skipped when the system reduce-motion setting is on, and the character renders in its rest pose.
