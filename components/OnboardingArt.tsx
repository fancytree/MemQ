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

/** Three cards held in a fan, the front one naming a different thing somebody
 * already has in hand, every couple of seconds.
 *
 * What rotates is the material, not the person. Naming the audience — the student,
 * the language learner, the professional — would say who may use this; naming the
 * half-read paper says the thing that matters, which is that what goes in here came
 * out of your own week. Each one has a mark of use on it: got halfway, took it down,
 * finally understood. Nothing here was packed for you. */
const CARRYING = [
  'The paper you got halfway through',
  "Monday's meeting notes",
  'The thing you finally understood yesterday',
];

/** How long one line is up, and how much of that goes to its fade. */
const SLOT_MS = 2600;
const FADE = 0.12;

export function Carry() {
  const reduce = useReducedMotion();
  // One clock for the whole rotation, counting 0 → 3 and round again, entirely on
  // the UI thread. The three lines are mounted and stacked; each works out its own
  // opacity from this one number.
  //
  // Two earlier versions of this did not survive. Swapping the lines in and out of
  // the layout piled the outgoing line on top of the incoming one — invisible while
  // every line was one line long, and a heap of overlapping words as soon as one
  // wrapped. Keeping the index in React state and mirroring it into a shared value
  // fixed the pile-up but stopped advancing at all. A clock the UI thread owns has
  // neither failure: nothing crosses the bridge after it starts.
  const cycle = useSharedValue(0.5);
  useEffect(() => {
    if (reduce) { cycle.value = 0.5; return; }
    cycle.value = 0;
    cycle.value = withRepeat(
      withTiming(CARRYING.length, {
        duration: SLOT_MS * CARRYING.length, easing: Easing.linear,
      }), -1, false);
  }, [cycle, reduce]);

  const left = useBob(3100);
  const right = useBob(2600);
  const front = useBob(2200);

  const leftLift = useAnimatedStyle(() => ({
    transform: [{ translateX: -62 }, { translateY: 20 + (left.value - 0.5) * 7 },
      { rotate: `${-15 + (left.value - 0.5) * 2}deg` }, { scale: 0.86 }],
  }));
  const rightLift = useAnimatedStyle(() => ({
    transform: [{ translateX: 62 }, { translateY: 20 + (right.value - 0.5) * 7 },
      { rotate: `${15 - (right.value - 0.5) * 2}deg` }, { scale: 0.86 }],
  }));
  const frontLift = useAnimatedStyle(() => ({
    transform: [{ translateY: -10 + (front.value - 0.5) * 9 }],
  }));

  return (
    <View style={art.fan}>
      <Animated.View style={[art.card, art.behind, leftLift]}>
        <View style={[art.face, art.faceQuiet]}><Bars /></View>
      </Animated.View>
      <Animated.View style={[art.card, art.behind, rightLift]}>
        <View style={[art.face, art.faceQuiet]}><Bars /></View>
      </Animated.View>
      <Animated.View style={[art.card, frontLift]}>
        <View style={art.face}>
          {CARRYING.map((line, n) => <Carried key={line} text={line} n={n} cycle={cycle} />)}
        </View>
      </Animated.View>
    </View>
  );
}

/** One of the three lines, stacked on the others, showing only during its own
 * slot of the clock. It fades up over the first `FADE` of its slot and back down
 * over the last — and because the outgoing line's fade-out lands in the slot
 * before the incoming line's fade-in begins, two sentences are never legible at
 * once. A true cross-fade through 50% opacity turns two pieces of text into mud. */
function Carried({ text, n, cycle }: { text: string; n: number; cycle: { value: number } }) {
  const fade = useAnimatedStyle(() => {
    const span = CARRYING.length;
    const x = (((cycle.value - n) % span) + span) % span;
    let opacity = 0;
    if (x < FADE) opacity = x / FADE;
    else if (x < 1 - FADE) opacity = 1;
    else if (x < 1) opacity = (1 - x) / FADE;
    return { opacity };
  });
  return (
    <Animated.View style={[art.slot, fade]} pointerEvents="none">
      <Text style={art.carrying}>{text}</Text>
    </Animated.View>
  );
}

function Bars() {
  return (
    <View style={art.bars}>
      <View style={[art.bar, { width: '80%' }]} />
      <View style={[art.bar, { width: '58%' }]} />
      <View style={[art.bar, { width: '68%' }]} />
    </View>
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
  fan: { height: 168, alignItems: 'center', justifyContent: 'center' },
  card: {
    position: 'absolute', width: 196, height: 112,
    borderRadius: 22, backgroundColor: homeColors.border, paddingBottom: ledge.raised,
  },
  behind: { width: 176, height: 104 },
  face: {
    flex: 1, borderRadius: 22, backgroundColor: homeColors.white,
    alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  faceQuiet: { backgroundColor: homeColors.track, justifyContent: 'center' },
  slot: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  carrying: {
    fontFamily: 'Geist_600SemiBold', fontSize: 16, lineHeight: 22,
    color: homeColors.darkest, textAlign: 'center',
  },
  bars: { width: '100%', gap: 8 },
  bar: { height: 7, borderRadius: 4, backgroundColor: homeColors.streakBorder, opacity: 0.55 },

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
