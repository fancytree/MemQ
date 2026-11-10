/** The mascot, drawn as a stack of rendered parts driven by the existing motion model.
 *
 * The renderer changed; the model did not. Every frame still computes a *target* pose
 * for the current state and a damped spring per quantity chases it, so a state change
 * needs no cross-fade and a one-off beat is injected as velocity. What used to be
 * vector paths redrawn each frame is now a dozen images translated, rotated and
 * scaled — which is the same animation, expressed in the medium the art arrived in.
 *
 * Parts were rendered on one square canvas through one orthographic camera and then
 * cropped; `parts.ts` carries each crop as a fraction of that canvas. Drawing every
 * part at its own rectangle inside a square box reassembles the render at any size,
 * so nothing here multiplies by a pixel scale except the box itself.
 *
 * Two things the polygon character could do are gone on purpose. There is no face
 * turn: the design is authored at one fixed three-quarter angle, so the body no
 * longer has to be rebuilt as a solid of revolution. And an eye no longer morphs
 * vertex by vertex — rendered art cannot be interpolated, so the morph spring now
 * cross-fades between two pieces of art instead, which keeps its timing.
 */
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import {
  BEAT, BLINK_EVERY, EYE_HOLD, EYE_PLAYLIST, GAZE, poseFor,
  type InklingMood, type PoseOut,
} from '../inkling/pose';
import type { EyeName } from '../inkling/eye';
import { MASCOT_PARTS, type MascotPart, type MascotPartName } from './parts';
import { BLINK_ART, EYE_ART, LID_CLOSED, LID_HALF, MOUTH, PROP, REACH_ARM } from './face';

const AnimatedImage = Animated.createAnimatedComponent(Image);
/** Whatever the animated image accepts: a plain image style, or the handle a
 * `useAnimatedStyle` returns. Spelling it this way avoids casting at each call. */
type PartStyle = ComponentProps<typeof AnimatedImage>['style'];

/** [frequency, damping] per quantity, carried over unchanged from the polygon
 * character: these were tuned against the motion, not against the drawing. */
const SPRING = {
  roll: [5, 0.9], tx: [3.5, 1], ty: [4, 1], squash: [10, 0.8],
  lid: [26, 1], eye: [9, 0.85], gaze: [13, 1], arm: [6, 0.75],
} as const;
const SUBSTEP = 1 / 120;

const BLINK_KEYS = [
  { at: 0, lid: 0.05 }, { at: 85, lid: 0.05 }, { at: 170, lid: 1.08 }, { at: 320, lid: null },
] as const;
const DOUBLE_BLINK_CHANCE = 0.14;

/** Per-eye idle drift, in canvas fractions. A single gaze spring moves both pupils
 * identically, and a pair of eyes that moves identically reads as a printed sticker. */
const EYE_DRIFT = { ax: 0.0022, rx: 0.47, bx: 0.0008, rx2: 1.13, ay: 0.0014, ry: 0.63 } as const;
/** How far the pupils travel for a full unit of gaze, as a fraction of the canvas. */
const GAZE_REACH = { x: 0.013, y: 0.010 } as const;
/** Where the character meets the ground. Squash pivots here, not at the centre, or
 * the body sinks into the floor as it compresses. */
const GROUND = { x: 0.5, y: 0.9 } as const;
/** The polygon character worked in a 192-unit viewBox; its pose numbers are in those
 * units, and this canvas is normalised, so translations convert through this. */
const POSE_UNIT = 1 / 192;
/** The resting arm is modelled in place and reads as part of the silhouette, so any
 * rotation lifts it out of its socket and opens a seam where the two renders no longer
 * agree. It therefore takes only a fraction of the state's arm angle — enough to carry
 * the rhythm, not enough to break the join. The reaching art is drawn in front of the
 * body and is meant to be clear of it, so it takes the angle in full. */
const ARM_GAIN = { rest: 0.3, reach: 1 } as const;
/** How much the shadow shrinks and fades per unit of lift. */
const SHADOW_FALLOFF = 0.055;

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
  esx: Spring; esy: Spring; edy: Spring; morph: Spring;
  armL: Spring; armR: Spring;
  clock: number; armClock: number; enteredAt: number;
  /** Everything crossing from JS arrives as a counter this worklet compares against,
   * never as a field JS writes into this object: that is unsupported and silently
   * unreliable once the object has been handed to a worklet. */
  moodSeen: InklingMood; kickSeen: number; morphSeen: number;
  pose: PoseOut;
}
interface Rendered {
  tx: number; ty: number; roll: number; sx: number; sy: number;
  armL: number; armR: number;
  gx: number; gy: number;
  esx: number; esy: number; edy: number;
  /** Cross-fade position between the outgoing and incoming eye art. */
  morph: number;
  /** Where the lid is now, and where this state rests it. A blink is a dip below the
   * state's own resting lid, so the blink frames are chosen against `lidRest` rather
   * than against fixed numbers: a state that sits half-lidded all day would otherwise
   * look like it was caught mid-blink forever. */
  lid: number; lidRest: number;
  lift: number;
}

/** One part, placed at its own rectangle inside the square box. */
function partStyle(part: MascotPart, box: number) {
  const [x, y, w, h] = part.rect;
  return { position: 'absolute' as const, left: x * box, top: y * box, width: w * box, height: h * box };
}
/** Offset from a part's own centre to its pivot, in pixels — what a rotation about
 * the pivot has to translate by, since a transform turns about the centre. */
function pivotOffset(part: MascotPart, box: number) {
  const [x, y, w, h] = part.rect;
  const p = part.pivot ?? [x + w / 2, y + h / 2];
  return { dx: (p[0] - (x + w / 2)) * box, dy: (p[1] - (y + h / 2)) * box };
}

function Part({ name, box, style }: {
  name: MascotPartName; box: number; style?: PartStyle;
}) {
  const part = MASCOT_PARTS[name];
  return <AnimatedImage source={part.src} style={[partStyle(part, box), style]} />;
}

/** An arm turns about the point where it meets the body. */
function Arm({ name, box, out, side }: {
  name: MascotPartName; box: number; out: SharedValue<Rendered>; side: 'L' | 'R';
}) {
  const part = MASCOT_PARTS[name];
  const { dx, dy } = pivotOffset(part, box);
  const style = useAnimatedStyle(() => {
    const deg = side === 'L' ? out.value.armL : out.value.armR;
    return {
      transform: [
        { translateX: dx }, { translateY: dy },
        { rotate: `${deg}deg` },
        { translateX: -dx }, { translateY: -dy },
      ],
    };
  });
  return <AnimatedImage source={part.src} style={[partStyle(part, box), style]} />;
}

export function MascotCharacter({ width, mood = 'idle', blinkSignal = 0, beatSignal = 0, style }: {
  width: number;
  mood?: InklingMood;
  /** Increment to blink right now, regardless of the state's cadence. */
  blinkSignal?: number;
  /** Increment to fire the state's beat right now. */
  beatSignal?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = width;
  const reduceMotion = useReducedMotion();

  const moodRef = useSharedValue<InklingMood>(mood);
  const lidOverride = useSharedValue<number | null>(null);
  const gazeAim = useSharedValue({ x: GAZE[mood].x, y: GAZE[mood].y });
  const kickSignal = useSharedValue(0);
  const morphSignal = useSharedValue(0);
  const armGain = useSharedValue<number>(ARM_GAIN.rest);
  /** The art the eyes are leaving and the art they are arriving at. These change the
   * tree, so they are React state rather than shared values. */
  const [eyePair, setEyePair] = useState<{ from: EyeName; to: EyeName }>(
    () => ({ from: EYE_PLAYLIST[mood][0], to: EYE_PLAYLIST[mood][0] }),
  );
  const eyeIndex = useRef(0);

  const motion = useSharedValue<Motion>({
    roll: spring(0), tx: spring(0), ty: spring(0), sx: spring(1), sy: spring(1),
    lid: spring(1), eyeScale: spring(1), gazeX: spring(0), gazeY: spring(0),
    esx: spring(1), esy: spring(1), edy: spring(0), morph: spring(1),
    armL: spring(0), armR: spring(0),
    clock: 0, armClock: 0, enteredAt: 0,
    moodSeen: mood, kickSeen: 0, morphSeen: 0,
    pose: { roll: 0, tx: 0, ty: 0, sx: 1, sy: 1, lid: 1, eyeScale: 1, arm: 0, armSwing: 0, armRate: 1, lift: 0 },
  });
  const out = useSharedValue<Rendered>({
    tx: 0, ty: 0, roll: 0, sx: 1, sy: 1, armL: 0, armR: 0,
    gx: 0, gy: 0, esx: 1, esy: 1, edy: 0, morph: 1, lid: 1, lidRest: 1, lift: 0,
  });

  useEffect(() => {
    moodRef.value = mood;
    eyeIndex.current = 0;
    armGain.value = REACH_ARM[mood] ? ARM_GAIN.reach : ARM_GAIN.rest;
  }, [armGain, mood, moodRef]);

  /** The art the incoming eye shape resolves to, read on the UI thread for the scale
   * and offset that go with it. Kept in a shared value so the worklet never touches
   * React state. */
  const eyeTarget = useSharedValue(EYE_ART[eyePair.to]);
  useEffect(() => {
    eyeTarget.value = EYE_ART[eyePair.to];
    morphSignal.value += 1;
  }, [eyePair.to, eyeTarget, morphSignal]);

  useFrameCallback((frame) => {
    'worklet';
    if (frame.timeSincePreviousFrame == null) return;
    const dt = Math.min(frame.timeSincePreviousFrame / 1000, 0.1);
    const m = motion.value;
    const rest = reduceMotion;

    if (moodRef.value !== m.moodSeen) { m.moodSeen = moodRef.value; m.enteredAt = 0; }
    m.enteredAt += dt;
    m.clock += rest ? 0 : dt;

    poseFor(moodRef.value, m.clock, m.enteredAt, m.pose);
    const p = m.pose;
    m.armClock += rest ? 0 : dt * p.armRate;

    m.roll.t = rest ? 0 : p.roll;
    m.tx.t = rest ? 0 : p.tx;
    m.ty.t = rest ? 0 : p.ty;
    m.sx.t = rest ? 1 : p.sx;
    m.sy.t = rest ? 1 : p.sy;
    m.lid.t = rest ? 1 : (lidOverride.value ?? p.lid);
    m.eyeScale.t = rest ? 1 : p.eyeScale;
    m.gazeX.t = rest ? 0 : gazeAim.value.x;
    m.gazeY.t = rest ? 0 : gazeAim.value.y;

    const art = eyeTarget.value;
    if (morphSignal.value !== m.morphSeen) { m.morphSeen = morphSignal.value; m.morph.x = 0; m.morph.v = 0; }
    m.morph.t = 1;
    m.esx.t = rest ? 1 : art.sx;
    m.esy.t = rest ? 1 : art.sy;
    m.edy.t = rest ? 0 : art.dy;

    const swing = rest ? 0 : wave(m.armClock, 0.67, 0) * p.armSwing;
    const gain = armGain.value;
    m.armL.t = rest ? 0 : -(p.arm + swing) * gain;
    m.armR.t = rest ? 0 : (p.arm - swing) * gain;

    if (kickSignal.value !== m.kickSeen) {
      const beats = kickSignal.value - m.kickSeen;
      m.kickSeen = kickSignal.value;
      const beat = BEAT[moodRef.value];
      if (beat && !rest) {
        m.tx.v += beat.tx * beats;
        m.ty.v += beat.ty * beats;
        m.roll.v += beat.roll * beats;
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
      step(m.esx, SPRING.eye[0], SPRING.eye[1], h);
      step(m.esy, SPRING.eye[0], SPRING.eye[1], h);
      step(m.edy, SPRING.eye[0], SPRING.eye[1], h);
      step(m.morph, SPRING.eye[0], SPRING.eye[1], h);
      step(m.armL, SPRING.arm[0], SPRING.arm[1], h);
      step(m.armR, SPRING.arm[0], SPRING.arm[1], h);
    }

    const driftX = rest ? 0
      : Math.sin(m.clock * EYE_DRIFT.rx) * EYE_DRIFT.ax
        + Math.sin(m.clock * EYE_DRIFT.rx2) * EYE_DRIFT.bx;
    const driftY = rest ? 0 : Math.sin(m.clock * EYE_DRIFT.ry) * EYE_DRIFT.ay;

    out.value = {
      tx: m.tx.x * POSE_UNIT * box,
      // The hop's lift lands here rather than on the ty spring: a spring chasing it
      // would round off the launch and swallow the apex.
      ty: (m.ty.x - (rest ? 0 : p.lift)) * POSE_UNIT * box,
      roll: m.roll.x,
      sx: m.sx.x, sy: m.sy.x,
      armL: m.armL.x, armR: m.armR.x,
      gx: (m.gazeX.x * GAZE_REACH.x + driftX) * box,
      gy: (m.gazeY.x * GAZE_REACH.y + driftY + m.edy.x) * box,
      esx: m.esx.x * m.eyeScale.x, esy: m.esy.x * m.eyeScale.x,
      edy: m.edy.x * box,
      morph: Math.min(1, Math.max(0, m.morph.x)),
      lid: m.lid.x,
      lidRest: rest ? 1 : Math.max(p.lid, 0.08),
      lift: rest ? 0 : p.lift,
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
    const cadence = BLINK_EVERY[mood];
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

  // Eye art: each state cycles its own playlist, holding each for its own span.
  useEffect(() => {
    const list = EYE_PLAYLIST[mood];
    setEyePair((prev) => ({ from: prev.to, to: list[0] }));
    if (reduceMotion || list.length < 2) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        eyeIndex.current = (eyeIndex.current + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
        setEyePair((prev) => ({ from: prev.to, to: list[eyeIndex.current] }));
        next();
      }, randomMs(EYE_HOLD[mood]));
    };
    next();
    return () => clearTimeout(timer);
  }, [mood, reduceMotion]);

  // Gaze: pick a place to look, hold it, pick another. The spring does the move.
  useEffect(() => {
    const aim = GAZE[mood];
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
    const beat = BEAT[mood];
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

  // The whole character: drift, bob, lean and squash, pivoting where it meets the
  // ground rather than at its own centre.
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
  // The shadow stays on the ground while the character leaves it.
  const shadow = useAnimatedStyle(() => {
    const k = Math.max(0, 1 - out.value.lift * SHADOW_FALLOFF);
    return { opacity: 0.55 * k, transform: [{ scaleX: k }, { scaleY: k }] };
  });
  // The lid narrows the eye rather than fading it: a squint is a shape, not a
  // transparency. Clamped so a very low resting lid never collapses the art to a line.
  const eyeGroup = useAnimatedStyle(() => {
    const narrow = Math.min(1.15, Math.max(0.45, out.value.lid));
    return {
      transform: [
        { translateY: out.value.edy },
        { scaleX: out.value.esx }, { scaleY: out.value.esy * narrow },
      ],
    };
  });
  const pupil = useAnimatedStyle(() => ({
    transform: [{ translateX: out.value.gx }, { translateY: out.value.gy }],
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
  // A frame swap, not a dissolve. Two pieces of opaque art cross-faded at 50/50 are
  // both half transparent at once, so the body shows through and the eyes turn to
  // ghosts halfway through every change. Cut-out animation cuts; the morph spring
  // still supplies the timing, and the scale springs still squash the eye into and
  // out of the cut, so the change is sprung without ever being see-through.
  const fromArt = useAnimatedStyle(() => ({ opacity: out.value.morph < 0.5 ? 1 : 0 }));
  const toArt = useAnimatedStyle(() => ({ opacity: out.value.morph < 0.5 ? 0 : 1 }));

  const from = EYE_ART[eyePair.from];
  const to = EYE_ART[eyePair.to];
  const reach = REACH_ARM[mood] ?? false;
  const prop = PROP[mood];

  return (
    <View accessible={false} pointerEvents="none" style={[{ width: box, height: box }, style]}>
      <Part name="shadow" box={box} style={shadow} />
      <Animated.View style={[StyleSheet.absoluteFill, stage]}>
        <Part name="foot_L" box={box} />
        <Part name="foot_R" box={box} />
        <Part name="ear_L" box={box} />
        <Part name="ear_R" box={box} />
        {!reach && <Arm name="arm_L" box={box} out={out} side="L" />}
        {!reach && <Arm name="arm_R" box={box} out={out} side="R" />}
        <Part name="body" box={box} />
        {reach && <Arm name="arm_L_reach" box={box} out={out} side="L" />}
        {reach && <Arm name="arm_R_reach" box={box} out={out} side="R" />}

        <Animated.View style={[StyleSheet.absoluteFill, eyeGroup]}>
          <Animated.View style={[StyleSheet.absoluteFill, openEyes]}>
            <Animated.View style={[StyleSheet.absoluteFill, fromArt]}>
              <Whites art={from} box={box} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, toArt]}>
              <Whites art={to} box={box} />
            </Animated.View>
            <Pupils show={from.pupils} box={box} style={pupil} fade={fromArt} />
            <Pupils show={to.pupils} box={box} style={pupil} fade={toArt} />
          </Animated.View>
          <Part name={BLINK_ART.half} box={box} style={halfEyes} />
          <Part name={BLINK_ART.closed} box={box} style={shutEyes} />
        </Animated.View>

        <Part name={MOUTH[mood]} box={box} />
        {prop && <Part name={prop} box={box} />}
      </Animated.View>
    </View>
  );
}

/** Pupils belong to the art they were cut for: the narrowed and squeezed pieces have
 * their own baked in, so drawing a pupil over them would double it. They therefore
 * swap on the same frame the whites do. */
function Pupils({ show, box, style, fade }: {
  show: boolean; box: number; style: PartStyle; fade: PartStyle;
}) {
  if (!show) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, fade as StyleProp<ViewStyle>]}>
      <Part name="pupil_L" box={box} style={style} />
      <Part name="pupil_R" box={box} style={style} />
    </Animated.View>
  );
}

/** The whites for one eye art: either the neutral pair or a single spanning piece. */
function Whites({ art, box }: { art: (typeof EYE_ART)[EyeName]; box: number }) {
  if (art.whites === 'pair') {
    return (
      <>
        <Part name="eye_white_L" box={box} />
        <Part name="eye_white_R" box={box} />
      </>
    );
  }
  return <Part name={art.whites} box={box} />;
}

