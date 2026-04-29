# MemQ Design System

## Overview

MemQ is an AI-powered personalized learning platform for adults. The product helps users build personal knowledge systems and improve memory through active recall and structured learning.

**Core product features:**
- AI card generation (from questions, text, or documents)
- Personal knowledge libraries
- Spaced repetition quizzes (multiple choice, recall)
- Learning analytics and progress tracking
- Streak tracking, certificates, leaderboard, focus queue

**Design philosophy:** Editorial-style, typography-first, calm and intelligent. Inspired by tools like Notion and Linear — structure and hierarchy do the work that other products leave to decoration.

---

## Sources

This design system was derived from the MemQ Editorial UI concept, built iteratively in this project. No external codebase or Figma file is attached. All tokens, components, and patterns are derived from the final approved editorial direction.

---

## Content Fundamentals

**Tone:** Calm, intelligent, precise. Never exclamatory. Like a knowledgeable colleague, not a cheerleader.

**Voice:**
- Second person: "You've learned 47 days in a row" not "User has a 47-day streak"
- Present tense for stats: "84% accuracy", "Rank #12"
- Imperative for actions: "Generate cards", "Check answer", "Save all"
- No exclamation marks in UI copy (feedback like "Correct" not "Correct!")
- Labels are lowercase unless starting a sentence: "avg accuracy", "due today", "cards due"
- Section labels are UPPERCASE SMALL CAPS: "CURRENT STREAK", "RECENTLY MASTERED"

**Numbers:** Always display raw, large, and high-contrast. Numbers are the hero of data displays.

**Emoji:** Never used in UI. Unicode symbols used sparingly (→, ✓, ✗).

**Casing:**
- Navigation labels: Title Case
- Section labels: UPPERCASE (11px, 0.1em tracking)
- Button labels: Sentence case ("Generate cards", not "GENERATE CARDS")
- Card metadata: lowercase ("Card 01 · core concept")

---

## Visual Foundations

### Color
Single-accent system. One primary blue-green. Everything else is warm neutral.

- **Background:** `#FAFAF8` — warm off-white. Never pure white.
- **Surface:** `#FFFFFF` — card surfaces only.
- **Primary accent:** `#1A8A72` — blue-leaning green. Used on: interactive elements, progress fills, active states, CTA buttons, links.
- **Accent tint:** `#E6F5F2` — faint green for badges, topic chips.
- **Border:** `#E5E3DE` — single border weight, used everywhere.
- **Semantic green:** `#0F7E4A` — correct answers only.
- **Semantic red:** `#E03E3E` — incorrect answers only.

### Typography
Space Grotesk exclusively. Five levels:

| Level | Size | Weight | Tracking | Use |
|---|---|---|---|---|
| Display | 46–52px | 900 | -0.04em | Streak number, hero stats |
| Heading 1 | 28px | 800 | -0.03em | Section stats |
| Heading 2 | 17–21px | 700–800 | -0.025em | Card titles, questions |
| Body | 13–15px | 400–500 | 0 | Explanations, descriptions |
| Label | 10–11px | 500 | 0.08–0.12em | Section headers (UPPERCASE) |

### Spacing
Base unit: 4px. Standard increments: 4, 8, 10, 12, 14, 16, 18, 20, 24.
Horizontal padding: consistently 18–20px.
Vertical section gaps: 12–20px.

### Cards & Surfaces
- **Background page:** `#FAFAF8`
- **Card surface:** `#FFFFFF` with `1px solid #E5E3DE` border
- **Inner fill (L3):** `#F4F2F8` / `#F2EDE8` for code blocks, example areas
- **No shadows by default** — borders provide all separation
- **Minimal shadow (elevated):** `0 1px 3px rgba(26,25,22,0.05), 0 4px 12px rgba(26,25,22,0.06)`
- **Corner radii:** 6px (small), 8px (option rows), 10px (standard cards), 16–18px (primary cards)

### Borders
Single weight: `1px solid #E5E3DE` everywhere. No double borders, no colored borders except semantic states.

### Animation
Minimal. State transitions: `transition: background 0.15s`. No bounces, no scale transforms, no entrance animations.

### Hover states
Background lightens slightly. Color links darken. No underlines.

### Iconography
No icon library. Sparse use of:
- Unicode arrows: → ← ›
- Status marks: ✓ ✗
- No emoji
- Geometric unicode: used only in specific exploratory concepts, not production

### Imagery
No decorative imagery in UI. No gradients, blobs, or illustrations. Charts and data visualizations use the accent color on a neutral track.

### Layout
- Mobile: 320–390px wide, 20px horizontal margin
- Content max-width within cards: 100% minus padding
- Grid: 2-column for stats (divided by 1px borders, not gaps)
- No sticky headers in cards; scroll is full-page

---

## File Index

| Path | Contents |
|---|---|
| `README.md` | This file — brand overview and visual foundations |
| `SKILL.md` | Agent skill definition |
| `colors_and_type.css` | All CSS design tokens |
| `preview/` | Design System tab card previews |
| `ui_kits/mobile-app/` | Mobile app UI kit (Profile, Create, Quiz screens) |
| `assets/` | Logos and brand assets |
