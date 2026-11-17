import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { space, radius } from '@/theme/spacing';
import { type } from '@/theme/typography';
/**
 * The three welcome screens, implemented from Figma.
 *
 *   Welcome 01 · Capture curiosity   node 29:158
 *   Welcome 02 · Keep what matters   node 29:181
 *   Welcome 03 · Make it stick       node 29:204
 *
 * Each one is a whole illustrated field rather than a card on the app's usual
 * ground: its own background colour, its own two waves, its own scene. So they do
 * not go through onboarding's shared frame — they own the screen, and the three
 * setup questions that follow keep theirs.
 *
 * The drawings are the exported SVGs, placed and never redrawn. Every piece is
 * positioned by the centre of the box the design gives it, which is what makes the
 * rotated ones land exactly: a rotation turns a layer about its own middle, so the
 * middle is the one point that is the same before and after.
 *
 * Geometry is in the design's own 402-wide frame and scaled by `k`, the real
 * screen's share of it. Vertically nothing is pinned to the design's 874: the
 * words hang off the top inset, and the scene and the footer hang off the bottom
 * one, so a taller phone opens the gap between them rather than cropping anything.
 */
import { Asset } from 'expo-asset';
import React, { useEffect } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';
import { colors } from '@/theme/colors';
import { componentTokens, interaction } from '@/theme';

/** The frame every number below is measured in. */
const FRAME_W = 402;
/** Where the design's own status bar ends, so the words can hang off the real one. */
const DESIGN_TOP = 62;
/** The design's bottom edge, and the line its last footer type sat on. The gap
 *  between them is the safe area everything below the words is pinned to. */
const DESIGN_FOOT = 840.4;
/** The bottom edge of the button, which is now the last thing in the footer. The
 *  counter that used to sit under it said in words what the dots above it already
 *  say, so it went; this keeps the button where the design put it rather than
 *  letting it drop into the space the counter left. */
const DESIGN_BUTTON_BOTTOM = 814;
/** How much taller than its word the Skip button's hit target is, halved. */
const SKIP_LIFT = (interaction.minTarget - componentTokens.button.sm.label.lineHeight) / 2;

type Piece = {
  src: number;
  /** The SVG's own width and height — never overridden, only scaled. */
  w: number; h: number;
  /** Centre, in frame coordinates. */
  cx: number; cy: number;
  rot?: number;
};

type Wave = { src: number; w: number; h: number; top: number };

type Scene = {
  bg: string;
  ink: string;
  waves: Wave[];
  group: { x: number; y: number; w: number; h: number };
  pieces: Piece[];
  title: string;
  body?: string;
  /** Top of the body block in frame coordinates. */
  bodyTop?: number;
  skip: boolean;
  /** The three colours the app's button takes here: its lip, its face and its
   *  word. The scene owns them because the scene owns the ground it stands on. */
  button: { label: string; shell: string; face: string; ink: string };
  dot: { on: string; off: string };
};

const SCENES: Scene[] = [
  {
    bg: colors.lime,
    ink: colors.sub,
    waves: [
      { src: require('../assets/onboarding/w1-lilac-wave.svg'), w: 402, h: 524, top: 372 },
      { src: require('../assets/onboarding/w1-purple-foreground.svg'), w: 402, h: 246.515, top: 629 },
    ],
    group: { x: 37, y: 360, w: 341.132, h: 330.225 },
    pieces: [
      { src: require('../assets/onboarding/w1-card-search.svg'), w: 90.8, h: 91.65, cx: 93.49, cy: 415.94, rot: -6.28 },
      { src: require('../assets/onboarding/w1-card-question.svg'), w: 81.55, h: 93.5, cx: 227.78, cy: 410.59, rot: 6.72 },
      { src: require('../assets/onboarding/w1-card-lines.svg'), w: 83.4, h: 93.5, cx: 320.21, cy: 474.27, rot: 28.72 },
      { src: require('../assets/onboarding/w1-rays.svg'), w: 49.7765, h: 62.7265, cx: 268.70, cy: 534.36 },
      { src: require('../assets/onboarding/w1-mascot.svg'), w: 210.224, h: 206.505, cx: 139.10, cy: 580.43 },
      { src: require('../assets/onboarding/w1-laptop.svg'), w: 260.524, h: 105.75, cx: 203.44, cy: 638.43 },
    ],
    title: 'Turn searches\ninto lasting\nmemory.',
    body: 'Don’t lose your next discovery.\nGive it a place to stay.',
    bodyTop: 288,
    skip: true,
    button: { label: 'Next', shell: colors.limeShell, face: colors.lime, ink: colors.sub },
    dot: { on: colors.lime, off: colors.chartSoft },
  },
  {
    bg: colors.action,
    ink: colors.surf,
    waves: [
      { src: require('../assets/onboarding/w2-yellow-wave.svg'), w: 402, h: 516.812, top: 357.19 },
      { src: require('../assets/onboarding/w2-pale-foreground.svg'), w: 402, h: 203, top: 671 },
    ],
    group: { x: 23.51, y: 323.78, w: 355.258, h: 363.333 },
    pieces: [
      { src: require('../assets/onboarding/w2-card-text.svg'), w: 93.3333, h: 89.3583, cx: 81.68, cy: 402.17, rot: -20 },
      { src: require('../assets/onboarding/w2-card-image.svg'), w: 94.2417, h: 88.45, cx: 201.92, cy: 367.38 },
      { src: require('../assets/onboarding/w2-card-link.svg'), w: 94.2417, h: 89.3583, cx: 318.53, cy: 401.33, rot: 24 },
      { src: require('../assets/onboarding/w2-arrows.svg'), w: 167.777, h: 63.3167, cx: 200.55, cy: 458.21 },
      { src: require('../assets/onboarding/w2-mascot.svg'), w: 223.435, h: 184.558, cx: 224.59, cy: 583.31 },
      { src: require('../assets/onboarding/w2-tray.svg'), w: 205.017, h: 86.6333, cx: 200.09, cy: 644.42 },
      { src: require('../assets/onboarding/w2-sparkles.svg'), w: 280.675, h: 81.75, cx: 197.82, cy: 539.96 },
    ],
    title: 'Keep what you actually use',
    body: 'Save the ideas you’ll actually use.\nLeave the rest behind.',
    bodyTop: 250,
    skip: true,
    button: { label: 'Next', shell: colors.actionShell, face: colors.action, ink: colors.onAction },
    dot: { on: colors.action, off: colors.chartSoft },
  },
  {
    bg: colors.tint,
    ink: colors.sub,
    waves: [
      { src: require('../assets/onboarding/w3-purple-wave.svg'), w: 402, h: 478, top: 396 },
      { src: require('../assets/onboarding/w3-lilac-foreground.svg'), w: 402, h: 216, top: 674 },
    ],
    group: { x: -7, y: 307, w: 416, h: 416 },
    pieces: [
      { src: require('../assets/onboarding/w3-graph-card.svg'), w: 145.747, h: 137.221, cx: 297.12, cy: 425.66, rot: 11 },
      { src: require('../assets/onboarding/w3-mascot.svg'), w: 158.54, h: 165.872, cx: 125.35, cy: 477.16 },
      { src: require('../assets/onboarding/w3-checklist.svg'), w: 246.68, h: 183.587, cx: 171.96, cy: 591.00, rot: -11 },
      { src: require('../assets/onboarding/w3-paws.svg'), w: 182.226, h: 64.2438, cx: 152.54, cy: 508.55 },
      { src: require('../assets/onboarding/w3-refresh.svg'), w: 82.5067, h: 86.1466, cx: 315.44, cy: 650.51 },
      { src: require('../assets/onboarding/w3-rays.svg'), w: 37.8945, h: 36.6811, cx: 120.92, cy: 370.36 },
    ],
    title: 'Practice\nand Remember',
    // The screen's own graph card draws the forgetting curve; this says what it is
    // for. Two lines like the screens before it, and the second one lands on the
    // frame's own name — Make it stick.
    body: 'Each card returns just before you’d forget it.\nThat curve is what makes it stick.',
    // A two-line title, so the words below it start where screen two's do.
    bodyTop: 250,
    skip: false,
    button: { label: 'Next', shell: colors.limeShell, face: colors.lime, ink: colors.sub },
    dot: { on: colors.sub, off: colors.tint },
  },
];

export const WELCOME_SCENES = SCENES.length;

/** The scenes' own colours as ramps, so a move between screens can travel along
 *  them rather than cutting. The index is the step, which is what `at` below
 *  carries while it is between two of them. */
const STEPS = SCENES.map((_, i) => i);
const DOT_ON = SCENES.map((s) => s.dot.on);
const DOT_OFF = SCENES.map((s) => s.dot.off);

/** One step's dot. It is the same view throughout: between screens it grows or
 *  shrinks between the dot and the pill and takes its colour with it, rather
 *  than the row being swapped for another row. */
function Dot({ at, i, k }: { at: { value: number }; i: number; k: number }) {
  const shape = useAnimatedStyle(() => {
    const near = Math.max(0, 1 - Math.abs(at.value - i));
    return {
      width: (6 + 16 * near) * k,
      backgroundColor: interpolateColor(near, [0, 1], [
        interpolateColor(at.value, STEPS, DOT_OFF),
        interpolateColor(at.value, STEPS, DOT_ON),
      ]),
    };
  });
  return <Animated.View style={[{ height: 6 * k, borderRadius: radius.sm * k }, shape]} />;
}

/** One exported drawing, at its own proportions.
 *
 * Both edges are rounded to whole points. These exports carry
 * `preserveAspectRatio="none"`, so an edge the renderer trims stretches the
 * drawing on that axis alone rather than shrinking it evenly. */
function Art({ piece, k, ox, oy }: { piece: Piece; k: number; ox: number; oy: number }) {
  const w = Math.round(piece.w * k);
  const h = Math.round(piece.h * k);
  return (
    <View pointerEvents="none" style={[
      styles.piece,
      {
        left: Math.round((piece.cx - ox) * k - w / 2),
        top: Math.round((piece.cy - oy) * k - h / 2),
        width: w, height: h,
      },
      piece.rot ? { transform: [{ rotate: `${piece.rot}deg` }] } : null,
    ]}>
      <SvgUri uri={Asset.fromModule(piece.src).uri} width={w} height={h} />
    </View>
  );
}

/** One screen of the story, standing on its own ground. The three sit side by
 *  side on one track, so a move between them carries each screen's colour across
 *  with the screen instead of fading the colour underneath them all. */
function Screen({ scene, i, k, width, top, foot, onSkip }: {
  scene: Scene;
  i: number;
  k: number;
  width: number;
  top: number;
  foot: number;
  onSkip: () => void;
}) {
  const group = scene.group;
  const groupBottom = foot + (DESIGN_FOOT - (group.y + group.h)) * k;
  return (
    <View style={[styles.screen, { left: i * width, width, backgroundColor: scene.bg }]}>
      {scene.waves.map((wave, j) => (
        // How far the wave's bottom edge falls below the footer's last line in the
        // design, taken off the inset the footer now sits on.
        <View key={j} pointerEvents="none" style={[styles.wave, {
          bottom: Math.round(foot - (wave.top + wave.h - DESIGN_FOOT) * k),
          width: Math.round(wave.w * k), height: Math.round(wave.h * k),
        }]}>
          <SvgUri uri={Asset.fromModule(wave.src).uri}
            width={Math.round(wave.w * k)} height={Math.round(wave.h * k)} />
        </View>
      ))}

      <View pointerEvents="none" style={{
        position: 'absolute', left: Math.round(group.x * k), bottom: Math.round(groupBottom),
        width: Math.round(group.w * k), height: Math.round(group.h * k),
      }}>
        {scene.pieces.map((piece, j) => (
          <Art key={j} piece={piece} k={k} ox={group.x} oy={group.y} />
        ))}
      </View>

      {/* The word sits where the design put it. The button around it is a 44pt
          target, which is taller than the word, so it starts that much higher. */}
      {scene.skip && (
        <Button label="Skip" variant="quiet" size="sm" width="hug"
          accessibilityLabel="Skip the introduction" onPress={onSkip}
          labelStyle={{ color: scene.ink }}
          style={{ position: 'absolute', right: 24 * k, top: top + 12 * k - SKIP_LIFT }} />
      )}

      <Text accessibilityRole="header" style={{
        ...type.caption, fontFamily: 'Geist_800ExtraBold',
        position: 'absolute',
        left: 24 * k,
        top: top + (140 - DESIGN_TOP) * k,
        width: 354 * k,
        letterSpacing: -1.4 * k,
        color: scene.ink,
      }}>{scene.title}</Text>

      {!!scene.body && (
        <Text style={{
          ...type.caption, fontFamily: 'Geist_400Regular',
          position: 'absolute',
          left: 24 * k,
          top: top + (scene.bodyTop! - DESIGN_TOP) * k,
          width: 330 * k,
          color: scene.ink,
        }}>{scene.body}</Text>
      )}
    </View>
  );
}

export function WelcomeStory({ step, onNext, onSkip }: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const scene = SCENES[step];
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const k = width / FRAME_W;

  // Where the story is, which is not always on a screen: between two of them it
  // holds the fraction, and everything that has to travel rather than cut reads
  // its position off this one number.
  const at = useSharedValue(step);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { at.value = step; return; }
    at.value = withTiming(step, { duration: 420, easing: Easing.out(Easing.cubic) });
  }, [at, reduce, step]);

  // All three screens stand in a row and the row is what moves. One screen is
  // always under the glass, so nothing of the colour between two of them is ever
  // on show: the screen leaving takes its ground with it as the next one arrives.
  const track = useAnimatedStyle(() => ({
    transform: [{ translateX: -at.value * width }],
  }));
  // The footer does not travel — that is the point of it. The button takes the
  // colours of whichever screen is under the glass.
  const foot = insets.bottom;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.track, { width: width * SCENES.length }, track]}>
        {SCENES.map((s, i) => (
          <Screen key={i} scene={s} i={i} k={k} width={width}
            top={insets.top} foot={foot} onSkip={onSkip} />
        ))}
      </Animated.View>

      <View style={[styles.footer, { bottom: foot + (DESIGN_FOOT - DESIGN_BUTTON_BOTTOM) * k }]}>
        <View accessibilityRole="progressbar"
          accessibilityLabel={`Screen ${step + 1} of ${SCENES.length}`}
          style={[styles.dots, { gap: space[2] * k }]}>
          {SCENES.map((_, i) => <Dot key={i} at={at} i={i} k={k} />)}
        </View>
        {/* The app's button, in the scene's colours. It used to be drawn here from
            the design's own numbers and cross-faded between the screens as they
            moved; it is the same control the rest of the app presses, so it is now
            that control, and takes its height, its corner, its lip and its word
            from the tokens. */}
        <Button label={scene.button.label} size="xl" onPress={onNext}
          iconEnd={<Icon name="arrowRight" size={20} color={scene.button.ink} />}
          tone={{ shell: scene.button.shell, face: scene.button.face, label: scene.button.ink }}
          style={{ marginTop: space[8] * k, width: 354 * k }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  track: { position: 'absolute', top: 0, bottom: 0, left: 0, flexDirection: 'row' },
  screen: { position: 'absolute', top: 0, bottom: 0, overflow: 'hidden' },
  wave: { position: 'absolute', left: 0 },
  piece: { position: 'absolute' },
  footer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center' },
});
