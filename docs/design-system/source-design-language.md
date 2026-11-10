# MemQ design language

> A source-backed description of the existing design, not a redesign or a complete production component specification. Inspected 2026-10-21.

## Evidence and precedence

**Authority:** the current **MemQ · Today** screen and the approved **16 hand-drawn decorations** and **12 Inkling expressions and poses** collections. Earlier explorations do not override these references. Where the collections' presentation typography or ink colors differ from the application, use Today for structural UI and the collections for their artwork.

Evidence labels used below:

- **Measured:** read from actual Figma layers, including text properties, dimensions, fills, strokes, effects, and auto-layout.
- **Observed:** visible design character or composition, supported by the rendered references.
- **Guidance / extension:** a recommended application of the existing language, not an existing component or approved state.
- **Unspecified:** not established by the inspected primary references.

All measurements are in Figma canvas pixels. HEX values are measured solid RGB fills/strokes, rounded to 8-bit channels; opacity is listed separately when relevant. Dimensions describe reference geometry, not automatically device-independent runtime requirements.

**Token status:** the file exposes no local variables, local text styles, local paint styles, or local effect styles. No variable/style bindings or component/instance nodes were found within the three primary references. Every token name in this document is a **proposed implementation alias**, not an existing Figma variable. “Component” below means an observed reusable visual pattern, not a published Figma component definition. Other screens in the file do contain component nodes; this finding is scoped to the primary references.

## 1. Product and design intent

MemQ supports learning through courses, study cards, daily review goals, and a continuous-learning streak. Today's invitation is **“A little learning, every day.”** The visible task is to return to learning, see what is due, and enter a course. The intended audience is adult learners: friendly encouragement without a childish game-world interface.

The interface is light, quiet, and handmade. A white canvas, near-black typography, modest gray metadata, and generous breathing room do most of the work. Pale paper notes, small course illustrations, a handwritten aside, and Inkling add humanity without becoming the interface's organizing structure.

**There is no dominant brand color.** Do not derive a purple product theme from Inkling, or a peach theme from the paper details. The collection itself says: **“White / ink foundation · Color lives in the details.”**

## 2. Color system

### Structural interface colors — measured from Today

| Proposed alias | HEX | Existing role / source node |
| --- | --- | --- |
| `color.surface.canvas` | `#FFFFFF` | Screen background (`33:1146`); primary-button label and arrow |
| `color.ink.primary` | `#242424` | Headline, course titles, primary action fill, progress fill, active navigation |
| `color.ink.wordmark` | `#151719` | MemQ wordmark (`33:1159`), not a separate action color |
| `color.ink.muted` | `#858580` | Course metadata/count, chevrons, inactive navigation |
| `color.surface.neutral` | `#F7F7F4` | Profile circle (`33:1164`), active navigation capsule (`33:1247`) |
| `color.line.subtle` | `#EEEEEB` | Goal track, progress separator, navigation top border |
| `color.ink.annotation` | `#76705A` | Handwritten aside on the Today note (`33:1173`) |

Navigation, primary actions, progress, and selection stay neutral. Active navigation is a pale neutral capsule with near-black icon/text, not a saturated fill. Inactive items use muted gray on white.

### Paper surfaces and Today illustration accents — measured

| Proposed alias | HEX / opacity | Existing use |
| --- | --- | --- |
| `color.paper.today-note` | `#FCF6DB` | Torn notebook-paper reminder (`33:1170`) |
| `color.paper.peach` | `#FBECE5` | Italian illustration backing and small streak-flame fill |
| `color.paper.lilac` | `#F1ECFA` | Psychology illustration backing |
| `color.paper.blue` | `#EAF4F9` | Economics illustration backing |
| `color.decoration.today-tape` | `#FFD1B7`, layer opacity 51% | Tape on the reminder (`33:1174`); source color, not the composited result |
| `color.decoration.cup` | `#DC7F69` | Small espresso-cup illustration |
| `color.decoration.brain` | `#8D75BC` | Small psychology illustration |
| `color.decoration.chart` | `#5C9993` | Small economics illustration |
| `color.decoration.coin` | `#E5B04E` | Small coin in economics illustration |
| `color.decoration.wordmark-rays` | `#9680F0` | Tiny hand-drawn rays beside the wordmark |
| `color.inkling.body` | `#BAADEE` | Inkling's flat lilac silhouette |
| `color.inkling.features` | `#293133` | Inkling's face and thin limbs |

Paper is very high-lightness color, not a colored UI panel system. Stronger, distinct hues belong to small illustrations. Inkling's lilac belongs to the character; **it is not the global action or selection color**.

### Decoration collection palette — measured, asset-specific

Preserve the source asset's palette rather than forcing every drawing into Today's exact hues. Close but different paper colors are present intentionally in different assets; no unified ramp is defined.

| Asset role | Verified source colors |
| --- | --- |
| General drawn ink / handwriting | `#30352E` |
| Yellow note and marker/book paper | `#FFF5C8`; fold/detail `#EADDA5`; fine line `#E1D6A8` |
| Clipped ruled page | `#FAF9F1`; rules `#DDDCD1`; clip `#7C7194` |
| Peach reminder / stamp backing / plane | `#FCEBE3` |
| Pin | `#E58E77`, `#F3AB96`; line `#A56C57` |
| Heart / bookmark heart / flame detail | `#E88D77` |
| Stamp center and heart line | `#EA875F`, `#FFE6A1` |
| Little accent rays | `#D5AA58` |
| Washi tape | `#F6B7AC` at 82% layer opacity; `#EEE8F9` at 90%; lines `#E69C90`, `#D7CEE9` |
| Lilac paperclip accent | `#B6A8DD` |
| Flower / leaf | `#EAC765`, `#F5E8B0`, `#72AA96`; leaf line `#416A58` |
| Plane trail | `#A7A094` |
| Open book and blue bookmark | `#FCFBF6`, `#EAF4F7`, and the yellow paper above |

Collection captions also use `#71756F` / `#858981` (decorations) and `#707579` / `#888D90` / `#8A8E91` (Inkling board). These are **presentation-board labels**, not additional application text tokens. Some open-path vectors retain a `#000000` fill property; do not infer a new semantic color from that property alone.

### Semantic feedback

Success, warning, destructive, error, and informational token sets are **not established by these primary references**. The peach flame, coral hearts, green leaf, and lilac character are decorative, not semantic feedback specifications. Correct/incorrect and error-named screens exist elsewhere in the file, but were not promoted to authority by this inspection.

**Extension guidance:** establish semantic colors and accessible text/icon treatments explicitly before implementation; keep them distinct from decorative palettes and convey status with words/icons as well as color. Do not silently name the cup color `error` or the chart color `success`.

## 3. Typography

**Manrope** is the main application family. **Inter** is used for system/status and compact utility/numerical text. **Caveat Regular** supplies human handwritten annotations, never the main learning content.

### Today text measurements

`Auto` is Figma's stored line-height value, not a verified fixed pixel token. Rendered text-box height is included where useful but is not a substitute for line height. All tracking is zero unless stated.

| Proposed role | Family / weight | Size | Stored line height | Tracking | Source / observed box |
| --- | --- | --- | --- | --- | --- |
| `type.wordmark` | Manrope ExtraBold 800 | 25 | 32 px | −1.1 px | `33:1159`, 75 × 32 |
| `type.heading.page` | Manrope Bold 700 | 30 | 113% (33.9 px calculated) | −1.1, API unit `RAW` | `33:1167`, two lines, 354 × 68 |
| `type.note.count` | Manrope SemiBold 600 | 19 | Auto | −0.6, `RAW` | `33:1172`, 178 × 26 |
| `type.heading.section` | Manrope Bold 700 | 19 | Auto | −0.6, `RAW` | `33:1201`, 26 px box height |
| `type.goal.label` | Manrope Regular 400 | 20 | Auto | 0 | `33:1191`, 27 px box height |
| `type.button` | Manrope SemiBold 600 | 16 | Auto | 0 | `33:1185`, 22 px box height |
| `type.course.title` | Manrope SemiBold 600 | 15 | 125% (18.75 px calculated) | −0.25, `RAW` | `33:1212`, 19 px box height |
| `type.meta` | Manrope Regular 400 | 12 | Auto | 0 | Course count and card metadata, 16 px box height |
| `type.streak` | Manrope SemiBold 600 | 13 | Auto | 0 | `33:1198`, 18 px box height |
| `type.nav.active` | Manrope SemiBold 600 | 10 | Auto | 0 | Today label, 14 px box height |
| `type.nav.inactive` | Manrope Regular 400 | 10 | Auto | 0 | Create / Library labels, 14 px box height |
| `type.utility.greeting` | Inter Regular 400 | 14 | Auto | 0 | `33:1163`, 17 px box height |
| `type.utility.initial` | Inter Semi Bold 600 | 14 | Auto | 0 | `33:1165`, 17 px box height |
| `type.utility.status` | Inter Semi Bold 600 | 15 | Auto | 0 | `33:1149`, 18 px box height |
| `type.goal.number` | Inter, mixed 600 / 400 | 15 | Auto | 0 | `33:1192`, 42 × 18 |
| `type.annotation` | Caveat Regular 400 | 18 | Auto | 0 | `33:1173`, 136 × 23 |

For the goal count, **“6 ” is Semi Bold in primary ink**, while **“/ 20” is Regular in muted ink**. A tabular-numeral feature is not verified. The API reported `RAW` tracking for some Manrope layers; its conversion to CSS pixels/em was not verified. Preserve the source appearance and confirm the mapping rather than treating those entries as proven CSS pixel values.

### Handwriting and board typography

Editable handwriting within the decoration assets uses Caveat Regular: pinned/torn notes **22/29 px**, clipped note **21/28 px**, stamp **12/16 px**, handwritten nudge **27/36 px**, and marker underline annotation **26/34 px** (font size / explicit line height). These are asset-specific source sizes, not a new application scale. Some handwriting boxes are 70 px high even when their text occupies less space; do not copy that box height as line height.

Collection headings use Manrope ExtraBold **28/37** and **26/36**; board captions use sizes **9–14 px**. These organize asset sheets and should not override Today's UI typography.

**Guidance:** use weight, size, alignment, and whitespace for hierarchy. Keep essential reading in Manrope/Inter and primary ink. Handwriting is a short supportive aside; never put study questions, answers, form instructions, or critical feedback entirely in Caveat. A long-form learning/body-text scale is **unspecified** and must be established for Study rather than inferred from tiny metadata.

## 4. Layout and spacing

### Measured Today geometry

| Region / proposed alias | Measurement | Interpretation |
| --- | --- | --- |
| Reference screen | **402 × 844** | White, clipped root frame; vertical auto-layout, fixed width/height, zero root padding/gap |
| `space.screen-inline` | **24** each side | Main content width **354** |
| Welcome | y **0**, h **110** | Status bar + personal greeting |
| Status bar | **402 × 50** | Left/right padding **28**, top **6**; system icons 17/25 px frames |
| Personal greeting | y **50**, h **60** | 24 px side padding; horizontal space-between, centered cross-axis |
| Daily learning section | y **110**, h **304** | Padding top **16**, bottom **26**, sides **24**; vertical gap **18** |
| Headline | x **24**, y **126**, **354 × 68** | Deliberate two-line invitation |
| Review invitation | x **24**, y **212**, **354 × 106** | Paper in flow; character absolutely positioned |
| Primary action | x **24**, y **336**, **354 × 52** | Full content width |
| Daily progress section | y **414**, h **82** | Side padding **24**, top **2**, bottom **28**, horizontal gap **20** |
| Course section | y **496**, h **274** | Side padding **24**, bottom **22** |
| Course heading / list | heading h **36**; list **354 × 216** | Three contiguous 72 px rows; heading has 10 px bottom padding |
| Bottom navigation | y **770**, **402 × 87** | Important clipping discrepancy below |

Main content uses vertical stacks with fill-width/hug-height children. Horizontal rows center related items; header and goal-summary rows use space-between. The page is not a grid of rounded cards: course rows and progress sit directly on white.

**Observed rhythm:** small internal gaps **4, 5, 6, 10, 12, 14 px**; section/composition gaps **18, 20, 22, 24, 26, 28 px** also occur. This is **not evidence of a strict 8 px spacing system**. A useful proposed alias set is `space.nav-label=4`, `space.course-text=6`, `space.profile=10`, `space.course-inline=14`, `space.hero-stack=18`, `space.screen-inline=24`; each names an observed use, not a universal scale.

### Safe areas and navigation caveat

The 50 px status-bar region is measured; an explicit platform safe-area configuration is not. Bottom navigation has 10 px top padding, 8 px bottom padding, and a 16 px vertical gap. Its destinations occupy y **780–828**; the home-indicator layer is **134 × 5**, at absolute x **134**, y **844**.

**Measured inconsistency:** the 87 px navigation begins at y 770, ending at **857**, beyond the 844 px clipped screen. Only **74 px** of the navigation region is visible; the home indicator is entirely clipped. Do not treat either 74 or 87 as an approved production safe-area rule. Preserve the navigation's visible language, but resolve its viewport anchoring and safe-area inset before implementation. Do not silently reproduce the overflow as intentional behavior.

**Extension guidance:** on new viewport sizes, preserve comfortable inline margins, allow content to grow/scroll, and reserve real platform safe-area space for navigation. Responsive breakpoints, keyboard behavior, scrolling, and large text rules are not specified by this static frame.

Whitespace separates the greeting, invitation, progress, and courses. Dark typography establishes hierarchy before color or containers. Retain the calm density: a short introduction, one clear action, a compact progress summary, and easily scanned course rows.

## 5. Observed component patterns

### Measurements and supported states

| Pattern | Measured construction | Verified state / limits |
| --- | --- | --- |
| Primary action | **354 × 52**, primary-ink fill, white label/arrow; radius **100** stored (pill); horizontal padding **24**, vertical **15**; space-between content | “Start learning” default only; no border, shadow, pressed/loading/disabled specification |
| Action arrow | **18 × 18** icon frame, **1.8** px white stroke, round caps | Right-facing; artwork bounds approx. 10.5 × 10.5 |
| Profile control | **44 × 44** neutral circle, radius **100**; centered Inter 14/600 initial | Default “A”; no menu or expanded state in Today |
| Profile cluster | **108 × 44**, greeting + control, gap **10** | “Hi, Alex.”; header uses space-between |
| Course row | **354 × 72**, clear background, no border/shadow/container; horizontal gap **14** | Three default rows; no selected/pressed/disabled state established |
| Course illustration | **52 × 52** frame | Pale irregular backing + small flat subject-specific drawing |
| Course text block | **242 × 65** at reference width; vertical padding **12**, title/metadata gap **6** | Title 15/600, metadata 12/400; titles shown on one line |
| Course disclosure | **32 × 44** wrapper; **17 × 17** chevron icon frame; **1.5** px muted stroke | Chevron artwork right-aligned within wrapper; row hit area not specified |
| Daily goal | **236 × 42**, label/count row **236 × 27**, gap **10** before track | “Daily goal”, “6 / 20” |
| Progress track | **236 × 5**, subtle neutral fill, radius **100** | Completed segment **57 × 5**, primary ink, radius **100** |
| Progress divider | **1 × 42**, subtle neutral | Gap **20** on either side |
| Streak cluster | **77 × 52**, vertical gap **5** | Hand-drawn flame **25 × 29**, **1.3** px primary-ink outline, pale peach fill; “7-day streak” |
| Navigation item | **126 × 48**, three items in a row with **12** px outer horizontal padding | Ordered **Today / Create / Library**; label gap **4** |
| Navigation selection | **52 × 28**, radius **100**, **21 × 21** icon | Today active: neutral fill + dark icon/600 label; Create/Library inactive: white + muted icon/400 label |
| Navigation region | **402 × 87**, **1** px top border only | Screen overflow unresolved; see layout section |
| Paper reminder wrapper | **212 × 98** | No enclosing card; irregular paper silhouette |
| Paper shape | **212 × 100**, offset **1,1** inside wrapper | `#FCF6DB`, no shadow or stroke |
| Paper content | **178 × 54**, offset **18,25**, vertical gap **5** | Semibold due count + smaller handwritten encouragement |
| Tape | **47 × 13**, rotation approx. **10.5°**, opacity **51%** | Single pale peach tape strip; no shadow |

**Progress discrepancy:** `6 / 20` implies **30%**, but the drawn segment is **57 / 236 ≈ 24.2%**. The measured geometry is not a valid percentage rule. Confirm which is intended; future progress indicators should represent their data consistently.

Course contents are “Everyday Italian” (**8 due · 32 cards**), “Cognitive Psychology” (**7 due · 48 cards**), and “Economics Essentials” (**4 due · 24 cards**). The due counts sum to the displayed **19**. These are reference content, not default data for every screen.

### Extension guidance — not existing specifications

The primary references do not define form fields, search, filters, dropdowns, sheets, dialogs, answer options, secondary/destructive buttons, loading skeletons, or complete error/empty/success states. Some corresponding screens are present elsewhere in the file, but their approval and exact reusable specifications have not been established here.

- Build missing patterns from the neutral structure, existing type roles, thin lines, and generous whitespace; do not invent a new accent-color system.
- Reuse the pill primary-action language where appropriate; do not claim that all controls have radius 100 or height 52.
- Keep secondary actions visually subordinate; exact outline/text-button styling remains a decision.
- Preserve readability and accessibility: define touch targets, focus indicators, disabled appearance, contrast, text scaling, and error messaging explicitly. The small labels measured above are not proof of accessibility compliance.
- A paper note is a selective editorial detail, not the universal container for forms, study cards, course lists, or every section.

## 6. Illustration and decoration

**Observed style:** flat editable vectors; thin, slightly imperfect lines; simple silhouettes; pale paper; tiny human details. Torn edges, loose arrows, tape, clips, and handwriting suggest a study notebook without photorealistic paper texture. Primary references contain **no effect entries**: no shadows, blur, or glossy treatment.

The approved decoration sheet is **1080 × 1134**. Each asset's specimen frame is **232 × 144**, including whitespace; that is **not** the size of the visible drawing or a required in-app placement size.

| Existing asset | Node ID | Suitable use — guidance |
| --- | --- | --- |
| Pinned little note | `33:1271` | A brief reminder or gentle nudge |
| Clipped ruled page | `33:1282` | Saving or collecting an idea |
| Torn peach reminder | `33:1290` | Short, supportive aside |
| First little stamp | `33:1297` | Small milestone, not a large badge system |
| Looping down arrow | `33:1308` | Point to a nearby next step sparingly |
| Follow this arrow | `33:1313` | Directional margin detail |
| Two little hearts | `33:1318` | Warm encouragement, not a status indicator |
| Streak flame | `33:1325` | Continuous-learning streak; never substitute a star |
| Washi tape pieces | `33:1334` | Occasional paper attachment detail |
| Lilac paperclip | `33:1342` | Small collection/notes motif |
| Flower and leaf | `33:1348` | Quiet supportive illustration |
| Paper plane and trail | `33:1357` | Light creation/completion metaphor |
| Handwritten nudge | `33:1367` | Brief encouragement: “you’ve got this” |
| Soft marker underline | `33:1373` | One short annotation, not a global text highlight |
| Open little book | `33:1380` | Learning/library context |
| Blue page bookmark | `33:1388` | Saved material context |

Reuse the existing assets before drawing substitutes. Their handwriting is editable Caveat text. Scale proportionally and inspect legibility; retain intentionally uneven contours. Use a few relevant details around a task, not all assets at once or a decorative border around every surface. Prefer one clear decorative moment over repeated stickers.

Measured source strokes vary with the drawing: arrows **1.7–1.8 px**, flame **2–2.3 px**, book **1.4 px**, bookmark **1.2 px**, clips **2–3 px**, paper rules **0.7–0.9 px**. The stamp's heart has a **5 px** stroke. There is no universal 1 px illustration outline; reuse the authored paths rather than normalizing all widths.

## 7. Inkling

The approved Inkling collection is **1000 × 963**. Its written rule is: **“One lilac shape. Tiny ink features. No textures, shadows or extra decoration.”**

- **Silhouette:** a simple, softly uneven pear/drop-like body with a rounded taper at the top and broad lower body. Preserve the supplied silhouette rather than replacing it with a circle, a generic ghost, or an elaborate creature.
- **Color:** one flat `#BAADEE` fill; face/limbs `#293133`. No shading, blush gradients, material rendering, costume, or extra sticker details.
- **Features:** tiny dot eyes or quiet line expressions, minimal mouth, thin arms and legs. Hello's eye shapes measure approx. **4.7 × 4.7 px**; body geometry approx. **83.4 × 96.7 px** inside its source frame. These are examples, not mandatory geometry for every expression.
- **Source scale:** pose frames **160 × 158**; internal editable-vector frame **160 × 148**. Typical limb strokes **1.9 px**, face strokes approx. **1.49–1.8 px**, usually round caps. Outer frame size includes whitespace.

### Available expressions — names and suggested uses from the collection

| Pose | Node ID | Authored suggested use |
| --- | --- | --- |
| Hello | `33:1401` | Daily welcome |
| Thinking | `33:1412` | Working through an idea |
| Curious | `33:1424` | Discover something new |
| Focused | `33:1436` | One card at a time |
| Happy | `33:1446` | A good little moment |
| Well done | `33:1456` | Review complete |
| You can do it | `33:1467` | A gentle encouragement |
| Little celebration | `33:1479` | Goal reached |
| Not quite sure | `33:1491` | A question to explore |
| Try again | `33:1503` | Another chance, no pressure |
| Taking a breath | `33:1515` | Pause and reset |
| Sleepy | `33:1525` | All caught up |

The board includes **24 × 24** (`33:1538`), **40 × 40** (`33:1547`), and **64 × 64** (`33:1556`) small-size checks. Those are authored examples, not an exhaustive sanctioned size scale; expression details become less visible at small sizes.

Today uses a **160 × 158** Curious frame (`33:1175`) beside the reminder, with absolute bounds x **243**, y **172** relative to the screen. The actual character occupies less than that frame. The wrapper carries a **−180° transform**, while the visible character reads upright; treat this as an implementation peculiarity, not an instruction to invert Inkling elsewhere. Reuse the approved pose and its visual orientation rather than rebuilding from wrapper transforms.

**Placement guidance:** keep Inkling near a welcome, empty state, pause, or completion message, subordinate to the message and action. Use the existing small-size examples for compact placements and the Today composition as a larger reference. Do not enlarge the mascot into a hero that displaces study content, put it in every row, or let it obstruct buttons. No universal maximum size or mandatory placement is specified.

## 8. Iconography

Utility icons are spare neutral outline vectors, with round line caps and no colored badges or glossy backplates. The measured navigation vectors use **miter joins**; do not assume every icon has round joins just because caps are round.

| Icon role | Frame / artwork | Measured stroke | Treatment |
| --- | --- | --- | --- |
| Today / Create / Library | **21 × 21** frames | **1.7 px** | House / circle-plus / books; primary or muted ink by selection |
| Primary-action arrow | **18 × 18** frame | **1.8 px** | White on dark pill |
| Course chevron | **17 × 17** frame | **1.5 px** | Muted, no enclosing badge |
| Today streak flame | **25 × 29** artwork | **1.3 px** | Hand-drawn outline + pale peach fill |
| Wordmark rays | **18 × 26** wrapper; **13 × 14** path bounds | **2.5 px** | Small lilac-purple decorative gesture, not an action icon |

**The continuous-learning streak is a hand-drawn flame, not a star.** Use the existing flame artwork/collection source. Keep utility icons visually quieter and more regular than decorative gestures; do not replace the whole interface with sketchy icons or multicolor icon tiles.

## 9. Applying the system to new screens

This section is **extension guidance**, not approval of new layouts or a claim that no other screens exist. Page 2 already includes Library, Create, course-detail, practice, completion, and sheet/state designs. Their names were inventoried, but their exact geometry/state systems were not used to expand this approved baseline. Consult those screens and confirm their status before promoting additional patterns into shared tokens.

Preserve the top-level destination order and labels: **Today / Create / Library**. New screens must not introduce a competing tab taxonomy. Whether focused study and nested detail flows hide or retain bottom navigation remains a product decision, not a rule established by Today.

| Screen | Consistent application of the existing language | Still to specify |
| --- | --- | --- |
| Library | Use the neutral shell, Manrope headings, open course rows, muted counts, small course illustrations; Library is the selected destination. A book/bookmark detail may support an empty state. | Search/filter patterns, sorting, long lists, empty/loading states and approval of existing variants |
| Create | Select Create; keep input/learning material prominent, one clear neutral primary action, concise labels. Use a note/clip detail only if it supports the composition. | Inputs, upload states, generation progress, validation, review/save flow and keyboard layout |
| Course detail | Carry forward the small course illustration, title hierarchy, due/card metadata, neutral progress/action language, and open grouping rather than unnecessary cards. | Detail hierarchy, back behavior, item interactions, nothing-due state and navigation visibility |
| Study | Make question/answer content the visual priority; neutral structural controls and accurate numerical progress. Inkling, if used, should be small and off the reading path. | Long-form type, answer controls, reveal/selection states, correct/incorrect feedback, exit flow |
| Session complete | Use concise supportive copy, readable session data, one clear next action, and an existing Well done / Happy / Little celebration pose as appropriate. | Metrics, next destination, secondary actions, feedback palette, navigation behavior |

For each extension, first match the three approved references, then resolve missing interaction and accessibility specifications explicitly. Do not fill gaps with patterns from the old colorful, sculptural, glossy, or gamified explorations.

## 10. Do / Don't

| Do | Don't |
| --- | --- |
| Preserve white, near-black, and neutral gray as the structural system. | Turn lilac, coral, teal, or yellow into the dominant UI/action color. |
| Keep colored paper surfaces very light and local to a meaningful detail. | Fill large backgrounds or every card with saturated pastel colors. |
| Reuse the approved editable illustration assets and poses. | Generate a new mascot style or redraw assets as glossy/3D objects. |
| Keep learning content readable and prominent. | Let decorative handwriting replace primary learning or instructional text. |
| Use typography, alignment, and whitespace to establish hierarchy. | Add a rounded card container around every row, statistic, and heading. |
| Keep Inkling supportive and secondary to the user's task. | Use oversized mascots, repeated mascots, or character-colored action buttons. |
| Preserve thin, imperfect drawn lines and flat fills. | Add gradients, glossy effects, 3D rendering, heavy shadows, or textures. |
| Use sparse decoration with a reason to be there. | Add sticker clusters, excessive doodles, or celebratory effects to routine states. |
| Represent continuous learning with the authored flame. | Substitute a star or infer a generic achievement-badge system. |
| Keep decoration separate from semantic feedback. | Treat a decorative coral heart as error red or a green leaf as success green. |
| Label extensions, approximations, and unresolved values. | Present invented precision or historical experiments as approved tokens. |

## 11. Sources and open questions

### Primary sources — directly inspected layers and rendered visuals

File: [MemQ / Untitled](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled). Primary references are on **Page 2**, page ID `33:1145`.

| Reference | Node ID | Link |
| --- | --- | --- |
| MemQ · Today | `33:1146` | [Open Today](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1146) |
| MemQ · Hand-drawn decorations · 16 editable assets | `33:1262` | [Open decoration collection](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1262) |
| MemQ · Inkling · 12 expressions and poses | `33:1394` | [Open Inkling collection](https://www.figma.com/design/YkyRSgXn9qY2lHKd1plTss/Untitled?node-id=33-1394) |

Specific measurement anchors: primary action `33:1184`; paper note `33:1169`; goal/count/track `33:1189`, `33:1192`, `33:1193`; streak `33:1196`; first course row `33:1204`; bottom navigation `33:1244`; clipped home indicator `33:1261`. Individual artwork sources are indexed in sections 6–7.

### Non-authoritative context

Page 1 (`0:1`) was inventoried by frame names/dimensions, not exhaustively audited. It contains multiple historical directions: for example **Sculptural lavender** (`13:4764`, 402 × 920), **Colorful collection** (`13:4929`, 402 × 920), **Playful & gamified** (`3:1189`, 414 × 1040), and **Neutral structure + multicolor content** (`28:2`, 390 × 844), plus other review/create/course-first explorations. Their palettes, dimensions, typography, and effects are not design-system requirements.

Other Page 2 screen names were inventoried, including Library (`39:12897`), Create · Italian notes (`39:12977`), course detail (`39:13096`), Practice · Selected · Main (`39:13165`), and Session complete (`39:13204`). They are adjacent design work, not substitutes for the user-designated primary references. No state measurements or semantic palette were extracted from them for this document.

### Explicit open questions / missing specifications

1. **Bottom navigation / safe area:** should the 87 px navigation be moved/resized, or the 844 px viewport adjusted? The indicator is currently clipped. No production bottom inset is verified.
2. **Progress consistency:** should the completed segment be 30% for `6 / 20`, or is the displayed count wrong? The current 57 px segment is about 24.2%.
3. **Tracking conversion:** what does the reported `RAW` letter-spacing unit map to in the target implementation? Negative values are recorded, but a CSS conversion is not verified.
4. **Body/learning text:** no approved long-form reading scale, answer typography, multilingual fallback, text scaling, wrapping/truncation policy, or content-length limits are established here.
5. **Feedback states:** semantic color roles, correct/incorrect presentation, errors, destructive actions, validation, and non-color cues need explicit approval. Existing adjacent variants require review before extraction.
6. **Interactive component states:** pressed, hover, focus, disabled, loading, expanded, and selected states beyond Today's navigation are not specified by the primary references.
7. **Responsive behavior:** breakpoints, scrolling/sticky behavior, keyboard accommodation, and nested-flow navigation visibility are unspecified.
8. **Accessibility:** contrast acceptance criteria, minimum touch targets, screen-reader labels/order, reduced motion, and large-text behavior are not established by the visual references. No accessibility certification is implied.
9. **Formal system assets:** should these proposed aliases become actual variables/styles/components? No such definitions are bound to the primary references today.
10. **Inkling transform and scale:** is Today's transformed wrapper intentional? No universal placement/maximum size rule exists; use approved artwork appearance and the authored small-size checks rather than propagating transform quirks.
11. **Additional screens:** which adjacent Page 2 screens/states are approved, and which should supply the next round of measured specifications?

When a future agent encounters an unverified value, retain the existing neutral/handmade language, label its proposal, and seek a decision rather than claiming an invented value is part of the current system.
