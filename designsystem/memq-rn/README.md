# MemQ — React Native (Expo) port

Editorial flashcard app. TypeScript + Expo Router + react-native-svg.

## Stack

- **Expo SDK 52** (React Native 0.76)
- **TypeScript** (strict, `noUncheckedIndexedAccess`)
- **Expo Router** v4 — file-based routing
- **react-native-svg** for the icon set (zero icon-library dependencies)
- **StyleSheet** (no styling library) — design tokens live in `theme/`

## Install & run

```bash
cd memq-rn
npm install
npx expo start            # press i / a / w
```

## File tree

```
app/
├── _layout.tsx           Root stack — wraps (tabs) + create + quiz + deck/[id]
├── (tabs)/
│   ├── _layout.tsx       Custom tab bar host
│   ├── index.tsx         Today / Home
│   ├── library.tsx       Library — your decks
│   ├── explore.tsx       Browse / discover
│   └── profile.tsx       You — streaks + stats
├── create.tsx            Modal — generate cards
├── quiz.tsx              Quiz host (mcq / recall / flip)
└── deck/[id].tsx         Deck detail — push from Library

components/
├── EdBase.tsx            Editorial base scroll surface
├── SectionLabel.tsx      Uppercase tracked label
├── Divider.tsx           1px hairline rule
├── Icon.tsx              Hand-rolled SVG icon set
└── CustomTabBar.tsx      Tab bar with elevated FAB

theme/
├── colors.ts             Editorial palette (warm off-white + teal accent)
├── typography.ts         Font families + type ramp
├── spacing.ts            4px scale + radius
└── index.ts              Barrel

data/
├── decks.ts              Deck list + per-deck detail
├── questions.ts          Quiz questions (typed: MCQ | RecallQuestion | FlipQuestion)
└── explore.ts            Featured + trending decks + categories
```

## Design language

- **Background** `#FAFAF8` (warm off-white)
- **Single accent** `#1A8A72` (teal) — never compete with it
- **Hairline borders** 1px on `#E5E3DE`
- **Cards** 10px radius, white surface, hairline border
- **Typography hierarchy**: 52px display number → 22px h1 → 14px body → 10px tracked label

## Fonts

You said you'd handle font loading yourself. The family names referenced in code are:

- `SpaceGrotesk` — body / UI
- `Fraunces` — editorial alt
- `JetBrainsMono` — numerics / labels

Register them via `expo-font` (`useFonts({ SpaceGrotesk: require('./assets/...') })`) at the root layout. Until they resolve, RN falls back to system default — visually fine, the layout doesn't shift.

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
