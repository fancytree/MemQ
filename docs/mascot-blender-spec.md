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

---

## 8. The next file: one piece, rigged

Everything above describes the cut-out pipeline, where the app composites flat part
renders and animates them with springs. That pipeline has a ceiling, and we have hit
it: it cannot deform the body. The legs are the clearest case. They are separate
meshes that overlap the torso, which is why they render with no seam — the body stops
at z 0.225 and each foot reaches up to 0.571 — but overlap is not attachment. Swing a
leg and it slides out from under the body's own fillet, and the join shows. Joining
the objects does not help: `bpy.ops.object.join()` merges objects, it does not weld
surfaces, and the result still holds five unconnected shells of 6050, 3010, 3010,
1490 and 1490 verts. An armature bound to that deforms nothing across the hip.

Welding them after the fact is possible — a voxel remesh does produce one continuous
surface — and it is the wrong answer. It discards the original topology, inflates the
mesh from 15k to 19k or 59k verts depending on voxel size, and quantises the boundary
between the body material and the slightly darker `Clay · feet` into a voxel-sized
staircase. A character that is one piece should be modelled as one piece.

### What the next file needs

**One continuous mesh** for everything that deforms: torso, both arms, both legs. Not
five objects overlapping, and not a remesh of five objects — one surface, modelled
that way, with the fillets where the limbs meet the body built into the geometry.
Horns and tail are better joined into it too, so they can be weighted and carry
secondary motion; the eyes and mouth stay separate, because they are swapped rather
than deformed and the per-eye split already works.

**Material slots on that one mesh** rather than one material per object: the body
lavender, the horns darker, the feet their own slightly darker tone. The values in
section 7 are the source of truth and should not be retuned.

**An armature**, weight-painted rather than auto-bound — automatic weights on a smooth
blob put the body on whichever bone is nearest and the deformation is unusable. A
workable set is root, spine, head, arm_L/R, leg_L/R, two or three tail bones so it
trails, and a bone per horn.

**A named action per state**: idle, happy, excited, thinking, focused, surprised,
sleepy, and the four product moments. Looping ones should return exactly to their
first pose without repeating a frame at the end.

Keep `Camera | Front` and its orthographic scale of 3.66 unchanged, so whatever comes
out still lines up with the face art already imported.

### Then rendering

Hand over the .blend rather than rendered animations. With the rig in the file the
frames can be generated here, at the size and frame count the app actually wants, and
re-generated when a timing changes — rather than being fixed at whatever was exported.
A supplied 6-frame 512px lossless WebP measured 1.62 MB; re-encoded lossy at q90 it is
253 KB with the alpha untouched and a mean RGB difference of 1.9/255, so the encoding
belongs in the import step, not in the hand-off.

---

## 9. Video for the body, runtime for the face

Hands are the case that settles the argument. Posing a hand that reaches, holds and
lets go is modelling and animation work that does not reduce to translating a cut-out,
and the measurements say the rendered attempts are not close: over one Blender-exported
`thinking` clip the frame-to-frame change averages 0.6 to 6.1, while the directly
generated animation of the same state averages 14 to 17. Three times the motion. The
generated one deforms the body every frame; the exported one translates a rigid shape.

So the body comes from the renderer and the face stays here. That split works because
the two need different things. A body that squashes, reaches and holds has to be
authored once and played back. A face has to react — the blink cadence is random so it
never reads as a loop, the gaze picks a new target on its own interval, the eye art
changes with state, and a correct answer should land as a beat the moment it happens.
None of that survives being baked into a clip.

### What has to come with the clip

A face drawn on top of a deforming body cannot sit at a fixed spot: the head bobs,
tilts and scales. So each clip needs a **per-frame face anchor** — the two eye
positions in the same normalised canvas coordinates the parts already use.

This exports cleanly. `world_to_camera_view` on the eye objects gives exactly those
coordinates: measured against the current file it returns 0.3986 for the left eye
where the parts manifest records a pivot of 0.397814, which is the same point. Across
the happy block the anchor tracks the hop — x 0.3986 to 0.3849 and back, y 0.4767 to
0.4531 and back — and the small difference between the left and right y carries the
head's tilt. Four numbers a frame give position, tilt and scale.

### Frames, not an animated file

Ship each clip as a **numbered frame sequence**, not as an animated WebP or a video.

An animated image plays itself, and nothing can ask it which frame is showing — so the
face overlay cannot be placed, which is the whole point of the anchor. Driving the
frames here fixes that, and buys two more things: the same clip can play at different
speeds for different states, and two clips can cross-fade on a state change. It also
needs no new dependency, since a frame is just another part.

Each clip therefore is: frames rendered **without the eyes and mouth**, on the usual
camera with alpha; and a small JSON with the frame rate, whether it loops, and the
anchor track. Budget roughly 40 KB a frame at q90, so a twelve-frame loop is about
half a megabyte.
