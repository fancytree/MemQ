# MemQ Mascot — what the .blend needs to produce

Handover spec for the Blender side. Source inspected: `MemQ Mascot.blend`, Blender 5.3,
scene `MemQ | Character and motion`, 607 frames, Cycles, `film_transparent` on,
three orthographic cameras, three area lights, no armature.

The file is in good shape. The character is consistent, the parts are already split
under `Mascot | motion root`, the arm pivots are already separate empties, and the
materials are named and clean. What follows is what has to change for the app to
drive it, plus two defects found while rendering it.

---

## 1. The headline: stop animating in Blender

The scene currently holds 607 frames of keyframed animation — a showcase reel that
walks through every expression, each object carrying its own action.

**The app does not want that.** MemQ's character motion is built on the opposite
model, and it is the model this redesign should inherit:

> Nothing is keyframed. Every frame computes a *target* pose for the current state,
> and a damped spring per quantity chases it.

Concretely, what the app already owns and would throw away by shipping baked clips:

| Capability | Baked clips | Spring model |
| --- | --- | --- |
| Number of states | one clip each | 23, composable |
| State change | cross-fade between clips | target jumps, spring absorbs it |
| Reacting to a real event | play a clip from the start | inject a velocity impulse mid-motion |
| Looking like a loop | it is a loop | detuned oscillators, no detectable period |
| Asset weight | 607 frames | ~16 still images |
| Gaze | baked directions | continuous, its own spring |

So Blender's job is **to produce static parts at a fixed camera**, not motion. The
motion is computed at runtime, per frame, from the state the app is actually in.

The showcase reel is still worth keeping as a reference for how each expression is
meant to read. Keep it in the existing file; the parts come out of a second file.

## 2. Deliver a second file: `MemQ Mascot · parts.blend`

Save-as from the current file, then in the copy:

1. **Delete every action.** `bpy.data.actions` emptied, all objects unlinked from
   animation data. This is the step that matters — object visibility is currently
   driven by keyframes, so any attempt to show a group by setting `hide_render` is
   silently overridden when the frame is evaluated. (This cost a full wrong render
   pass to discover.)
2. **Put the body in a neutral rest pose**: `Mascot | motion root` at identity;
   `Arm pivot.L/R` at their neutral droop; shape keys `Sit - hips down` and
   `Sit - feet forward` at 0; `Tuck - shorten arm` at 0.
3. **Leave every expression group in place**, hidden. With no actions, `hide_render`
   becomes the only switch and the render script can select any combination.

Do not change the cameras or lights. `Camera | Front`, orthographic, `ortho_scale`
3.66 is the contract — every part must be rendered from that exact camera or the
pieces will not composite back together.

## 3. Parts to render

Each as its own PNG, RGBA, transparent background, same camera, 1024×1024.
(The character displays at 192pt; 1024 leaves headroom above the 576px that 3× needs.)

**Body and limbs**
- `body` — neutral, no face
- `ear_L`, `ear_R` — separate, so they can lag behind a head turn
- `arm_L`, `arm_R` — origin on the existing `Arm pivot` empties
- `foot_L`, `foot_R`
- `shadow` — **does not exist yet.** A soft ground-contact ellipse, its own part, so
  it can shrink and fade as the character leaves the ground during a hop.

**Face, as swappable pieces**
- `eye_white_L/R` and `pupil_L/R` — the Idle pair, pupils **centred and without the
  `Gaze *` shape keys applied**. Gaze is a spring at runtime: the pupil is translated
  inside the white, continuously. Baked gaze directions quantise it into N steps and
  cannot be driven by a spring.
- Eye variants: `eyes_blink_half`, `eyes_blink_closed`, `eyes_squeezed` (Excited),
  `eyes_focused` (the angled brow), `eyes_wide` (Surprised), `eyes_sleepy`
- Mouth variants: `mouth_smile`, `mouth_open` (with tongue), `mouth_round`,
  `mouth_sleepy`

**Props**, each separate so they can be animated in on their own timing
- `gold_accents`, `zzz`, `laptop`, `book`, `card_check`, `confetti`

## 4. Two classes of asset, and the line between them

Not everything in the reel is a pose. Four of them are *scenes*:

- **Live character** — Idle, Thinking, Happy, Excited, Focused, Surprised, Sleepy.
  These are postures. They become parts, driven by springs.
- **Scene illustrations** — Onboarding (peeking over a shelf), Learning Complete
  (card and check), Study Review (book), Streak Reward (confetti). These are
  compositions with props and a set. Render each as one flat PNG and place it as art.

Trying to rebuild a scene out of parts buys nothing; trying to ship a posture as a
flat PNG throws away the motion. Keep the line where it is.

## 5. Defects found

**`Ear.L` and `Ear.R` carry the material `Eyes · warm white`.** They render white
against a lavender body, which contradicts the reference art. They should be
`Clay · lavender`. Every render in this session overrode it in memory; the file
itself is unchanged and still wrong.

**Material colours do not match the published design tokens.** Resolved: **the .blend
is the source of truth**, and the five swatches on the design board are superseded.
Do not retune any material to match them.

| Material | In the file | Board token it supersedes |
| --- | --- | --- |
| `Clay · lavender` | `#A692EE` | `#A78BFA` |
| `Face · dark purple` | `#2F2049` | `#4B3F72` |
| `Eyes · warm white` | `#FFF9F9` | `#FFF9F9` (identical) |
| `Props · lemon gold` | `#F9C857` | `#FFD85E` |
| `Clay · feet` | `#9E86EA` | — |

The dark purple is the one that actually moves: the file's is markedly deeper and
cooler than the board's.

## 7. Full material reference

Principled BSDF base colours, converted from linear to sRGB. These are what the app's
palette will be derived from once the mascot is wired in; `theme/colors.ts` is not
being changed before then, because nothing references these yet and the character
currently on screen still uses the older `inklingBody` / `inklingFeatures` tokens.

| Material | sRGB | Roughness |
| --- | --- | --- |
| `Clay · lavender` | `#A692EE` | 0.77 |
| `Clay · feet` | `#9E86EA` | 0.77 |
| `Eyes · warm white` | `#FFF9F9` | 0.88 |
| `Face · dark purple` | `#2F2049` | 0.88 |
| `Tongue · muted pink` | `#BA6F88` | 0.77 |
| `Props · lemon gold` | `#F9C857` | 0.82 |
| `Props · paper` | `#FFF5CE` | 0.77 |
| `Props · white card` | `#FFF7F0` | 0.77 |
| `Props · check mark` | `#4DBF6B` | 0.77 |
| `Props · berry confetti` | `#D985AE` | 0.77 |
| `Props · purple confetti` | `#A07BE4` | 0.77 |
| `Props · warm silver` | `#C2C2D0` | 0.55 |
| `Props · laptop detail` | `#9898A9` | 0.65 |

## 6. Frame map of the existing reel

Kept for reference, since the expressions can only be rendered out of the current
file by seeking to the right frame.

| Expression | Frames |
| --- | --- |
| Idle | 1–37, 44–84 |
| Blink half / closed | 38–39, 42–43 / 40–41 |
| Thinking | 85–132 |
| Happy | 133–161 |
| Celebrate | 162–209 |
| Confused | 210–245 |
| Sleepy | 246–317 |
| Excited | 318–349 |
| Focused | 350–397 |
| Surprised | 398–427 |
| Onboarding | 428–469 |
| Learning Complete | 470–511 |
| Study Review | 512–559 |
| Streak Reward | 560–607 |
