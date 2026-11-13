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
import { homeColors } from '@/theme/colors';
import { Asset } from 'expo-asset';
import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgUri } from 'react-native-svg';

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
  button: { label: string; bg: string; ink: string };
  dot: { on: string; off: string };
};

const SCENES: Scene[] = [
  {
    bg: homeColors.hill,
    ink: homeColors.deep,
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
    button: { label: 'Next  →', bg: homeColors.hill, ink: homeColors.deep },
    dot: { on: homeColors.hill, off: homeColors.streakBorder },
  },
  {
    bg: homeColors.primary,
    ink: homeColors.white,
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
    button: { label: 'Next  →', bg: homeColors.primary, ink: homeColors.white },
    dot: { on: homeColors.primary, off: homeColors.streakBorder },
  },
  {
    bg: homeColors.track,
    ink: homeColors.deep,
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
    skip: false,
    button: { label: 'Next  →', bg: homeColors.hill, ink: homeColors.deep },
    dot: { on: homeColors.deep, off: homeColors.track },
  },
];

export const WELCOME_SCENES = SCENES.length;

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

export function WelcomeStory({ step, onNext, onSkip }: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const scene = SCENES[step];
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const k = width / FRAME_W;

  // Everything below the scene hangs off the bottom inset, in the order and with
  // the gaps the design gives it.
  const foot = insets.bottom;
  const group = scene.group;
  const groupBottom = foot + (DESIGN_FOOT - (group.y + group.h)) * k;

  return (
    <View style={[styles.root, { backgroundColor: scene.bg }]}>
      {scene.waves.map((wave, i) => (
        // How far the wave's bottom edge falls below the footer's last line in the
        // design, taken off the inset the footer now sits on.
        <View key={i} pointerEvents="none" style={[styles.wave, {
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
        {scene.pieces.map((piece, i) => (
          <Art key={i} piece={piece} k={k} ox={group.x} oy={group.y} />
        ))}
      </View>

      {scene.skip && (
        <Pressable accessibilityRole="button" accessibilityLabel="Skip the introduction"
          onPress={onSkip} hitSlop={16}
          style={{ position: 'absolute', right: 24 * k, top: insets.top + 12 * k }}>
          <Text style={{
            fontFamily: 'Geist_500Medium', fontSize: 14 * k, lineHeight: 20 * k, color: scene.ink,
          }}>Skip</Text>
        </Pressable>
      )}

      <Text accessibilityRole="header" style={{
        position: 'absolute', left: 24 * k, top: insets.top + (140 - DESIGN_TOP) * k, width: 354 * k,
        fontFamily: 'Geist_800ExtraBold', fontSize: 40 * k, lineHeight: 43 * k,
        letterSpacing: -1.4 * k, color: scene.ink,
      }}>{scene.title}</Text>

      {!!scene.body && (
        <Text style={{
          position: 'absolute', left: 24 * k, top: insets.top + (scene.bodyTop! - DESIGN_TOP) * k,
          width: 330 * k,
          fontFamily: 'Geist_400Regular', fontSize: 14 * k, lineHeight: 20 * k, color: scene.ink,
        }}>{scene.body}</Text>
      )}

      <View style={[styles.footer, { bottom: foot + (DESIGN_FOOT - DESIGN_BUTTON_BOTTOM) * k }]}>
        <View accessibilityRole="progressbar"
          accessibilityLabel={`Screen ${step + 1} of ${SCENES.length}`}
          style={[styles.dots, { gap: 8 * k }]}>
          {SCENES.map((_, i) => (
            <View key={i} style={{
              width: (i === step ? 22 : 6) * k, height: 6 * k, borderRadius: 3 * k,
              backgroundColor: i === step ? scene.dot.on : scene.dot.off,
            }} />
          ))}
        </View>
        <Pressable accessibilityRole="button" onPress={onNext} style={{
          marginTop: 33 * k, width: 354 * k, height: 58 * k, borderRadius: 100 * k,
          backgroundColor: scene.button.bg, alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{
            fontFamily: 'Geist_700Bold', fontSize: 16 * k, lineHeight: 22 * k, color: scene.button.ink,
          }}>{scene.button.label}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  wave: { position: 'absolute', left: 0 },
  piece: { position: 'absolute' },
  footer: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center' },
});
