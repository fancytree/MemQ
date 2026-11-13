/**
 * The three pictures the first run is built on.
 *
 * Onboarding was a card with a paragraph in it, three times over. Nobody reads
 * three paragraphs to get into an app, and the one claim that matters — that a
 * thing read once is gone in a week, and that a review placed just before it goes
 * keeps it — is a shape, not a sentence. So each beat is a drawing that moves, and
 * the words around it are a title and a line.
 *
 * They are drawn in the app's own language: surfaces are a coloured shell with a
 * lighter face sitting on it (theme/ledge.ts), the palette is homeColors, and
 * nothing here has a shadow or a gradient of its own.
 *
 * All three hold still under Reduce Motion, each at the end of its own loop —
 * the curve fully drawn, the fan settled, the last step lit — so a still frame is
 * the finished picture rather than an empty one.
 */
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { MASCOT_HANDS } from '@/components/mascot/figma-parts';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedProps, useAnimatedStyle, useReducedMotion,
  useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** One pass of something, then a pause on the finished state, then round again.
 * The pause is most of the point: a loop that restarts the moment it arrives
 * never lets you look at what it drew. */
function useSweep(ms: number, hold: number) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0);
  useEffect(() => {
    if (reduce) { p.value = 1; return; }
    p.value = 0;
    p.value = withRepeat(
      withSequence(
        withTiming(1, { duration: ms, easing: Easing.out(Easing.cubic) }),
        withDelay(hold, withTiming(0, { duration: 1 })),
        withDelay(320, withTiming(0, { duration: 1 })),
      ), -1, false);
  }, [hold, ms, p, reduce]);
  return p;
}

/** A slow back-and-forth, for things that hover. */
function useBob(ms: number) {
  const reduce = useReducedMotion();
  const p = useSharedValue(0.5);
  useEffect(() => {
    if (reduce) { p.value = 0.5; return; }
    p.value = withRepeat(
      withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [ms, p, reduce]);
  return p;
}

// ─── Who it is for ───────────────────────────────────────────────────────────

/** The welcome scene: the character at a laptop, with what it was just doing
 * floating above its head.
 *
 * This is the claim the product stands on, drawn rather than stated — what you
 * review here came out of your own week. So the picture is not a deck of cards
 * somebody packed: it is a question you asked, a thing you looked up, a page you
 * were reading, on their way into the machine you were already sitting at.
 *
 * The laptop is handed to the character as `behind`, which puts it between the
 * body and the hands, so the paws land on the lid the way they land on the card
 * on the sign-in screens. The right paw is pushed out 6.31 units because the two
 * are not mirror images in the artwork — see handRest in MascotCharacter.
 */
const DESK_MASCOT = 146;
const LID_W = 152;

/** Where the lid's top edge crosses the character, read off the hands rather than
 * typed in: a little below their middle, so their lower part laps onto the lid and
 * they read as resting on it instead of hovering above. Same relationship the
 * sign-in card uses. */
const HAND_LINE = MASCOT_HANDS.reduce((sum, h) => sum + (h.box[1] + h.box[3]) / 2, 0)
  / MASCOT_HANDS.length / 256;
const LID_LIFT = -(1 - (HAND_LINE + 7 / 256)) * DESK_MASCOT;

export function Desk() {
  return (
    <View style={art.desk}>
      <Prompts />
      <MascotCharacter width={DESK_MASCOT} mood="onboarding" calm
        look={{ y: -0.5 }}
        handRest={{ right: { out: 6.31 } }}
        style={art.deskMascot}
        behind={(
          <View style={art.laptop}>
            <View style={art.lid}>
              <View style={art.lidFace}><Horned /></View>
            </View>
            <View style={art.base}><View style={art.baseFace} /></View>
          </View>
        )} />
    </View>
  );
}

/** The three things on their way in: something looked up, something asked,
 * something read. They hover at their own heights and drift on their own
 * periods, so the group never settles into a row. */
function Prompts() {
  const a = useBob(2600), b = useBob(3100), c = useBob(2200);
  const useLift = (v: { value: number }, rest: number, swing: number) =>
    useAnimatedStyle(() => ({ transform: [{ translateY: rest + (v.value - 0.5) * swing }] }));
  return (
    <View style={art.prompts}>
      <Animated.View style={[art.prompt, useLift(a, 14, 9)]}>
        <View style={art.promptFace}><Looked /></View>
      </Animated.View>
      <Animated.View style={[art.prompt, useLift(b, -10, 11)]}>
        <View style={art.promptFace}><Text style={art.asked}>?</Text></View>
      </Animated.View>
      <Animated.View style={[art.prompt, useLift(c, 8, 8)]}>
        <View style={art.promptFace}><Read /></View>
      </Animated.View>
    </View>
  );
}

function Looked() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Circle cx={11} cy={11} r={6.5} fill="none" stroke={homeColors.primary} strokeWidth={2.4} />
      <Line x1={15.8} y1={15.8} x2={21} y2={21} stroke={homeColors.primary}
        strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

function Read() {
  return (
    <Svg width={26} height={26} viewBox="0 0 26 26">
      <Line x1={5} y1={7.5} x2={21} y2={7.5} stroke={homeColors.primary} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={5} y1={13} x2={21} y2={13} stroke={homeColors.primary} strokeWidth={2.4} strokeLinecap="round" />
      <Line x1={5} y1={18.5} x2={14} y2={18.5} stroke={homeColors.primary} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** The mark on the back of the lid: the character's own silhouette. Solid, not
 * drawn in line — at 26 points a stroked outline reads as two thin ears. */
function Horned() {
  return (
    <Svg width={26} height={26} viewBox="0 0 30 30">
      <Path d="M8.6 12.2 L5.8 4.4 L14.2 9.6 Z" fill={homeColors.streakBorder} />
      <Path d="M21.4 12.2 L24.2 4.4 L15.8 9.6 Z" fill={homeColors.streakBorder} />
      <Circle cx={15} cy={18} r={8.6} fill={homeColors.streakBorder} />
    </Svg>
  );
}

// ─── Why it is needed ────────────────────────────────────────────────────────

const GREY_LEN = 283;
const CURVE_LEN = 361;
/** Where along the drawn line each review lands, as a fraction of its length. */
const PEAKS = [
  { at: 0.265, x: 62, y: 16 },
  { at: 0.571, x: 136, y: 12 },
  { at: 0.870, x: 218, y: 9 },
] as const;

/** The forgetting curve, drawn as you watch.
 *
 * The pale line is one reading on its own: most of it is gone in the first days
 * and it keeps sinking. The purple line is the same material with a review each
 * time it starts to slip — every step up is one short review, and they get further
 * apart because each one buys more time than the last. That widening gap is the
 * product, so it is the thing the drawing has to show.
 *
 * Shape only: no numbers and no scale, because this is not making a claim about a
 * particular number of days. */
export function Forgetting() {
  const p = useSweep(2600, 1500);

  const fade = useAnimatedProps(() => ({ strokeDashoffset: GREY_LEN * (1 - p.value) }));
  const kept = useAnimatedProps(() => ({ strokeDashoffset: CURVE_LEN * (1 - p.value) }));

  return (
    <View style={art.curve}>
      <Svg width="100%" height={116} viewBox="0 0 268 116">
        <Line x1={0} y1={100} x2={268} y2={100} stroke={homeColors.border} strokeWidth={2} />
        <AnimatedPath animatedProps={fade}
          d="M4 14 C 40 62, 80 78, 134 82 S 230 89, 264 90"
          fill="none" stroke={homeColors.streakBorder} strokeWidth={3}
          strokeLinecap="round" strokeDasharray={GREY_LEN} />
        <AnimatedPath animatedProps={kept}
          d="M4 14 C 28 34, 44 42, 62 45 L 62 16 C 96 34, 116 41, 136 43 L 136 12 C 176 26, 198 31, 218 32 L 218 9 C 240 15, 254 17, 264 18"
          fill="none" stroke={homeColors.primary} strokeWidth={3}
          strokeLinecap="round" strokeLinejoin="round" strokeDasharray={CURVE_LEN} />
        {PEAKS.map((peak) => <Peak key={peak.x} p={p} at={peak.at} x={peak.x} y={peak.y} />)}
      </Svg>
      <View style={art.legend}>
        <Key tone={homeColors.primary} label="Reviewed as it slips" />
        <Key tone={homeColors.streakBorder} label="Read once" />
      </View>
    </View>
  );
}

/** One review: a ring that opens where the line steps back up. */
function Peak({ p, at, x, y }: {
  p: { value: number }; at: number; x: number; y: number;
}) {
  const pop = useAnimatedProps(() => {
    const k = Math.max(0, Math.min(1, (p.value - at) / 0.07));
    return { r: 2 + k * 3.4, opacity: k };
  });
  return (
    <AnimatedCircle animatedProps={pop} cx={x} cy={y}
      fill={homeColors.white} stroke={homeColors.primary} strokeWidth={2.5} />
  );
}

function Key({ tone, label }: { tone: string; label: string }) {
  return (
    <View style={art.key}>
      <View style={[art.swatch, { backgroundColor: tone }]} />
      <Text style={art.keyText}>{label}</Text>
    </View>
  );
}

// ─── How it is used ──────────────────────────────────────────────────────────

const LOOP = ['Your material', 'Becomes cards', 'You review'] as const;

/** The daily loop, lighting one step at a time. What it is saying is which of the
 * three is yours: the middle one lights on its own, because that is the part the
 * app does while you are not here. */
export function Loop() {
  const reduce = useReducedMotion();
  const t = useSharedValue(2.5);
  useEffect(() => {
    if (reduce) { t.value = 2.5; return; }
    t.value = 0;
    t.value = withRepeat(withTiming(3, { duration: 4200, easing: Easing.linear }), -1, false);
  }, [reduce, t]);

  return (
    <View style={art.loop}>
      {LOOP.map((label, i) => <Stage key={label} t={t} i={i} label={label} />)}
    </View>
  );
}

function Stage({ t, i, label }: { t: { value: number }; i: number; label: string }) {
  // How close the sweep is to this step's slot, 0 to 1. It is worked out again in
  // each of the three worklets below rather than shared: a plain function defined
  // out here cannot be called from the UI runtime.
  const mid = i + 0.5;
  const lift = useAnimatedStyle(() => {
    const k = Math.max(0, 1 - Math.abs(t.value - mid) / 0.55);
    return { transform: [{ translateY: -8 * k }], opacity: 0.6 + 0.4 * k };
  });
  // The lit step takes the colour the rest of the app lights a chosen thing with,
  // so this reads as the same gesture as a selected tab rather than a new one.
  const face = useAnimatedStyle(() => {
    const k = Math.max(0, 1 - Math.abs(t.value - mid) / 0.55);
    return {
      backgroundColor: interpolateColor(k, [0, 1], [homeColors.canvas, homeColors.selected]),
    };
  });
  const word = useAnimatedStyle(() => {
    const k = Math.max(0, 1 - Math.abs(t.value - mid) / 0.55);
    return { color: interpolateColor(k, [0, 1], [homeColors.muted, homeColors.darkest]) };
  });
  return (
    <Animated.View style={[art.stage, lift]}>
      <View style={art.tile}>
        <Animated.View style={[art.tileFace, face]}>
          <Glyph which={i} />
        </Animated.View>
      </View>
      <Animated.Text style={[art.stageText, word]}>{label}</Animated.Text>
    </Animated.View>
  );
}

function Glyph({ which }: { which: number }) {
  const ink = homeColors.primary;
  if (which === 0) {
    return (
      <Svg width={34} height={34} viewBox="0 0 32 32">
        <Rect x={7} y={4} width={18} height={24} rx={3}
          fill="none" stroke={ink} strokeWidth={2} />
        <Line x1={11} y1={11} x2={21} y2={11} stroke={ink} strokeWidth={2} strokeLinecap="round" />
        <Line x1={11} y1={16} x2={21} y2={16} stroke={ink} strokeWidth={2} strokeLinecap="round" />
        <Line x1={11} y1={21} x2={17} y2={21} stroke={ink} strokeWidth={2} strokeLinecap="round" />
      </Svg>
    );
  }
  if (which === 1) {
    return (
      <Svg width={34} height={34} viewBox="0 0 32 32">
        <Rect x={4} y={9} width={15} height={19} rx={3}
          fill="none" stroke={ink} strokeWidth={2} transform="rotate(-8,11.5,18.5)" />
        <Rect x={13} y={5} width={15} height={19} rx={3}
          fill={homeColors.white} stroke={ink} strokeWidth={2} />
      </Svg>
    );
  }
  return (
    <Svg width={34} height={34} viewBox="0 0 32 32">
      <Circle cx={16} cy={16} r={11} fill="none" stroke={ink} strokeWidth={2} />
      <Path d="M11 16.4 L14.6 20 L21 13" fill="none" stroke={ink} strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const art = StyleSheet.create({
  desk: { alignItems: 'center' },
  deskMascot: { alignSelf: 'center' },

  prompts: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingBottom: 6 },
  prompt: {
    width: 58, borderRadius: 18,
    backgroundColor: homeColors.border, paddingBottom: ledge.control,
  },
  promptFace: {
    height: 54, borderRadius: 18, backgroundColor: homeColors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  asked: { fontFamily: 'Geist_600SemiBold', fontSize: 24, color: homeColors.primary },

  // The lid is wider than the character's box, so it reaches past both paws and
  // reads as a thing being leaned on rather than held.
  laptop: { marginTop: LID_LIFT, marginHorizontal: (DESK_MASCOT - LID_W) / 2, alignItems: 'center' },
  lid: {
    width: LID_W, borderRadius: 18,
    backgroundColor: homeColors.border, paddingBottom: ledge.raised,
  },
  lidFace: {
    height: 72, borderRadius: 18, backgroundColor: homeColors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  // The deck it stands on, a little wider than the lid, with its own lip so the
  // machine has two planes rather than one flat card.
  base: {
    width: LID_W + 26, borderRadius: 11,
    backgroundColor: homeColors.border, paddingBottom: ledge.control, marginTop: 4,
  },
  baseFace: { height: 13, borderRadius: 11, backgroundColor: homeColors.canvas },

  curve: { gap: 10, paddingTop: 2 },
  legend: { flexDirection: 'row', gap: 16 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 14, height: 3, borderRadius: 2 },
  keyText: { fontFamily: 'Geist_500Medium', fontSize: 12, color: homeColors.muted },

  loop: { flexDirection: 'row', gap: 10, paddingTop: 4 },
  stage: { flex: 1, alignItems: 'center', gap: 8 },
  tile: {
    width: '100%', borderRadius: 20,
    backgroundColor: homeColors.border, paddingBottom: ledge.control,
  },
  tileFace: {
    borderRadius: 20, backgroundColor: homeColors.canvas,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 18,
  },
  stageText: {
    fontFamily: 'Geist_500Medium', fontSize: 12, lineHeight: 16,
    color: homeColors.muted, textAlign: 'center',
  },
});
