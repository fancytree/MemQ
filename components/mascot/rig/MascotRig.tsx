/** The mascot, drawn from the rig.
 *
 * One SVG, one element per part, and every element is handed its own matrix each
 * frame by the solver in ./solve. Nothing here decides how anything moves; this
 * file only says what is drawn, in what order, and which number in the frame each
 * piece listens to.
 *
 * Three kinds of part, by how they are drawn:
 *
 * - Kept as drawn in Figma — the horns, the hands, the tail's arrowhead, the wink,
 *   the frown and the marks. Each is a path with its pivot at the origin, placed by
 *   a matrix.
 * - Drawn from numbers — the body, the eye whites, the pupils and the round mouth
 *   are ellipses, and the tail's length and a closed eye's line are curves rebuilt
 *   every frame. They are the parts that have to change shape: a body that squashes
 *   with an even outline, a tail that bends, an eye that closes into a line.
 * - The lids, which are not drawn in Figma at all: two slabs of the body's colour
 *   that cover the top and the bottom of an eye. They are what the focused frame's
 *   slanted eye is, taken apart into something that can be lowered by degrees.
 *
 * It is drawn in two halves, back and front, so that a screen can put something
 * between them: the body, the horns and the tail behind, the face, the hands and
 * the marks in front. That is how the character comes to be sitting behind a card
 * with its paws over the edge.
 */
import { useEffect, useId, useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedProps, useAnimatedStyle, useFrameCallback, useReducedMotion, useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { ClipPath, Defs, Ellipse, G, Path, Rect } from 'react-native-svg';

import { colors } from '@/theme';

import { RIG_ART, RIG_INK, RIG_MEASURE, type RigArtName } from './art';
import {
  CHANNEL_COUNT, RIG_ORIGIN, RIG_PART_INDEX, RIG_VIEW, type MascotMood, type RigPart,
} from './rig';
import { createRigState, solveRig, type RigFrame, type RigInput, type RigState } from './solve';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedEllipse = Animated.createAnimatedComponent(Ellipse);

type GAnimatedProps = ComponentProps<typeof AnimatedG>['animatedProps'];
type FrameKey<T> = { [K in keyof RigFrame]: RigFrame[K] extends T ? K : never }[keyof RigFrame];
type MatrixKey = FrameKey<number[]>;
type NumberKey = FrameKey<number>;
type Frame = SharedValue<RigFrame>;

const NO_TWEAK: number[] = new Array(CHANNEL_COUNT).fill(0);
/** How far past an eye's white its lids are allowed to reach. The white's edge is
 * anti-aliased, so a lid cut off exactly on it leaves a hairline of white showing
 * round the part it covers; cut off a little outside, it covers the edge as well.
 * More above and below than at the sides: the ball flattens as the eye closes, and
 * this margin flattens with it. */
const LID_BLEED = { x: 1.5, y: 4 } as const;
const LID = { half: 60, tall: 100 } as const;

/** A part's paths, exactly as imported. */
function Art({ name }: { name: RigArtName }) {
  return (
    <>
      {RIG_ART[name].map((p, i) => (
        <Path
          key={i}
          d={p.d}
          // A stroked path carries no fill in the export, and SVG's own default
          // fill is black, so the absence has to be said out loud.
          fill={p.fill ?? 'none'}
          stroke={p.stroke}
          strokeWidth={p.width}
          strokeLinecap={p.cap as 'round' | undefined}
          strokeLinejoin={p.join as 'round' | undefined}
        />
      ))}
    </>
  );
}

/** A group placed by one of the frame's matrices, and optionally faded by one of
 * its numbers. Everything that moves is one of these. */
function Moved({ frame, at, fade, children }: {
  frame: Frame; at: MatrixKey; fade?: NumberKey; children: ReactNode;
}) {
  const props = useAnimatedProps(() => {
    const f = frame.value;
    return fade ? { matrix: f[at], opacity: f[fade] } : { matrix: f[at] };
  });
  // `matrix` is the prop the native SVG group actually takes; the typed surface
  // only admits `transform`, which is parsed on the JS thread and so cannot be
  // driven from this one.
  return <AnimatedG animatedProps={props as GAnimatedProps}>{children}</AnimatedG>;
}

function Eye({ frame, side, id }: { frame: Frame; side: 'L' | 'R'; id: string }) {
  const { rx, ry } = side === 'L' ? RIG_MEASURE.eyeL : RIG_MEASURE.eyeR;
  const lash = useAnimatedProps(() => ({
    d: side === 'L' ? frame.value.lashL : frame.value.lashR,
    opacity: side === 'L' ? frame.value.lashLO : frame.value.lashRO,
  }));
  return (
    <>
      {/* The ball: the white, the pupil inside it, and the lids over both. It
          narrows as the eye closes, and everything in it narrows with it except
          the pupil, which the solver un-narrows. */}
      <Moved frame={frame} at={`ball${side}`} fade={`white${side}`}>
        <Ellipse rx={rx} ry={ry} fill={RIG_INK.white} />
        {/* The clip sits on a group outside the one that moves: a clip named on the
            moving element travels with it and never cuts anything. */}
        <G clipPath={`url(#${id}-white${side})`}>
          <Moved frame={frame} at={`pupil${side}`}>
            <Ellipse rx={RIG_MEASURE.pupil.rx} ry={RIG_MEASURE.pupil.ry} fill={RIG_INK.outline} />
          </Moved>
        </G>
        <G clipPath={`url(#${id}-lid${side})`}>
          <Moved frame={frame} at={`lid${side}`}>
            <Rect x={-LID.half} y={-LID.tall} width={LID.half * 2} height={LID.tall} fill={RIG_INK.skin} />
          </Moved>
          <Moved frame={frame} at={`low${side}`}>
            <Rect x={-LID.half} y={0} width={LID.half * 2} height={LID.tall} fill={RIG_INK.skin} />
          </Moved>
        </G>
      </Moved>
      {/* What a shut eye is drawn as: a line, or the chevron of a wink. These keep
          their size while the ball narrows, so they are beside it, not inside. */}
      <Moved frame={frame} at={`eye${side}`}>
        <AnimatedPath
          animatedProps={lash}
          fill="none"
          stroke={RIG_INK.outline}
          strokeWidth={RIG_MEASURE.lash.stroke}
          strokeLinecap="round"
        />
        <Moved frame={frame} at={`wink${side}`} fade={`wink${side}O`}>
          <Art name={side === 'L' ? 'winkL' : 'winkR'} />
        </Moved>
      </Moved>
    </>
  );
}

export interface MascotRigProps {
  /** The side of the square the character is drawn in, in points. */
  width: number;
  mood?: MascotMood;
  /** Where to aim the gaze, added to wherever the mood looks: -1 is hard left or
   * up, +1 hard right or down. */
  look?: { x?: number; y?: number };
  /** Whether the face may drift between the mood's poses. */
  drift?: boolean;
  /** Whether the parts are linked to each other. Off, everything is welded to the
   * body. It exists for the lab: the difference between the two is the rig. */
  linked?: boolean;
  /** Draw the pivots and the tail's bones over the character. */
  debug?: boolean;
  /** An offset per channel, added to the pose. The lab's sliders. */
  tweak?: SharedValue<number[]>;
  /** Where the body has been dragged to, in artwork units. */
  dragX?: SharedValue<number>;
  dragY?: SharedValue<number>;
  /** Increment to blink, wink, or fire the mood's beat right now. */
  blinkSignal?: number;
  winkSignal?: number;
  beatSignal?: number;
  /** Knock one part. `seq` is incremented for each knock. */
  poke?: { seq: number; part: RigPart };
  /** Hold one face: no drift between the mood's poses, no blink, no wink. What is
   * left is the body's own breath, the tail, and the eyes tracking wherever the
   * character has been told to look. For a screen a person is reading and typing
   * into, a face that keeps changing is something to watch instead of a form. */
  calm?: boolean;
  /** Hold the eyes shut. The sign-in screens cover them while a password is typed. */
  eyesShut?: boolean;
  /** A fixed lean, in degrees, applied inside the character rather than to the box
   * around it — so whatever is passed as `behind` stays upright. */
  tilt?: number;
  /** Whether the paws are drawn at all. By default the mood decides. */
  hands?: boolean;
  /** What the character sits behind and puts its hands over: a card, a laptop, a
   * hill. It is a child in the flow, after the back half and before the front, so a
   * card given a negative top margin rides up over the body by exactly that much.
   * With it the wrapper stops forcing a square and stops swallowing touches — the
   * thing it was handed may be a form — and the hands come to rest level, on an
   * edge, rather than at the two heights the drawing poses them at. */
  behind?: ReactNode;
  /** Where a paw rests, adjusted for one screen: `out` pushes it away from the
   * body's centre, in artwork units, and `turn` slides it round the outline, in
   * degrees clockwise. What a paw rests on is whatever the screen puts in front of
   * the body, which the artwork cannot know about. */
  handRest?: {
    left?: { out?: number; turn?: number };
    right?: { out?: number; turn?: number };
  };
  /** Moves the tail off where the drawing sprouts it, in artwork units. */
  tailRest?: { x?: number; y?: number };
  /** How far outside its square the character may be drawn, as a fraction of
   * `width` on every side. The square is what lays out; the drawing is larger, so a
   * tail at the end of its swing or a body at the top of a hop is not cut off at an
   * edge nobody can see. A surface that drags the character about wants more. */
  bleed?: number;
  style?: StyleProp<ViewStyle>;
}

export function MascotRig({
  width, mood = 'idle', look, drift = true, linked = true, debug = false,
  tweak, dragX, dragY, blinkSignal = 0, winkSignal = 0, beatSignal = 0, poke, bleed = 0.12,
  calm = false, eyesShut = false, tilt = 0, hands, behind, handRest, tailRest, style,
}: MascotRigProps) {
  // React's own id carries colons, which an SVG url(#...) reference cannot hold.
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const still = useReducedMotion();
  const lookX = look?.x ?? 0;
  const lookY = look?.y ?? 0;

  const ownTweak = useSharedValue(NO_TWEAK);
  const ownDragX = useSharedValue(0);
  const ownDragY = useSharedValue(0);
  const tweakBy = tweak ?? ownTweak;
  const dragXBy = dragX ?? ownDragX;
  const dragYBy = dragY ?? ownDragY;

  const pokeSeq = poke?.seq ?? 0;
  const pokePart = poke ? RIG_PART_INDEX[poke.part] : -1;
  const level = !!behind;
  const handsAs = hands === undefined ? -1 : hands ? 1 : 0;
  const outL = handRest?.left?.out ?? 0, turnL = handRest?.left?.turn ?? 0;
  const outR = handRest?.right?.out ?? 0, turnR = handRest?.right?.turn ?? 0;
  const tailX = tailRest?.x ?? 0, tailY = tailRest?.y ?? 0;
  /** Everything that crosses from React, as one object the worklet reads. Counters,
   * not fields written into the solver's state: writing into an object already
   * handed to a worklet is unsupported and silently unreliable. */
  const settings = (): RigInput => ({
    mood, still: !!still, linked, drift, tweak: NO_TWEAK, dragX: 0, dragY: 0, lookX, lookY,
    blink: blinkSignal, wink: winkSignal, beat: beatSignal, poke: pokeSeq, pokePart, debug,
    calm, eyesShut, tilt, hands: handsAs, level,
    handOutL: outL, handTurnL: turnL, handOutR: outR, handTurnR: turnR, tailX, tailY,
  });

  // The first frame is solved here, on this thread, so every animated prop starts
  // from the mood's rest pose instead of from nothing.
  const [first] = useState(() => {
    const input = { ...settings(), still: true };
    return { input, frame: solveRig(createRigState(mood), input, 0), state: createRigState(mood) };
  });
  const state = useSharedValue<RigState>(first.state);
  const frame = useSharedValue<RigFrame>(first.frame);
  const config = useSharedValue(first.input);
  const live = useSharedValue(false);

  useEffect(() => {
    config.value = settings();
    // `settings` reads only what is listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    beatSignal, blinkSignal, calm, config, debug, drift, eyesShut, handsAs, level, linked, lookX, lookY,
    mood, outL, outR, pokePart, pokeSeq, still, tailX, tailY, tilt, turnL, turnR, winkSignal,
  ]);

  useFrameCallback((info) => {
    'worklet';
    const c = config.value;
    frame.value = solveRig(state.value, {
      mood: c.mood, still: c.still, linked: c.linked, drift: c.drift,
      tweak: tweakBy.value, dragX: dragXBy.value, dragY: dragYBy.value,
      lookX: c.lookX, lookY: c.lookY,
      blink: c.blink, wink: c.wink, beat: c.beat, poke: c.poke, pokePart: c.pokePart,
      debug: c.debug,
      calm: c.calm, eyesShut: c.eyesShut, tilt: c.tilt, hands: c.hands, level: c.level,
      handOutL: c.handOutL, handTurnL: c.handTurnL, handOutR: c.handOutR, handTurnR: c.handTurnR,
      tailX: c.tailX, tailY: c.tailY,
    }, (info.timeSincePreviousFrame ?? 0) / 1000);
    live.value = true;
  }, true);

  // Shown from the first solved frame. A group's matrix is only ever set from the
  // UI thread, so for the one frame before it arrives every part would sit on the
  // body's centre.
  // Two of them rather than one style on two views: Reanimated asks for a style per
  // component, and the two halves appear together because they read the same flag.
  const shown = useAnimatedStyle(() => ({ opacity: live.value ? 1 : 0 }));
  const shownFront = useAnimatedStyle(() => ({ opacity: live.value ? 1 : 0 }));

  const tail = useAnimatedProps(() => ({ d: frame.value.tailD }));
  const body = useAnimatedProps(() => ({ rx: frame.value.bodyRx, ry: frame.value.bodyRy }));
  const mouth = useAnimatedProps(() => ({ rx: frame.value.mouthRx, ry: frame.value.mouthRy }));
  const paws = useAnimatedProps(() => ({ opacity: frame.value.handsO }));
  const bones = useAnimatedProps(() => ({ d: frame.value.debug }));

  // The drawing overhangs the square it is laid out in, by the same amount on
  // every side, in points and in the artwork's units.
  const over = Math.round(width * bleed);
  const overArt = over * RIG_VIEW / width;
  const canvas = width + over * 2;

  const canvasProps = {
    width: canvas,
    height: canvas,
    style: { position: 'absolute', left: -over, top: -over } as const,
    // The rig measures from the body's centre, so the view is shifted to put that
    // centre where the frames draw it.
    viewBox: `${-RIG_ORIGIN.x - overArt} ${-RIG_ORIGIN.y - overArt} ${RIG_VIEW + overArt * 2} ${RIG_VIEW + overArt * 2}`,
  };

  return (
    <View accessible={false} pointerEvents={behind ? 'box-none' : 'none'}
      style={[{ width }, behind ? null : { height: width }, style]}>
      {/* The back half: what comes out from behind the silhouette, and the
          silhouette. When something is nested behind the character this half holds
          the square open in the flow. */}
      <Animated.View pointerEvents="none" style={[behind ? styles.half : StyleSheet.absoluteFill, shown]}>
        <Svg {...canvasProps}>
          <AnimatedPath
            animatedProps={tail}
            fill="none"
            stroke={RIG_INK.outline}
            strokeWidth={RIG_MEASURE.tail.stroke}
            strokeLinecap="round"
          />
          <Moved frame={frame} at="tailTip"><Art name="tailTip" /></Moved>
          <Moved frame={frame} at="hornL"><Art name="hornL" /></Moved>
          <Moved frame={frame} at="hornR"><Art name="hornR" /></Moved>
          <Moved frame={frame} at="body">
            <AnimatedEllipse
              animatedProps={body}
              fill={RIG_INK.skin}
              stroke={RIG_INK.outline}
              strokeWidth={RIG_MEASURE.body.stroke}
            />
          </Moved>
        </Svg>
      </Animated.View>

      {behind}

      {/* The front half floats over whatever came next: the face, anything held,
          the hands, and the marks in the air beside the character. */}
      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, behind ? styles.frontHalf : null, shownFront]}>
        <Svg {...canvasProps}>
          <Defs>
            {(['L', 'R'] as const).map((side) => {
              const { rx, ry } = side === 'L' ? RIG_MEASURE.eyeL : RIG_MEASURE.eyeR;
              return (
                <G key={side}>
                  <ClipPath id={`${id}-white${side}`}><Ellipse rx={rx} ry={ry} /></ClipPath>
                  <ClipPath id={`${id}-lid${side}`}><Ellipse rx={rx + LID_BLEED.x} ry={ry + LID_BLEED.y} /></ClipPath>
                </G>
              );
            })}
          </Defs>

          <Eye frame={frame} side="L" id={id} />
          <Eye frame={frame} side="R" id={id} />

          <Moved frame={frame} at="mouth" fade="mouthO">
            <AnimatedEllipse animatedProps={mouth} fill={RIG_INK.outline} />
          </Moved>
          <Moved frame={frame} at="mouthArc" fade="mouthArcO"><Art name="mouthArc" /></Moved>

          <Moved frame={frame} at="badge" fade="badgeO"><Art name="badge" /></Moved>
          <AnimatedG animatedProps={paws}>
            <Moved frame={frame} at="handL"><Art name="handL" /></Moved>
            <Moved frame={frame} at="handR"><Art name="handR" /></Moved>
          </AnimatedG>

          {/* Marks in the air beside the character. They are not part of it, so they
              are last and they do not wear its squash. */}
          <Moved frame={frame} at="spark" fade="sparkO"><Art name="spark" /></Moved>
          <Moved frame={frame} at="question" fade="questionO"><Art name="question" /></Moved>
          <Moved frame={frame} at="zzz" fade="zzzO"><Art name="zzz" /></Moved>

          {debug && (
            <AnimatedPath animatedProps={bones} fill="none" stroke={colors.red} strokeWidth={1.5} />
          )}
        </Svg>
      </Animated.View>
    </View>
  );
}

/** When something is nested behind the character, the back half holds the square
 * open in the flow and the front half floats over whatever came next. */
const styles = StyleSheet.create({
  half: { width: '100%', aspectRatio: 1 },
  frontHalf: { bottom: undefined, aspectRatio: 1 },
});

export { RIG_HAND_LINE, RIG_INK_OFFSET } from './rig';
export type { MascotMood } from './rig';
