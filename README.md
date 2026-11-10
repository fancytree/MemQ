# MemQ — iOS app

Editorial flashcard app built with React Native, Expo, and Expo Router. The supported app target is iOS.

## Stack

- **Expo SDK 57** (React Native 0.86)
- **TypeScript** (strict, `noUncheckedIndexedAccess`)
- **Expo Router** — file-based routing
- **react-native-svg** for the icon set (zero icon-library dependencies)
- **StyleSheet** (no styling library) — design tokens live in `theme/`

## iOS development

```bash
npm install
npm run ios                         # build/install the app in the iOS simulator
npm start                           # connect Metro to the installed development build
npm run start:local                 # loopback-only server with simulator-compatible IPv4 lookup
npm run ios:device                  # build/install on a connected iPhone
```

The app uses an Expo development build; Expo Go is not used. For a cloud development build, run `npm run build:ios:development` and install the resulting build on a registered iPhone. Use `npm run build:ios:preview` for internal distribution and `npm run build:ios:production` for the App Store build.

## File tree

```
app/
├── _layout.tsx           Root stack — wraps (tabs) + create + quiz + you
├── (tabs)/
│   ├── _layout.tsx       Custom tab bar host
│   ├── index.tsx         Today / Home
│   └── library.tsx       Library — your lessons
├── create.tsx            Modal — generate cards
├── quiz.tsx              Quiz host (mcq / recall / flip)
└── you.tsx              You — streaks + stats, opened from Today avatar

components/
├── EdBase.tsx            Editorial base scroll surface
├── SectionLabel.tsx      Compact compatibility label
├── Divider.tsx           1px hairline rule
├── Icon.tsx              Hand-rolled SVG icon set
└── CustomTabBar.tsx      Today / prominent Create action / Library

theme/
├── colors.ts             Source palette + accessible semantic aliases
├── typography.ts         Font families + type ramp
├── spacing.ts            Contextual layout spacing + legacy utility scale
└── index.ts              Barrel

data/
├── decks.ts              Deck list + per-deck detail
└── questions.ts          Quiz questions (typed: MCQ | RecallQuestion | FlipQuestion)
```

## Design language

The current [MemQ design system v2](docs/design-system/README.md) follows the supplied Today, hand-drawn decoration and Inkling references: **white / ink foundation; color lives in the details**. This supersedes older teal/orange-led editorial explorations.

- White canvas, near-black actions/progress, quiet metadata and open course rows.
- Local pale paper and authored illustrations; no dominant lilac/peach product theme.
- Measured source values remain separate from accessible runtime adaptations and unmeasured extensions.
- [Reviewable specimen](docs/design-system/index.html), [source inspection](docs/design-system/source-design-language.md), [generated tokens](theme/tokens.json).
- `npm run design-system:build` regenerates the token artifacts and specimen; `npm run check:ui` validates synchronization, contrast, fonts, asset registry and progress behavior.

## Fonts

Manrope is the main application family; Inter handles compact utility/numbers; Caveat is limited to short supportive annotations. Font assets are packaged through Expo Google Fonts and loaded by `theme/font-assets.ts` in the root layout. JetBrains Mono remains an extension for actual code samples. New styles use `fonts` / `type` tokens rather than hardcoded family names.

The system provides `PrimaryButton`, `CourseRow`, `DailyGoal` and a three-destination `BottomNavigation`. Existing screens and the four-route application shell are not fully ported; see the [migration boundaries](docs/design-system/README.md#boundaries-and-next-migration).

## Routing notes

- The Create FAB pushes `/create` on the **parent stack** (modal presentation), not a tab — Create isn't a tab destination.
- Quiz is a stack route too — invoked from Today's "Start review", deck detail's "Review N due", and Today's queue cards.
- Deck detail uses `[id].tsx` dynamic route. Falls back to `hist` if id is unknown so deep links don't crash.

## Type safety

- All component props typed via `interface`
- Discriminated union for quiz modes (`mode: 'mcq' | 'recall' | 'flip'`) — narrow on `q.mode` in views
- No `any`. Strict mode catches the `noUncheckedIndexedAccess` cases (`questions[idx]!` is the only acknowledged non-null assertion — `idx` is always in range)

## Known caveats

- **SVG percentages** in StyleSheet (`width: '78%'`) work in RN but type-checking with strict mode sometimes complains depending on RN version — bump `@types/react-native` if needed.
- **`fontVariant: ['tabular-nums']`** — the web prototype uses this everywhere. I've left it out for RN portability. Add `style={{ fontVariant: ['tabular-nums'] }}` to numeric labels (streak, stats) if your fonts ship the feature.
- **Custom tab bar typing** uses `BottomTabBarProps` from `@react-navigation/bottom-tabs`. If TS can't resolve it, add it explicitly to `package.json` (Expo Router includes it transitively but versions drift).
