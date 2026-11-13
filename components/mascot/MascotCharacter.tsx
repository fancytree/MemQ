/** The mascot, drawn as vector parts driven by springs.
 *
 * Nothing is keyframed. Every frame computes a *target* pose for the current state
 * and a damped spring per quantity chases it, so a state change needs no cross-fade
 * and a discrete accent is injected as velocity rather than tweened. That model has
 * now outlived three media — vector paths, then rendered clay, now vector paths
 * again — which is the point of keeping it separate from the artwork.
 *
 * The artwork is eight Figma frames, imported as named paths by
 * scripts/import-mascot-figma.cjs. A state names the frame it wears; the frame
 * carries the expression and the springs carry the life. Everything inside the SVG
 * is in the artwork's own 256-square space, and only the outer views work in pixels,
 * so the character is resolution-independent and nothing here multiplies by a scale
 * except the box itself.
 *
 * Each part that moves on its own gets its own layer, because a React Native view
 * transform is the cheapest animation available and it cannot reach inside an SVG.
 * The one exception is the pupil, which has to move *within* its eye: it lives in
 * the same SVG as the eye white so the white can clip it, and is driven by animated
 * SVG props instead.
 *
 * Three things this body does that the clay one could not: it is a few kilobytes
 * instead of a few megabytes, it is sharp at any size, and its horns and tail are
 * separate paths, so they trail the head instead of being welded into one
 * silhouette. One thing it cannot: there are no arms or legs to swing, because the
 * design does not have any.
 */
import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type ComponentProps, type ReactNode,
} from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';

import { MASCOT_ART, MASCOT_HANDS, type FigmaPath, type MascotPartName } from './figma-parts';
import {
  MASCOT_STATES, mascotPose,
  type MascotFrame, type MascotMood, type MascotPose,
} from './state';

const AnimatedG = Animated.createAnimatedComponent(G);
/** Whatever an animated view accepts: a plain view style, or the handle a
 * `useAnimatedStyle` returns. Spelling it this way avoids casting at each call. */
type AnimStyle = ComponentProps<typeof Animated.View>['style'];

/** The side of the square the artwork is drawn on. */
const VIEW = 256;

/** [frequency, damping] per quantity. Under-damped squash is what makes a soft body
 * read as soft; a stiff lid makes a blink snap; a loose horn trails and wobbles. */
/** [frequency, damping] per quantity.
 *
 * Nothing here is critically damped except the lid. Damping of 1 is the textbook
 * answer and the wrong one for a soft body: it arrives exactly on target and stops
 * dead, which is what reads as mechanical. Every quantity that carries weight
 * overshoots a little and settles, and runs slower than it did. The lid is the
 * exception because a blink has to snap — a soft blink reads as a droop. */
const SPRING = {
  roll: [3.2, 0.62], tx: [2.6, 0.7], ty: [3, 0.68], squash: [7, 0.5],
  lid: [26, 1], eye: [7, 0.7], gaze: [14, 0.85], arm: [4.2, 0.52],
  tail: [5, 0.42], lag: [6, 0.42], pop: [10, 0.48], mark: [4.5, 0.45],
  // Slower and looser than the horns', so the tail trails further behind the body
  // and keeps swinging after it has stopped.
  trail: [3.4, 0.33],
} as const;
const SUBSTEP = 1 / 120;

const BLINK_KEYS = [
  { at: 0, lid: 0.05 }, { at: 85, lid: 0.05 }, { at: 170, lid: 1.08 }, { at: 320, lid: null },
] as const;
const DOUBLE_BLINK_CHANCE = 0.14;
/** How far into a blink the face is swapped. The lid spring reaches shut at about
 * 60ms and starts back up at 170, so this lands while the eye is closed. */
const SWAP_AT = 110;
/** How long one eye stays shut in a wink. Longer than a blink, which is the whole
 * difference: a blink is involuntary and a wink is addressed to someone. */
const WINK_MS = 420;

/** Idle drift of the pupils, in artwork units. */
const EYE_DRIFT = { ax: 0.56, rx: 0.47, bx: 0.20, rx2: 1.13, ay: 0.36, ry: 0.63 } as const;
/** How far a look moves the eye, and how far it moves the pupil inside it, in
 * artwork units per unit of look.
 *
 * Two reaches rather than one reach split between them. Splitting was wrong twice
 * over: it tied the two together when the whole point is that they are separate
 * parts, and it left the pupil with a third of a reach that was already too small.
 * Measured off the screen afterwards, the pupil sat at -0.04 of its room across and
 * -0.9 down — centred sideways and pinned to the top — while the face as a whole
 * read as looking left. An eye white is about 47 units across and a pupil 20, so the
 * pupil has roughly 13 units of room sideways and 10 up and down, and these are
 * sized to spend it.
 *
 * The frames also draw the pupil high in its white, so the vertical is not symmetric
 * about nothing: looking level already means pulling it down. */
const GAZE_EYE = { x: 7, y: 4 } as const;
const GAZE_PUPIL = { x: 11, y: 10 } as const;
/** And how far the mouth goes with them. Less than the eyes, as in any turned head:
 * the features all shift together and the ones further from the turn shift least. A
 * mouth left where the frame drew it while the eyes move is the thing that stops a
 * look reading as a look. */
const GAZE_MOUTH = { x: 5, y: 2.5 } as const;

/** Where the character meets the ground: the bottom of the body, on its centre line.
 * Squash pivots here, not at the middle, or the body sinks into the floor as it
 * compresses. */
const GROUND = { x: 124, y: 216 } as const;
/** Below this fraction of the state's own resting lid, the eye is drawn shut instead
 * of narrowed. A state that rests half-lidded is squinting, not blinking, which is
 * why the threshold is relative rather than absolute. */
const LID_CLOSED = 0.3;
/** How far the lid can open past its rest, so a blink comes back with a flick. */
const LID_MAX = 1.15;
/** How far the trailing horn and tail angles are amplified before they are drawn.
 *
 * The tail's is the larger by a lot, and it is the main thing the tail does: what is
 * drawn is the gap between the body's lean and a softer spring chasing it, so the
 * tail whips out when the body turns and swings back through when it stops. Its own
 * sway is a garnish on top of that, not the other way round — a tail running on a
 * clock of its own looks pinned to the picture rather than hung off the animal. */
/** How much of the body's drift and lean the decorations keep. Not none: they hang
 * in the air beside the character and move when it does, just less, and late. */
const MARK_FOLLOW = 0.4;
const MARK_ROLL = 0.35;
const HORN_SWING = 2.0;
const TAIL_SWING = 7.0;
/** One rise of a drifting decoration: how long it takes and how far it travels. */
const DRIFT_MS = 2600;
const DRIFT_RISE = 16;
/** A floating decoration bobs rather than leaving: amplitude in artwork units. */
const FLOAT_RISE = 5;

/** The decorations, and which group each belongs to. The badge pops about itself; the
 * accents, question mark and z's pop, bob or drift about theirs. */
const ACCENTS: MascotPartName[] = ['accent', 'question', 'zzz'];
const BADGE: MascotPartName[] = ['badge', 'check'];

/** A closed lid, for a frame whose own eyes are open. It is the sleeping frame's arc
 * — a lid coming down, where the happy frame's curves up into a smile — moved to sit
 * on whichever eye it is covering, since the sleeping face is drawn 19 units lower
 * than the rest. */
const LID_ART = MASCOT_ART.sleepy.parts.filter((p) => p.name.startsWith('eyeClosed'));

interface Spring { x: number; v: number; t: number }
function spring(x: number): Spring { return { x, v: 0, t: x }; }
function step(s: Spring, freq: number, damp: number, dt: number) {
  'worklet';
  s.v += (-2 * damp * freq * s.v - freq * freq * (s.x - s.t)) * dt;
  s.x += s.v * dt;
  if (!Number.isFinite(s.x) || !Number.isFinite(s.v)) { s.x = s.t; s.v = 0; }
}
function wave(t: number, rate: number, phase: number) {
  'worklet';
  return Math.sin(t * rate + phase) - Math.sin(phase);
}
function randomMs([min, max]: readonly [number, number]) {
  return min + Math.random() * (max - min);
}

/** Where a part turns, as pixels from the box's centre. A view transform rotates and
 * scales about its own centre, so a pivot is reached, used and undone. */
function pivot(x: number, y: number, box: number) {
  return { dx: (x / VIEW - 0.5) * box, dy: (y / VIEW - 0.5) * box };
}
function centre(parts: FigmaPath[]) {
  const x0 = Math.min(...parts.map((p) => p.box[0]));
  const y0 = Math.min(...parts.map((p) => p.box[1]));
  const x1 = Math.max(...parts.map((p) => p.box[2]));
  const y1 = Math.max(...parts.map((p) => p.box[3]));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
}
/** The first point of a path, which for the tail is exactly where it leaves the body
 * and so exactly where it should swing from. */
function start(part: FigmaPath) {
  const m = /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/.exec(part.d);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : centre([part]);
}

interface Motion {
  roll: Spring; tx: Spring; ty: Spring; sx: Spring; sy: Spring;
  lid: Spring; eye: Spring; gazeX: Spring; gazeY: Spring;
  horn: Spring; tail: Spring; wag: Spring; arm: Spring; pop: Spring; pupil: Spring;
  markX: Spring; markY: Spring; markR: Spring;
  clock: number; driftClock: number;
  /** Everything crossing from JS arrives as a counter this worklet compares against,
   * never as a field JS writes into this object: writing into an object already
   * handed to a worklet is unsupported and silently unreliable. */
  moodSeen: MascotMood; kickSeen: number;
  pose: MascotPose;
}
interface Rendered {
  tx: number; ty: number; roll: number; sx: number; sy: number;
  /** Degrees the horns and the tail trail the body's lean by. */
  horn: number; tail: number;
  /** Degrees each hand is turned about the body's centre. */
  armL: number; armR: number;
  /** Where the character is looking, -1 to 1, and the idle wander on top of it. The
   * eye and the pupil each turn this into their own distance. */
  gx: number; gy: number; driftX: number; driftY: number;
  eye: number; pupil: number;
  /** Where the lid is now, and where this state rests it. */
  lid: number; lidRest: number;
  /** Scale of a popping decoration, the rise of a drifting or bobbing one, and the
   * twinkle all of them carry. */
  pop: number; drift: number; float: number; spark: number;
  /** How far the decorations have followed the body, in pixels and degrees. They
   * keep its rhythm at a fraction of its size and a beat behind — drawn outside the
   * stage so they do not wear its squash and its hop, but not cut loose from it
   * either: a mark that ignores the body entirely reads as a different drawing. */
  markX: number; markY: number; markRoll: number;
}

function Shape({ part, clip }: { part: FigmaPath; clip?: string }) {
  return (
    <Path
      d={part.d}
      // A stroked path carries no fill in the export, and SVG's own default fill is
      // black, so the absence has to be said out loud.
      fill={part.fill ?? 'none'}
      stroke={part.stroke}
      strokeWidth={part.width}
      strokeLinecap={part.cap as 'round' | undefined}
      strokeLinejoin={part.join as 'round' | undefined}
      clipPath={clip}
    />
  );
}

/** One still layer of the stack: a transparent SVG the size of the box, holding
 * whichever parts move together, under whatever animated style drives them. */
function Layer({ box, parts, style }: {
  box: number; parts: FigmaPath[]; style?: AnimStyle;
}) {
  if (!parts.length) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={box} height={box} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        {parts.map((p, i) => <Shape key={i} part={p} />)}
      </Svg>
    </Animated.View>
  );
}

/** One open eye: the white, and the pupil clipped to it.
 *
 * The pupil is the only thing in the character that has to move inside another part
 * rather than with it, so it is the only thing driven through animated SVG props.
 * The clip matters for more than tidiness: the focused frame draws a whole disc and
 * lets the brow cut the top off it, so an unclipped pupil there rides up over the
 * brow and the squint disappears. */
function OpenEye({ box, white, pupil, align, out, clipId, style }: {
  box: number; white: FigmaPath; pupil?: FigmaPath;
  /** How far this pupil has to move to rest where the other one rests, relative to
   * its own white. The frames draw the pair converged by different amounts — in the
   * neutral face the left pupil sits 9.5 units right of its white's middle and the
   * right one 6.5 units left of its own — and a look adds the same offset to both,
   * so the gap travels with them and the character reads cross-eyed wherever it
   * looks. Both are moved to the average, which keeps whatever convergence the
   * drawing has while making the two eyes agree about direction. */
  align: { x: number; y: number };
  out: SharedValue<Rendered>; clipId: string; style: AnimStyle;
}) {
  const at = pupil ? centre([pupil]) : { x: 0, y: 0 };
  // Commas, not spaces. `translate(x y)` is valid SVG and react-native-svg takes only
  // the first number from it, leaving y at zero — which is why the pupil tracked a
  // look sideways perfectly and ignored every attempt to move it up or down, through
  // three rounds of blaming the reach, the sign and the artwork in turn.
  const gaze = useAnimatedProps(() => ({
    transform: `translate(${out.value.gx * GAZE_PUPIL.x + out.value.driftX + align.x},`
      + `${out.value.gy * GAZE_PUPIL.y + out.value.driftY + align.y})`
      + ` translate(${at.x},${at.y}) scale(${out.value.pupil})`
      + ` translate(${-at.x},${-at.y})`,
  }));
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Svg width={box} height={box} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        <Defs><ClipPath id={clipId}><Path d={white.d} /></ClipPath></Defs>
        <Shape part={white} />
        {pupil && (
          // The clip goes on a group OUTSIDE the one that moves. SVG resolves a
          // clip-path in the user space that is in effect for the element
          // referencing it — which includes that element's own transform — so a clip
          // named on the moving pupil travelled with it and never cut anything. The
          // eye white is the hole; the pupil slides behind it.
          <G clipPath={`url(#${clipId})`}>
            <AnimatedG animatedProps={gaze}>
              <Shape part={pupil} />
            </AnimatedG>
          </G>
        )}
      </Svg>
    </Animated.View>
  );
}

export function MascotCharacter({ width, mood = 'idle', blinkSignal = 0, beatSignal = 0, winkSignal = 0, tilt = 0, look, drift = true, calm = false, behind, handRest, tailRest, eyesShut = false, style }: {
  width: number;
  mood?: MascotMood;
  /** A fixed lean, in degrees, applied inside the character rather than to the box
   * around it — so scenery passed as `behind` stays upright. */
  tilt?: number;
  /** Whether the face may drift between the state's frames. A hero that a person
   * looks at all day wants one face and small life inside it; a lab wants to see the
   * whole set. Off, the state wears its primary frame and nothing else. */
  drift?: boolean;
  /** Hold one face: no drift between frames, no blink, no wink. What is left is the
   * body's own breath, the tail it swings, and the eyes tracking wherever the
   * character has been told to look. For a screen a person is reading and typing
   * into, a face that keeps changing is something to watch instead of a form. */
  calm?: boolean;
  /** Where to aim the gaze, added to whatever the state looks at: -1 is hard left,
   * +1 hard right, and the same for up and down. Which way the character should look
   * is not a property of its mood but of where the surface has put it — on Today it
   * sits to the right of the copy, so it looks left at it. The state's own wander
   * still plays on top, so the eyes drift rather than stare. */
  look?: { x?: number; y?: number };
  /** What the character sits behind and puts its hands over. Today's hero passes a
   * hill; the login screen passes the card itself, so the character perches on its
   * top edge with its body behind and its hands over the front.
   *
   * It is a child in the flow, after the body and before the hands, so a card given
   * a negative top margin rides up over the body by exactly that much. The wrapper
   * stops forcing a square when it is present, and stops swallowing touches — the
   * card it is handed may be a form. */
  behind?: ReactNode;
  /** Where a paw rests on the body's outline, adjusted for one screen.
   *
   * `out` pushes it away from the body's centre, in art units of the 256 box;
   * `turn` slides it along the outline, in degrees, positive downward on the right
   * side. Those are the two things a paw can do here, because it is not a hand on
   * an arm — it is a paw resting against the outline, so it lives on a circle about
   * the body's middle and the artwork is drawn tangent to it. Sliding it with a
   * plain translation would leave it at the wrong angle to the line it rests on.
   *
   * Both hands need it on Today, for different reasons, and neither correction
   * belongs in the shared artwork:
   *
   * `out` — the two paws are not mirror images. About the body's own centre (x 124
   * of the 256 box, not 128: the body is not centred in it) the left paw rests at
   * radius 76.50 and the right at 70.19, so the right one is 6.31 units inside the
   * circle the left one rests on, buried in the outline instead of against it.
   *
   * `turn` — what a paw rests on is whatever that screen puts in front of the body.
   * Today puts a hill there and the hill's edge is a slope, so the two paws meet it
   * at different heights; the sign-in screens put a card there and its edge is
   * level, so they do not. A screen's own foreground is not something the artwork
   * can know about. */
  handRest?: {
    left?: { out?: number; turn?: number };
    right?: { out?: number; turn?: number };
  };
  /** Moves the tail off where the artwork sprouts it, in art units of the 256 box:
   * x positive right, y positive down. Per screen, like handRest.
   *
   * The artwork already carries one global correction — the importer lifts the tail
   * 48 units and shifts it 10 right (TAIL_LIFT / TAIL_SHIFT in
   * scripts/import-mascot-figma.cjs) — and that lift was asked for by the sign-in
   * screens, where the card covers the body's lower half and a tail drawn at its
   * natural height disappears behind it. Nothing covers the body on Today, so there
   * the same lift reads as a tail riding too high up the back.
   *
   * It is a translation rather than a turn because a tail is not a paw: it sprouts
   * from a point on the body instead of resting against the outline, and the swing
   * already pivots about that point — which moves with this, so the motion follows.
   */
  tailRest?: { x?: number; y?: number };
  /** Hold the eyes shut. The login screen covers them while a password is being
   * typed, which is the oldest joke in the book and the right one. */
  eyesShut?: boolean;
  /** Increment to blink right now, regardless of the state's cadence. */
  blinkSignal?: number;
  /** Increment to fire the state's beat right now. */
  beatSignal?: number;
  /** Increment to wink right now. */
  winkSignal?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = width;
  // React's own id carries colons, which an SVG url(#...) reference cannot hold.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const reduceMotion = useReducedMotion();
  const state = MASCOT_STATES[mood];

  // A state may name several frames and drift between them. The first is the one it
  // is wearing when it arrives, and the one everything but the face comes from.
  const frames = useMemo(
    () => (Array.isArray(state.frame) ? state.frame : [state.frame]), [state.frame]);
  const [face, setFace] = useState<MascotFrame>(frames[0]);
  useEffect(() => { setFace(frames[0]); }, [frames]);
  const art = useMemo(() => build(frames[0], face, !!state.arm, !!state.bare),
    [frames, face, state.arm, state.bare]);

  const moodRef = useSharedValue<MascotMood>(mood);
  const lidOverride = useSharedValue<number | null>(null);
  const lookX = look?.x ?? 0;
  const lookY = look?.y ?? 0;
  const gazeAim = useSharedValue({ x: state.gaze.x + lookX, y: state.gaze.y + lookY });
  const kickSignal = useSharedValue(0);
  const hornLag = useSharedValue(state.hornLag);
  const tailLag = useSharedValue(state.tailLag);

  /** Which eye, if either, is closed on its own right now. */
  const [winkSide, setWinkSide] = useState<'L' | 'R' | null>(null);

  const motion = useSharedValue<Motion>({
    roll: spring(0), tx: spring(0), ty: spring(0), sx: spring(1), sy: spring(1),
    lid: spring(1), eye: spring(1), gazeX: spring(0), gazeY: spring(0),
    horn: spring(0), tail: spring(0), wag: spring(0), arm: spring(0), pop: spring(1),
    pupil: spring(1), markX: spring(0), markY: spring(0), markR: spring(0),
    clock: 0, driftClock: 0,
    moodSeen: mood, kickSeen: 0,
    pose: { roll: 0, tx: 0, ty: 0, sx: 1, sy: 1, lid: 1, eyeScale: 1, lift: 0, shake: 0, arm: 0, tail: 0, pupilScale: 1, spark: 0 },
  });
  const out = useSharedValue<Rendered>({
    tx: 0, ty: 0, roll: 0, sx: 1, sy: 1, horn: 0, tail: 0,
    gx: 0, gy: 0, driftX: 0, driftY: 0, eye: 1, pupil: 1, lid: 1, lidRest: 1, pop: 1, drift: 0, float: 0,
    spark: 0, armL: 0, armR: 0, markX: 0, markY: 0, markRoll: 0,
  });

  useEffect(() => {
    moodRef.value = mood;
    hornLag.value = MASCOT_STATES[mood].hornLag;
    tailLag.value = MASCOT_STATES[mood].tailLag;
  }, [hornLag, mood, moodRef, tailLag]);

  useFrameCallback((frame) => {
    'worklet';
    if (frame.timeSincePreviousFrame == null) return;
    const dt = Math.min(frame.timeSincePreviousFrame / 1000, 0.1);
    const m = motion.value;
    const rest = reduceMotion;

    // The entry reset happens here rather than being zeroed from JS, for the same
    // reason as the beat: this object belongs to the worklet.
    if (moodRef.value !== m.moodSeen) {
      m.moodSeen = moodRef.value;
      m.pop.x = 0; m.pop.v = 0;
      m.driftClock = 0;
    }
    m.clock += rest ? 0 : dt;
    m.driftClock = rest ? 0 : (m.driftClock + dt * 1000) % DRIFT_MS;

    mascotPose(moodRef.value, m.clock, m.pose);
    const p = m.pose;

    m.roll.t = rest ? 0 : p.roll;
    m.tx.t = rest ? 0 : p.tx;
    m.ty.t = rest ? 0 : p.ty;
    m.sx.t = rest ? 1 : p.sx;
    m.sy.t = rest ? 1 : p.sy;
    m.lid.t = rest ? 1 : (lidOverride.value ?? p.lid);
    m.eye.t = rest ? 1 : p.eyeScale;
    m.pupil.t = rest ? 1 : p.pupilScale;
    m.markX.t = rest ? 0 : (m.tx.x + p.shake) * MARK_FOLLOW;
    m.markY.t = rest ? 0 : (m.ty.x - p.lift) * MARK_FOLLOW;
    m.markR.t = rest ? 0 : m.roll.x * MARK_ROLL;
    m.gazeX.t = rest ? 0 : gazeAim.value.x;
    m.gazeY.t = rest ? 0 : gazeAim.value.y;
    // The horns and tail chase the body's height on a looser, wobblier spring; what
    // is drawn is the gap between them, so they trail on the way up and overshoot
    // coming back down.
    const rise = m.ty.x - (rest ? 0 : p.lift);
    m.horn.t = rise;
    m.tail.t = rise;
    m.arm.t = rest ? 0 : p.arm;
    m.wag.t = rest ? 0 : p.tail;
    m.pop.t = 1;

    // A beat is a velocity impulse, so it kicks and settles instead of tweening. The
    // count is the number fired since the last frame, so two landing in one frame
    // still deliver two beats' worth.
    if (kickSignal.value !== m.kickSeen) {
      const beats = kickSignal.value - m.kickSeen;
      m.kickSeen = kickSignal.value;
      const beat = MASCOT_STATES[moodRef.value].beat;
      if (beat && !rest) {
        m.tx.v += beat.tx * beats;
        m.ty.v += beat.ty * beats;
        m.roll.v += beat.roll * beats;
        // The decorations restart their pop on the same impulse that moves the body.
        m.pop.x = 0; m.pop.v = 0;
      }
    }

    const steps = Math.max(1, Math.ceil(dt / SUBSTEP));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      step(m.roll, SPRING.roll[0], SPRING.roll[1], h);
      step(m.tx, SPRING.tx[0], SPRING.tx[1], h);
      step(m.ty, SPRING.ty[0], SPRING.ty[1], h);
      step(m.sx, SPRING.squash[0], SPRING.squash[1], h);
      step(m.sy, SPRING.squash[0], SPRING.squash[1], h);
      step(m.lid, SPRING.lid[0], SPRING.lid[1], h);
      step(m.eye, SPRING.eye[0], SPRING.eye[1], h);
      step(m.pupil, SPRING.eye[0], SPRING.eye[1], h);
      step(m.markX, SPRING.mark[0], SPRING.mark[1], h);
      step(m.markY, SPRING.mark[0], SPRING.mark[1], h);
      step(m.markR, SPRING.mark[0], SPRING.mark[1], h);
      step(m.gazeX, SPRING.gaze[0], SPRING.gaze[1], h);
      step(m.gazeY, SPRING.gaze[0], SPRING.gaze[1], h);
      step(m.horn, SPRING.lag[0], SPRING.lag[1], h);
      step(m.tail, SPRING.trail[0], SPRING.trail[1], h);
      step(m.arm, SPRING.arm[0], SPRING.arm[1], h);
      step(m.wag, SPRING.tail[0], SPRING.tail[1], h);
      step(m.pop, SPRING.pop[0], SPRING.pop[1], h);
    }

    const driftX = rest ? 0
      : Math.sin(m.clock * EYE_DRIFT.rx) * EYE_DRIFT.ax
        + Math.sin(m.clock * EYE_DRIFT.rx2) * EYE_DRIFT.bx;
    const driftY = rest ? 0 : Math.sin(m.clock * EYE_DRIFT.ry) * EYE_DRIFT.ay;

    out.value = {
      // The tremble rides on top of the sprung position, like the hop's lift and
      // lean: a spring at 3.5 rad/s cannot pass a 20 rad/s shiver.
      tx: (m.tx.x + (rest ? 0 : p.shake)) * box,
      // The hop's lift lands here rather than on the ty spring: a spring chasing it
      // would round off the launch and swallow the apex.
      ty: (m.ty.x - (rest ? 0 : p.lift)) * box,
      roll: m.roll.x,
      sx: m.sx.x, sy: m.sy.x,
      horn: rest ? 0 : (rise - m.horn.x) * hornLag.value * HORN_SWING,
      // Its own sway, plus how far it is still trailing the body's lean.
      tail: rest ? 0 : m.wag.x + (rise - m.tail.x) * tailLag.value * TAIL_SWING,
      // One raise, mirrored: the hands sit on opposite sides of the body, so the same
      // lift is a turn one way for one of them and the other way for the other.
      armL: m.arm.x, armR: -m.arm.x,
      gx: m.gazeX.x, gy: m.gazeY.x,
      driftX, driftY,
      eye: m.eye.x, pupil: m.pupil.x,
      lid: m.lid.x,
      lidRest: rest ? 1 : Math.max(p.lid, 0.08),
      pop: rest ? 1 : m.pop.x,
      drift: rest ? 0 : m.driftClock / DRIFT_MS,
      spark: rest ? 0 : p.spark,
      markX: m.markX.x * box, markY: m.markY.x * box, markRoll: m.markR.x,
      float: rest ? 0 : Math.sin(m.clock * 1.1),
    };
  }, true);

  const blink = useCallback((timers: ReturnType<typeof setTimeout>[]) => {
    const run = (offset: number) => {
      for (const key of BLINK_KEYS) {
        timers.push(setTimeout(() => { lidOverride.value = key.lid; }, offset + key.at));
      }
    };
    run(0);
    if (Math.random() < DOUBLE_BLINK_CHANCE) run(370);
  }, [lidOverride]);

  useEffect(() => {
    // Covering the eyes outranks the blink cadence: while it is held, nothing else
    // may open them.
    if (eyesShut) { lidOverride.value = 0.02; return; }
    const cadence = MASCOT_STATES[mood].blink;
    if (reduceMotion || calm || !cadence) { lidOverride.value = null; return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = () => {
      timers.push(setTimeout(() => { blink(timers); schedule(); }, randomMs(cadence)));
    };
    schedule();
    return () => { timers.forEach(clearTimeout); lidOverride.value = null; };
  }, [blink, calm, eyesShut, lidOverride, mood, reduceMotion]);

  useEffect(() => {
    if (!blinkSignal || reduceMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    blink(timers);
    return () => timers.forEach(clearTimeout);
  }, [blink, blinkSignal, reduceMotion]);

  // Expressions drift on their own, which is the difference between a character and
  // an illustration that happens to wobble. The change happens behind a blink: a
  // drawn face cannot be cross-faded into another drawn face without both being half
  // transparent at once, and swapping on an open eye pops.
  useEffect(() => {
    const hold = MASCOT_STATES[mood].frameHold;
    if (reduceMotion || calm || !drift || frames.length < 2 || !hold) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const schedule = () => {
      timers.push(setTimeout(() => {
        blink(timers);
        i = (i + 1) % frames.length;
        const next = frames[i];
        timers.push(setTimeout(() => setFace(next), SWAP_AT));
        schedule();
      }, randomMs(hold)));
    };
    schedule();
    return () => timers.forEach(clearTimeout);
  }, [blink, calm, drift, frames, mood, reduceMotion]);

  // A wink: one eye shut on its own interval, and never while the pair is blinking —
  // two overlapping closures read as a glitch, not as a wink.
  const winkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const cadence = MASCOT_STATES[mood].wink;
    setWinkSide(null);
    if (reduceMotion || calm || !cadence) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = () => {
      timers.push(setTimeout(() => {
        setWinkSide(Math.random() < 0.5 ? 'L' : 'R');
        timers.push(setTimeout(() => setWinkSide(null), WINK_MS));
        schedule();
      }, randomMs(cadence)));
    };
    schedule();
    return () => { timers.forEach(clearTimeout); setWinkSide(null); };
  }, [calm, mood, reduceMotion]);

  useEffect(() => {
    if (!winkSignal || reduceMotion) return;
    setWinkSide(Math.random() < 0.5 ? 'L' : 'R');
    winkTimer.current = setTimeout(() => setWinkSide(null), WINK_MS);
    return () => clearTimeout(winkTimer.current);
  }, [reduceMotion, winkSignal]);

  // Gaze: pick a place to look, hold it, pick another. The spring does the move.
  useEffect(() => {
    const aim = MASCOT_STATES[mood].gaze;
    gazeAim.value = { x: aim.x + lookX, y: aim.y + lookY };
    if (reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        gazeAim.value = {
          x: aim.x + lookX + (Math.random() * 2 - 1) * aim.wanderX,
          y: aim.y + lookY + (Math.random() * 2 - 1) * aim.wanderY,
        };
        schedule();
      }, randomMs(aim.hold));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [gazeAim, lookX, lookY, mood, reduceMotion]);

  useEffect(() => {
    const beat = MASCOT_STATES[mood].beat;
    if (reduceMotion || !beat) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => { kickSignal.value += 1; schedule(); }, randomMs(beat.every));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [kickSignal, mood, reduceMotion]);

  useEffect(() => {
    if (!beatSignal || reduceMotion) return;
    kickSignal.value += 1;
  }, [beatSignal, kickSignal, reduceMotion]);

  const ground = pivot(GROUND.x, GROUND.y, box);
  const staged = () => {
    'worklet';
    return {
      transform: [
        { translateX: out.value.tx }, { translateY: out.value.ty },
        { translateX: ground.dx }, { translateY: ground.dy },
        { rotate: `${out.value.roll + tilt}deg` },
        { scaleX: out.value.sx }, { scaleY: out.value.sy },
        { translateX: -ground.dx }, { translateY: -ground.dy },
      ],
    };
  };
  // Two of them rather than one style on two views: Reanimated asks for a style per
  // component, and the back half and the front half of the character move together
  // because they read the same frame, not because they share an object.
  const stage = useAnimatedStyle(staged);
  const stageFront = useAnimatedStyle(staged);

  const hornAt = art.horns.length
    ? pivot(centre(art.horns).x, art.horns[0].box[3], box) : { dx: 0, dy: 0 };
  const horns = useAnimatedStyle(() => ({
    transform: [
      { translateX: hornAt.dx }, { translateY: hornAt.dy },
      { rotate: `${out.value.horn}deg` },
      { translateX: -hornAt.dx }, { translateY: -hornAt.dy },
    ],
  }));
  const tailAt = art.tail.length
    ? pivot(start(art.tail[0]).x, start(art.tail[0]).y, box) : { dx: 0, dy: 0 };
  const tailOff = {
    x: (tailRest?.x ?? 0) / VIEW * box,
    y: (tailRest?.y ?? 0) / VIEW * box,
  };
  const tail = useAnimatedStyle(() => ({
    transform: [
      { translateX: tailOff.x }, { translateY: tailOff.y },
      { translateX: tailAt.dx }, { translateY: tailAt.dy },
      { rotate: `${out.value.tail}deg` },
      { translateX: -tailAt.dx }, { translateY: -tailAt.dy },
    ],
  }));

  // A hand turns about the body's middle, not about itself: it is a paw resting on
  // the outline, and what it does is slide along it.
  const bodyAt = art.body.length
    ? pivot(centre(art.body).x, centre(art.body).y, box) : { dx: 0, dy: 0 };
  // A screen's own correction to where a paw rests. The push is applied before the
  // turn, so the turn carries it round: push out along the paw's own radius, then
  // slide along the outline.
  const pushBy = (parts: FigmaPath[], units: number | undefined) => {
    if (!units || !parts.length || !art.body.length) return { x: 0, y: 0 };
    const c = centre(parts), b = centre(art.body);
    const dx = c.x - b.x, dy = c.y - b.y;
    const r = Math.hypot(dx, dy) || 1;
    return { x: (dx / r) * units / VIEW * box, y: (dy / r) * units / VIEW * box };
  };
  const pushL = pushBy(art.handL, handRest?.left?.out);
  const pushR = pushBy(art.handR, handRest?.right?.out);
  const turnL = handRest?.left?.turn ?? 0;
  const turnR = handRest?.right?.turn ?? 0;
  const handL = useAnimatedStyle(() => ({
    transform: [{ translateX: pushL.x }, { translateY: pushL.y },
      ...turnAbout(out.value.armL + turnL, bodyAt).transform],
  }));
  const handR = useAnimatedStyle(() => ({
    transform: [{ translateX: pushR.x }, { translateY: pushR.y },
      ...turnAbout(out.value.armR + turnR, bodyAt).transform],
  }));

  // An eye narrows rather than fading: a squint is a shape, not a transparency. It
  // scales about its own centre, which is also what carries the pupil's clip with it.
  const eyeAt = (side: 'L' | 'R') => {
    const white = art.white[side];
    if (!white) return { dx: 0, dy: 0 };
    const c = centre([white]);
    return pivot(c.x, c.y, box);
  };
  const atL = eyeAt('L');
  const atR = eyeAt('R');
  const openL = useAnimatedStyle(() => eyeTransform(out.value, atL, box));
  const openR = useAnimatedStyle(() => eyeTransform(out.value, atR, box));
  const mouth = useAnimatedStyle(() => ({
    transform: [
      { translateX: ((out.value.gx * GAZE_MOUTH.x + out.value.driftX) / VIEW) * box },
      { translateY: ((out.value.gy * GAZE_MOUTH.y + out.value.driftY) / VIEW) * box },
    ],
  }));
  const shut = useAnimatedStyle(() => ({
    opacity: out.value.lid < out.value.lidRest * LID_CLOSED ? 1 : 0,
  }));

  // An accent snaps out from nothing and overshoots; a z rises away and fades; a
  // question mark stays where it is and bobs.
  const TWINKLE = 0.11;
  const follow = (r: Rendered) => {
    'worklet';
    return [{ translateX: r.markX }, { translateY: r.markY },
      ...turnAbout(r.markRoll, art.accentAt, box).transform];
  };
  const popStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, out.value.pop) * 2),
    transform: [...follow(out.value),
      ...scaleAbout(Math.max(0, out.value.pop) * (1 + out.value.spark * TWINKLE),
        art.accentAt, box)],
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, out.value.pop) * 2),
    transform: scaleAbout(Math.max(0, out.value.pop), art.badgeAt, box),
  }));
  const twinkleStyle = useAnimatedStyle(() => ({
    transform: [...follow(out.value),
      ...scaleAbout(1 + out.value.spark * TWINKLE, art.accentAt, box)],
  }));
  const driftStyle = useAnimatedStyle(() => ({
    opacity: Math.sin(out.value.drift * Math.PI) ** 0.6,
    transform: [
      ...follow(out.value),
      { translateY: (-out.value.drift * DRIFT_RISE / VIEW) * box },
      ...scaleAbout(0.75 + out.value.drift * 0.35, art.accentAt, box),
    ],
  }));
  const floatStyle = useAnimatedStyle(() => ({
    transform: [
      ...follow(out.value),
      { translateY: (out.value.float * FLOAT_RISE / VIEW) * box },
      ...scaleAbout(1 + out.value.spark * TWINKLE, art.accentAt, box),
    ],
  }));
  const decorStyle = state.propMotion === 'drift' ? driftStyle
    : state.propMotion === 'float' ? floatStyle
      : state.propMotion === 'pop' ? popStyle : twinkleStyle;

  return (
    <View accessible={false} pointerEvents="box-none"
      style={[{ width: box }, behind ? null : { height: box }, style]}>
      <Animated.View pointerEvents="none" style={[behind ? styles.half : StyleSheet.absoluteFill, stage]}>
        <Layer box={box} parts={art.plate} />
        <Layer box={box} parts={art.horns} style={horns} />
        {/* Behind the body, where a tail belongs: it emerges from the silhouette
            rather than lying across it. Being back here costs it nothing — it is
            driven on its own clock either way. */}
        <Layer box={box} parts={art.tail} style={tail} />
        <Layer box={box} parts={art.body} />
      </Animated.View>
      {behind}
      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, behind ? styles.frontHalf : null, stageFront]}>
        <Layer box={box} parts={art.handL} style={handL} />
        <Layer box={box} parts={art.handR} style={handR} />

        {(['L', 'R'] as const).map((side) => {
          const white = art.white[side];
          const closed = art.closed[side];
          // A frame drawn with its eyes already shut — happy, sleepy, completed —
          // keeps its own arcs and never blinks or winks. There is nothing to open.
          if (!white) return closed ? <Layer key={side} box={box} parts={[closed]} /> : null;
          if (winkSide === side) return <Layer key={side} box={box} parts={[art.lid[side]]} />;
          return (
            <View key={side} style={StyleSheet.absoluteFill}>
              <OpenEye box={box} white={white} pupil={art.pupil[side]} align={art.align[side]}
                out={out} clipId={`${uid}-eye-${side}`} style={side === 'L' ? openL : openR} />
              <Layer box={box} parts={[art.lid[side]]} style={shut} />
            </View>
          );
        })}

        <Layer box={box} parts={art.mouth} style={mouth} />
        {/* The badge stays with the body: the character is holding it. */}
        <Layer box={box} parts={art.badge} style={badgeStyle} />
      </Animated.View>
      {/* Outside the stage on purpose. Accents, a question mark and sleeping z's are
          marks in the air next to a character, not parts of it, and inheriting its
          lean, its squash and its hop made them read as painted onto its back. They
          keep their own slow twinkle. */}
      <Layer box={box} parts={art.accents} style={decorStyle} />
    </View>
  );
}

/** When something is nested behind the character, the back half holds the box open
 * in the flow and the front half floats over whatever came next. */
const styles = StyleSheet.create({
  half: { width: '100%', aspectRatio: 1 },
  frontHalf: { bottom: undefined, aspectRatio: 1 },
});

/** An eye's narrowing and sizing, as one transform about its own centre. */
function eyeTransform(r: Rendered, at: { dx: number; dy: number }, box: number) {
  'worklet';
  const narrow = Math.min(LID_MAX, Math.max(0, r.lid));
  // The eye's own travel, in pixels. It carries the pupil's clip with it, so what the
  // pupil does next is measured against an eye that has already moved.
  const lx = ((r.gx * GAZE_EYE.x + r.driftX) / VIEW) * box;
  const ly = ((r.gy * GAZE_EYE.y + r.driftY) / VIEW) * box;
  return {
    opacity: r.lid < r.lidRest * LID_CLOSED ? 0 : 1,
    transform: [
      { translateX: at.dx + lx }, { translateY: at.dy + ly },
      { scaleX: r.eye }, { scaleY: r.eye * narrow },
      { translateX: -at.dx }, { translateY: -at.dy },
    ],
  };
}
function turnAbout(deg: number, at: { dx: number; dy: number }, box = 1) {
  'worklet';
  const dx = box === 1 ? at.dx : at.dx * box;
  const dy = box === 1 ? at.dy : at.dy * box;
  return {
    transform: [
      { translateX: dx }, { translateY: dy },
      { rotate: `${deg}deg` },
      { translateX: -dx }, { translateY: -dy },
    ],
  };
}
function scaleAbout(k: number, at: { dx: number; dy: number }, box: number) {
  'worklet';
  const dx = at.dx * box, dy = at.dy * box;
  return [
    { translateX: dx }, { translateY: dy },
    { scale: k },
    { translateX: -dx }, { translateY: -dy },
  ];
}

/** Sort a frame's paths into the layers that move together, once per frame rather
 * than once per render.
 *
 * Two frames go in, because only the face drifts. The primary carries the body, the
 * horns, the tail and the decorations; the face frame carries the eyes and the mouth.
 * The body geometry is identical across every frame of the set, so the seam that
 * ought to exist does not. */
function build(primary: MascotFrame, face: MascotFrame, hands: boolean, bare: boolean) {
  const base = MASCOT_ART[primary].parts;
  const front = MASCOT_ART[face].parts;
  const of = (src: FigmaPath[], ...names: MascotPartName[]) =>
    src.filter((p) => names.includes(p.name));
  const one = (src: FigmaPath[], name: MascotPartName) => src.find((p) => p.name === name);
  const white = { L: one(front, 'eyeWhiteL'), R: one(front, 'eyeWhiteR') };
  const closed = { L: one(front, 'eyeClosedL'), R: one(front, 'eyeClosedR') };
  const accents = bare ? [] : of(base, ...ACCENTS);
  const badge = bare ? [] : of(base, ...BADGE);
  // The borrowed lid is drawn where this frame's eye is, not where the sleeping face
  // wears it.
  const lid = { L: moveLid('eyeClosedL', white.L), R: moveLid('eyeClosedR', white.R) };
  return {
    plate: of(base, 'plate'),
    horns: of(base, 'horns'),
    tail: of(base, 'tail', 'tailTip'),
    body: of(base, 'body'),
    mouth: of(front, 'mouth'),
    // The hands come from the part library rather than from either frame, and only
    // when the state has said how it carries them.
    handL: hands ? MASCOT_HANDS.filter((p) => p.name === 'handL') : [],
    handR: hands ? MASCOT_HANDS.filter((p) => p.name === 'handR') : [],
    white, closed, lid,
    pupil: { L: one(front, 'pupilL'), R: one(front, 'pupilR') },
    align: alignPupils(white, { L: one(front, 'pupilL'), R: one(front, 'pupilR') }),
    accents, badge,
    accentAt: accents.length ? pivotOf(accents) : { dx: 0, dy: 0 },
    badgeAt: badge.length ? pivotOf(badge) : { dx: 0, dy: 0 },
  };
}
/** Move both pupils to the same resting place inside their whites, so a look sends
 * them the same way. What that place is comes from the drawing: the average of the
 * two, so the pair keeps the convergence it was given and loses only the difference
 * between them. */
function alignPupils(white: { L?: FigmaPath; R?: FigmaPath },
  pupil: { L?: FigmaPath; R?: FigmaPath }) {
  const rest = (side: 'L' | 'R') => {
    const w = white[side], p = pupil[side];
    if (!w || !p) return null;
    const wc = centre([w]), pc = centre([p]);
    return { x: pc.x - wc.x, y: pc.y - wc.y };
  };
  const l = rest('L'), r = rest('R');
  if (!l || !r) return { L: { x: 0, y: 0 }, R: { x: 0, y: 0 } };
  const mid = { x: (l.x + r.x) / 2, y: (l.y + r.y) / 2 };
  return { L: { x: mid.x - l.x, y: mid.y - l.y }, R: { x: mid.x - r.x, y: mid.y - r.y } };
}

/** Pivots are held as fractions here and scaled at use, so one build survives a
 * component rendered at two different widths. */
function pivotOf(parts: FigmaPath[]) {
  const c = centre(parts);
  return { dx: c.x / VIEW - 0.5, dy: c.y / VIEW - 0.5 };
}
function moveLid(name: MascotPartName, white?: FigmaPath): FigmaPath {
  const art = LID_ART.find((p) => p.name === name) ?? LID_ART[0];
  if (!white) return art;
  const dy = centre([white]).y - centre([art]).y;
  return { ...art, d: shiftY(art.d, dy), box: [art.box[0], art.box[1] + dy, art.box[2], art.box[3] + dy] };
}
/** Move a path down the page by rewriting every y in it. The export is absolute and
 * has no arcs, so each coordinate is a plain x y pair and the second of each is a y. */
function shiftY(d: string, dy: number) {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (n) => {
    i += 1;
    return i % 2 === 0 ? String(Math.round((Number(n) + dy) * 1000) / 1000) : n;
  });
}

export { ALL_MASCOT_MOODS, MASCOT_GROUPS, MASCOT_STATES } from './state';
export type { MascotMood } from './state';
