/** The mascot, drawn as a stack of rendered parts driven by springs.
 *
 * Nothing is keyframed. Every frame computes a *target* pose for the current state
 * and a damped spring per quantity chases it, so a state change needs no cross-fade
 * and a discrete accent is injected as velocity rather than tweened. What that used
 * to animate were vector paths; what it animates now are a dozen images, translated,
 * rotated and scaled. The medium changed, the model did not.
 *
 * Parts were rendered on one square canvas through one orthographic camera and then
 * cropped; `parts.ts` carries each crop as a fraction of that canvas. Drawing every
 * part at its own rectangle inside a square box reassembles the render at any size,
 * so nothing here multiplies by a pixel scale except the box itself.
 *
 * Three things this body can do that the outgoing one could not. Its ears are their
 * own parts, so they trail the head instead of being welded into one silhouette. Its
 * accents are their own parts, so they can pop on a beat instead of just sitting
 * there. And its four product moments are whole illustrations, so they drift as one.
 *
 * One thing it cannot: there is no face turn. The art is authored at a single fixed
 * three-quarter angle, which is what made the solid-of-revolution rebuild redundant.
 */
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  MASCOT_STATES, armRate, mascotPose,
  type EyeArtName, type MascotMood, type MascotPose,
} from './state';
import {
  MASCOT_ARM_VARIANTS, MASCOT_PARTS, MASCOT_REFERENCE_GAZE, MASCOT_THINKING_GAZE,
  type MascotPart, type MascotPartName,
} from './parts';

const AnimatedImage = Animated.createAnimatedComponent(Image);
/** Whatever the animated image accepts: a plain image style, or the handle a
 * `useAnimatedStyle` returns. Spelling it this way avoids casting at each call. */
type PartStyle = ComponentProps<typeof AnimatedImage>['style'];

/** Every eye shape exists as its own render per eye, so the two eyes are independent:
 * a wink is simply one side closed while the other stays open, which a piece of art
 * spanning both eyes cannot express at all. Pupils are never baked into these - gaze
 * moves a pupil inside its white every frame. */
const EYE_ART_PREFIX: Record<EyeArtName, string> = {
  open: 'eye_open', wide: 'eye_wide', focused: 'eye_focused', squeezed: 'eye_squeezed',
  sleepy: 'eye_sleepy', closed: 'eye_closed', glance: 'eye_glance', smile: 'eye_smile',
  half: 'eye_half', wink: 'eye_wink', arc: 'eye_arc',
};
/** The shapes that are an open eye, and so want a pupil drawn in them. */
const EYE_PUPILS: Record<EyeArtName, boolean> = {
  open: true, wide: true, focused: true, glance: true, smile: true, half: true,
  squeezed: false, sleepy: false, closed: false, wink: false, arc: false,
};
function eyePart(art: EyeArtName, side: 'L' | 'R'): MascotPartName {
  return `${EYE_ART_PREFIX[art]}_${side}` as MascotPartName;
}

/** [frequency, damping] per quantity. Under-damped squash is what makes a clay body
 * read as soft; a stiff lid makes a blink snap; a loose ear trails and wobbles. */
const SPRING = {
  roll: [5, 0.9], tx: [3.5, 1], ty: [4, 1], squash: [9, 0.72],
  lid: [26, 1], eye: [9, 0.85], gaze: [13, 1], arm: [6, 0.75],
  ear: [7.5, 0.5], pop: [12, 0.52],
} as const;
const SUBSTEP = 1 / 120;

const BLINK_KEYS = [
  { at: 0, lid: 0.05 }, { at: 85, lid: 0.05 }, { at: 170, lid: 1.08 }, { at: 320, lid: null },
] as const;
const DOUBLE_BLINK_CHANCE = 0.14;
/** How long one eye stays shut in a wink. Longer than a blink, which is the whole
 * difference: a blink is involuntary and a wink is addressed to someone. */
const WINK_MS = 420;

/** Idle drift of the pupils, in canvas fractions. */
const EYE_DRIFT = { ax: 0.0022, rx: 0.47, bx: 0.0008, rx2: 1.13, ay: 0.0014, ry: 0.63 } as const;
/** How far the pupils travel for a full unit of gaze. */
const GAZE_REACH = { x: 0.013, y: 0.010 } as const;
/** Where the character meets the ground. Squash pivots here, not at the centre, or
 * the body sinks into the floor as it compresses. */
const GROUND = { x: 0.5, y: 0.9 } as const;
/** Blink frame thresholds, as fractions of the state's *own* resting lid. A state
 * that sits half-lidded is squinting, not blinking, and must not be stuck in the
 * half-blink frame merely for resting below an absolute number. */
const LID_CLOSED = 0.42;
const LID_HALF = 0.78;
/** How far the trailing ear and tail angles are amplified before they are drawn. */
const EAR_SWING = 2.4;
const TAIL_SWING = 3.2;
/** One rise of a drifting prop: how long it takes and how far it travels. */
const DRIFT_MS = 2600;
const DRIFT_RISE = 0.05;
/** How much the shadow shrinks and fades per unit of lift. */
const SHADOW_FALLOFF = 9;
/** The arms render in front of the torso now, so a swing is visible without having to
 * clear the silhouette. It is still scaled back: the arm meets a modelled shoulder and
 * a large rotation walks the join off the body. */
const ARM_GAIN = 0.45;

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

interface Motion {
  roll: Spring; tx: Spring; ty: Spring; sx: Spring; sy: Spring;
  lid: Spring; eyeScale: Spring; gazeX: Spring; gazeY: Spring;
  morph: Spring; armL: Spring; armR: Spring; ear: Spring; tail: Spring; pop: Spring;
  clock: number; armClock: number; driftClock: number;
  /** Everything crossing from JS arrives as a counter this worklet compares against,
   * never as a field JS writes into this object: writing into an object already handed
   * to a worklet is unsupported and silently unreliable. */
  moodSeen: MascotMood; kickSeen: number; morphSeen: number;
  pose: MascotPose;
}
interface Rendered {
  tx: number; ty: number; roll: number; sx: number; sy: number;
  armL: number; armR: number; ear: number; tail: number;
  legL: number; legR: number;
  gx: number; gy: number;
  esx: number; esy: number;
  morph: number;
  /** Where the lid is now, and where this state rests it. */
  lid: number; lidRest: number;
  lift: number;
  /** Scale of a popping prop, and rise/fade position of a drifting one. */
  pop: number; drift: number;
}

function partStyle(part: MascotPart, box: number) {
  const [x, y, w, h] = part.rect;
  return { position: 'absolute' as const, left: x * box, top: y * box, width: w * box, height: h * box };
}
/** Offset from a part's own centre to its pivot: what a rotation about the pivot has
 * to translate by, since a transform turns about the centre. */
function pivotOffset(part: MascotPart, box: number) {
  const [x, y, w, h] = part.rect;
  const p = part.pivot ?? [x + w / 2, y + h / 2];
  return { dx: (p[0] - (x + w / 2)) * box, dy: (p[1] - (y + h / 2)) * box };
}

function Part({ name, box, style }: { name: MascotPartName; box: number; style?: PartStyle }) {
  const part = MASCOT_PARTS[name];
  return <AnimatedImage source={part.src} style={[partStyle(part, box), style]} />;
}

/** A part that turns about the point where it meets the body: an arm at its shoulder,
 * an ear at its root. */
function Hinged({ name, box, out, angle }: {
  name: MascotPartName; box: number; out: SharedValue<Rendered>;
  /** Names the field to read rather than being a function that reads it: a plain
   * callback cannot be called from the UI runtime, and passing one throws on the
   * first frame with "Tried to synchronously call a Remote Function". */
  angle: 'armL' | 'armR' | 'ear' | 'tail' | 'legL' | 'legR';
}) {
  const part = MASCOT_PARTS[name];
  const { dx, dy } = pivotOffset(part, box);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: dx }, { translateY: dy },
      { rotate: `${out.value[angle]}deg` },
      { translateX: -dx }, { translateY: -dy },
    ],
  }));
  return <AnimatedImage source={part.src} style={[partStyle(part, box), style]} />;
}

export function MascotCharacter({ width, mood = 'idle', blinkSignal = 0, beatSignal = 0, style }: {
  width: number;
  mood?: MascotMood;
  /** Increment to blink right now, regardless of the state's cadence. */
  blinkSignal?: number;
  /** Increment to fire the state's beat right now. */
  beatSignal?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = width;
  const reduceMotion = useReducedMotion();
  const state = MASCOT_STATES[mood];

  const moodRef = useSharedValue<MascotMood>(mood);
  const lidOverride = useSharedValue<number | null>(null);
  const gazeAim = useSharedValue({ x: state.gaze.x, y: state.gaze.y });
  const kickSignal = useSharedValue(0);
  const morphSignal = useSharedValue(0);
  const earLag = useSharedValue(state.earLag);
  const tailLag = useSharedValue(state.tailLag);

  const first = Array.isArray(state.eyes) ? state.eyes[0] : state.eyes;
  const [eyePair, setEyePair] = useState<{ from: EyeArtName; to: EyeArtName }>(
    () => ({ from: first, to: first }),
  );
  const eyeIndex = useRef(0);
  /** Which eye, if either, is closed on its own right now. */
  const [winkSide, setWinkSide] = useState<'L' | 'R' | null>(null);

  const motion = useSharedValue<Motion>({
    roll: spring(0), tx: spring(0), ty: spring(0), sx: spring(1), sy: spring(1),
    lid: spring(1), eyeScale: spring(1), gazeX: spring(0), gazeY: spring(0),
    morph: spring(1), armL: spring(0), armR: spring(0),
    ear: spring(0), tail: spring(0), pop: spring(1),
    clock: 0, armClock: 0, driftClock: 0,
    moodSeen: mood, kickSeen: 0, morphSeen: 0,
    pose: { roll: 0, tx: 0, ty: 0, sx: 1, sy: 1, lid: 1, eyeScale: 1, arm: 0, armSwing: 0, splay: 0, lift: 0 },
  });
  const out = useSharedValue<Rendered>({
    tx: 0, ty: 0, roll: 0, sx: 1, sy: 1, armL: 0, armR: 0, ear: 0, tail: 0, legL: 0, legR: 0,
    gx: 0, gy: 0, esx: 1, esy: 1, morph: 1, lid: 1, lidRest: 1, lift: 0, pop: 1, drift: 0,
  });

  useEffect(() => {
    moodRef.value = mood;
    eyeIndex.current = 0;
    earLag.value = MASCOT_STATES[mood].earLag;
    tailLag.value = MASCOT_STATES[mood].tailLag;
  }, [earLag, mood, moodRef, tailLag]);

  useEffect(() => { morphSignal.value += 1; }, [eyePair.to, morphSignal]);

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
    m.armClock += rest ? 0 : dt * armRate(moodRef.value);
    m.driftClock = rest ? 0 : (m.driftClock + dt * 1000) % DRIFT_MS;

    mascotPose(moodRef.value, m.clock, m.pose);
    const p = m.pose;

    m.roll.t = rest ? 0 : p.roll;
    m.tx.t = rest ? 0 : p.tx;
    m.ty.t = rest ? 0 : p.ty;
    m.sx.t = rest ? 1 : p.sx;
    m.sy.t = rest ? 1 : p.sy;
    m.lid.t = rest ? 1 : (lidOverride.value ?? p.lid);
    m.eyeScale.t = rest ? 1 : p.eyeScale;
    m.gazeX.t = rest ? 0 : gazeAim.value.x;
    m.gazeY.t = rest ? 0 : gazeAim.value.y;
    // The ear chases the body's lean on a looser, wobblier spring; what is drawn is
    // the gap between them, so an ear trails on the way out and overshoots coming back.
    m.ear.t = m.roll.x;
    m.tail.t = m.roll.x;
    m.pop.t = 1;
    m.morph.t = 1;
    if (morphSignal.value !== m.morphSeen) {
      m.morphSeen = morphSignal.value;
      m.morph.x = 0; m.morph.v = 0;
    }

    const swing = rest ? 0 : wave(m.armClock, 1, 0) * p.armSwing;
    m.armL.t = rest ? 0 : -(p.arm + swing) * ARM_GAIN;
    m.armR.t = rest ? 0 : (p.arm - swing) * ARM_GAIN;

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
        // The accents restart their pop on the same impulse that moves the body.
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
      step(m.eyeScale, SPRING.eye[0], SPRING.eye[1], h);
      step(m.gazeX, SPRING.gaze[0], SPRING.gaze[1], h);
      step(m.gazeY, SPRING.gaze[0], SPRING.gaze[1], h);
      step(m.morph, SPRING.eye[0], SPRING.eye[1], h);
      step(m.armL, SPRING.arm[0], SPRING.arm[1], h);
      step(m.armR, SPRING.arm[0], SPRING.arm[1], h);
      step(m.ear, SPRING.ear[0], SPRING.ear[1], h);
      step(m.tail, SPRING.ear[0], SPRING.ear[1], h);
      step(m.pop, SPRING.pop[0], SPRING.pop[1], h);
    }

    const driftX = rest ? 0
      : Math.sin(m.clock * EYE_DRIFT.rx) * EYE_DRIFT.ax
        + Math.sin(m.clock * EYE_DRIFT.rx2) * EYE_DRIFT.bx;
    const driftY = rest ? 0 : Math.sin(m.clock * EYE_DRIFT.ry) * EYE_DRIFT.ay;

    out.value = {
      tx: m.tx.x * box,
      // The hop's lift lands here rather than on the ty spring: a spring chasing it
      // would round off the launch and swallow the apex.
      ty: (m.ty.x - (rest ? 0 : p.lift)) * box,
      roll: m.roll.x,
      sx: m.sx.x, sy: m.sy.x,
      armL: m.armL.x, armR: m.armR.x,
      ear: rest ? 0 : (m.roll.x - m.ear.x) * earLag.value * EAR_SWING,
      tail: rest ? 0 : (m.roll.x - m.tail.x) * tailLag.value * TAIL_SWING,
      // The legs follow the trajectory, not a spring: they are weightless in the air
      // and the moment they are under the body again they have to be straight.
      legL: rest ? 0 : -p.splay,
      legR: rest ? 0 : p.splay,
      gx: (m.gazeX.x * GAZE_REACH.x + driftX) * box,
      gy: (m.gazeY.x * GAZE_REACH.y + driftY) * box,
      esx: m.eyeScale.x, esy: m.eyeScale.x,
      morph: Math.min(1, Math.max(0, m.morph.x)),
      lid: m.lid.x,
      lidRest: rest ? 1 : Math.max(p.lid, 0.08),
      lift: rest ? 0 : p.lift,
      pop: rest ? 1 : m.pop.x,
      drift: rest ? 0 : m.driftClock / DRIFT_MS,
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
    const cadence = MASCOT_STATES[mood].blink;
    if (reduceMotion || !cadence) { lidOverride.value = null; return; }
    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = () => {
      timers.push(setTimeout(() => { blink(timers); schedule(); }, randomMs(cadence)));
    };
    schedule();
    return () => { timers.forEach(clearTimeout); lidOverride.value = null; };
  }, [blink, lidOverride, mood, reduceMotion]);

  useEffect(() => {
    if (!blinkSignal || reduceMotion) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    blink(timers);
    return () => timers.forEach(clearTimeout);
  }, [blink, blinkSignal, reduceMotion]);

  // Eye art: a state with more than one piece cycles, holding each for its own span.
  useEffect(() => {
    const s = MASCOT_STATES[mood];
    const list = Array.isArray(s.eyes) ? s.eyes : [s.eyes];
    setEyePair((prev) => ({ from: prev.to, to: list[0] }));
    const hold = s.eyeHold;
    if (reduceMotion || list.length < 2 || !hold) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        eyeIndex.current = (eyeIndex.current + 1) % list.length;
        setEyePair((prev) => ({ from: prev.to, to: list[eyeIndex.current] }));
        next();
      }, randomMs(hold));
    };
    next();
    return () => clearTimeout(timer);
  }, [mood, reduceMotion]);

  // A wink: one eye shut on its own interval, and never while the pair is blinking —
  // two overlapping closures read as a glitch, not as a wink.
  useEffect(() => {
    const cadence = MASCOT_STATES[mood].wink;
    setWinkSide(null);
    if (reduceMotion || !cadence) return;
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
  }, [mood, reduceMotion]);

  // Gaze: pick a place to look, hold it, pick another. The spring does the move.
  useEffect(() => {
    const aim = MASCOT_STATES[mood].gaze;
    gazeAim.value = { x: aim.x, y: aim.y };
    if (reduceMotion) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        gazeAim.value = {
          x: aim.x + (Math.random() * 2 - 1) * aim.wanderX,
          y: aim.y + (Math.random() * 2 - 1) * aim.wanderY,
        };
        schedule();
      }, randomMs(aim.hold));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [gazeAim, mood, reduceMotion]);

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

  const groundDX = (GROUND.x - 0.5) * box;
  const groundDY = (GROUND.y - 0.5) * box;
  const stage = useAnimatedStyle(() => ({
    transform: [
      { translateX: out.value.tx }, { translateY: out.value.ty },
      { translateX: groundDX }, { translateY: groundDY },
      { rotate: `${out.value.roll}deg` },
      { scaleX: out.value.sx }, { scaleY: out.value.sy },
      { translateX: -groundDX }, { translateY: -groundDY },
    ],
  }));
  const shadow = useAnimatedStyle(() => {
    const k = Math.max(0.2, 1 - out.value.lift * SHADOW_FALLOFF);
    return { opacity: 0.55 * k, transform: [{ scaleX: k }, { scaleY: k }] };
  });
  // The lid narrows the eye rather than fading it: a squint is a shape, not a
  // transparency. Clamped so a very low resting lid never collapses it to a line.
  const eyeGroup = useAnimatedStyle(() => {
    const narrow = Math.min(1.15, Math.max(0.45, out.value.lid));
    return { transform: [{ scaleX: out.value.esx }, { scaleY: out.value.esy * narrow }] };
  });
  const baseGaze = mood === 'thinking' ? MASCOT_THINKING_GAZE : MASCOT_REFERENCE_GAZE;
  const baseL = { x: baseGaze.pupil_L[0] * box, y: baseGaze.pupil_L[1] * box };
  const baseR = { x: baseGaze.pupil_R[0] * box, y: baseGaze.pupil_R[1] * box };
  const pupilL = useAnimatedStyle(() => ({
    transform: [
      { translateX: baseL.x + out.value.gx }, { translateY: baseL.y + out.value.gy },
    ],
  }));
  const pupilR = useAnimatedStyle(() => ({
    transform: [
      { translateX: baseR.x + out.value.gx }, { translateY: baseR.y + out.value.gy },
    ],
  }));
  const openEyes = useAnimatedStyle(() => ({
    opacity: out.value.lid >= out.value.lidRest * LID_HALF ? 1 : 0,
  }));
  const halfEyes = useAnimatedStyle(() => {
    const r = out.value.lidRest;
    return { opacity: out.value.lid < r * LID_HALF && out.value.lid >= r * LID_CLOSED ? 1 : 0 };
  });
  const shutEyes = useAnimatedStyle(() => ({
    opacity: out.value.lid < out.value.lidRest * LID_CLOSED ? 1 : 0,
  }));
  // A frame swap, not a dissolve. Two opaque pieces cross-faded at 50/50 are both
  // half transparent at once, and the body shows through. Cut-out animation cuts; the
  // morph spring still supplies the timing and the scale springs still carry the eye
  // into and out of the cut.
  const fromArt = useAnimatedStyle(() => ({ opacity: out.value.morph < 0.5 ? 1 : 0 }));
  const toArt = useAnimatedStyle(() => ({ opacity: out.value.morph < 0.5 ? 0 : 1 }));
  // An accent snaps out from nothing and overshoots; a Z rises away and fades.
  const popProp = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, out.value.pop) * 2),
    transform: [{ scale: Math.max(0, out.value.pop) }],
  }));
  const driftProp = useAnimatedStyle(() => ({
    opacity: Math.sin(out.value.drift * Math.PI) ** 0.6,
    transform: [
      { translateY: -out.value.drift * DRIFT_RISE * box },
      { scale: 0.75 + out.value.drift * 0.35 },
    ],
  }));

  const propStyle = state.propMotion === 'drift' ? driftProp
    : state.propMotion === 'pop' ? popProp : undefined;

  // A product moment is one illustration, so it drifts, leans and breathes as a unit
  // and nothing inside it is articulated.
  if (state.scene) {
    return (
      <View accessible={false} pointerEvents="none" style={[{ width: box, height: box }, style]}>
        <Animated.View style={[StyleSheet.absoluteFill, stage]}>
          <Part name={state.scene} box={box} />
        </Animated.View>
      </View>
    );
  }

  // Reaching swaps the torso layer for the composite that has the palm joined to it,
  // and the neutral arm on that side is dropped so the two do not overlap.
  const reach = state.reach;
  const torso: MascotPartName = reach === 'L' ? MASCOT_ARM_VARIANTS.thinking.bodyLeft
    : reach === 'R' ? MASCOT_ARM_VARIANTS.thinking.bodyRight
      : 'body_feet';
  // A hop needs the legs apart from the torso so they can swing out at the apex; the
  // joined layer has them modelled standing, which is right for everything else.
  const freeLegs = !!state.hop && !reach;

  return (
    <View accessible={false} pointerEvents="none" style={[{ width: box, height: box }, style]}>
      <Part name="shadow" box={box} style={shadow} />
      <Animated.View style={[StyleSheet.absoluteFill, stage]}>
        <Hinged name="tail" box={box} out={out} angle="tail" />
        <Hinged name="ear_L" box={box} out={out} angle="ear" />
        <Hinged name="ear_R" box={box} out={out} angle="ear" />
        {freeLegs && <Hinged name="foot_L" box={box} out={out} angle="legL" />}
        {freeLegs && <Hinged name="foot_R" box={box} out={out} angle="legR" />}
        <Part name={freeLegs ? 'body' : torso} box={box} />
        {reach !== 'L' && <Hinged name="arm_L" box={box} out={out} angle="armL" />}
        {reach !== 'R' && <Hinged name="arm_R" box={box} out={out} angle="armR" />}

        <Animated.View style={[StyleSheet.absoluteFill, eyeGroup]}>
          <Animated.View style={[StyleSheet.absoluteFill, openEyes]}>
            <Animated.View style={[StyleSheet.absoluteFill, fromArt]}>
              <Eye art={winkSide === 'L' ? 'wink' : eyePair.from} side="L" box={box} pupil={pupilL} />
              <Eye art={winkSide === 'R' ? 'wink' : eyePair.from} side="R" box={box} pupil={pupilR} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, toArt]}>
              <Eye art={winkSide === 'L' ? 'wink' : eyePair.to} side="L" box={box} pupil={pupilL} />
              <Eye art={winkSide === 'R' ? 'wink' : eyePair.to} side="R" box={box} pupil={pupilR} />
            </Animated.View>
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, halfEyes]}>
            <Eye art="half" side="L" box={box} pupil={pupilL} />
            <Eye art="half" side="R" box={box} pupil={pupilR} />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, shutEyes]}>
            <Part name="eye_closed_L" box={box} />
            <Part name="eye_closed_R" box={box} />
          </Animated.View>
        </Animated.View>

        <Part name={state.mouth} box={box} />
        {state.prop && <Part name={state.prop} box={box} style={propStyle} />}
      </Animated.View>
    </View>
  );
}

/** One eye: its own shape, and its own pupil if that shape is an open one. */
function Eye({ art, side, box, pupil }: {
  art: EyeArtName; side: 'L' | 'R'; box: number; pupil: PartStyle;
}) {
  return (
    <>
      <Part name={eyePart(art, side)} box={box} />
      {EYE_PUPILS[art] && <Part name={side === 'L' ? 'pupil_L' : 'pupil_R'} box={box} style={pupil} />}
    </>
  );
}

export { ALL_MASCOT_MOODS, MASCOT_GROUPS, MASCOT_STATES } from './state';
export type { MascotMood } from './state';
