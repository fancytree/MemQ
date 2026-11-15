import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withSequence, withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';

import { HomeAsset } from '@/components/HomeAsset';
import { homeColors } from '@/theme/colors';

/** The streak: a flame and the number of days.
 *
 * It sits still until the number goes up, and then it says so — the flame flares
 * and throws a few sparks, and the number rolls from what it was to what it is.
 * A streak growing is the one thing on Today that happened because of something the
 * person did yesterday and today, and a digit quietly being a different digit does
 * not tell them.
 *
 * The moment is coming back to Today after studying. The day's first session is
 * what adds the day, and it happens on another screen; when that screen is put away
 * Today asks for its numbers again and the streak comes back one higher. So the
 * pill waits to be looked at (`active`: its screen is the one in front), lets the
 * screen that was over it finish leaving, and only then does the old number roll
 * to the new one. A change that arrives while something else is in front is held,
 * not spent: the pill goes on showing what it showed until it is seen again.
 *
 * "Higher" is measured against what this person was last shown, not against what
 * the component last held, so it also covers the app having been closed in
 * between: the last number shown is kept (`seenKey`, one per account), and the
 * next time the pill is looked at a higher one is still the occasion.
 *
 * A number that goes down, or stays, is just shown. A streak that broke is not
 * something to animate.
 */
const LINE = 28;
const FLAME = 21;
/** How long one day takes to roll past, and the most a whole roll may take however
 * many days it covers. */
const STEP_MS = 320;
const ROLL_MAX_MS = 1300;
const FLARE_MS = 1150;
/** The flame goes first; the number follows it. */
const LEAD_MS = 260;
/** How long after its screen comes to the front before anything starts: long
 * enough for the screen that was covering it to have slid away. */
const ARRIVE_MS = 480;
/** Three sparks: when each leaves, as a fraction of the flare, and which way. */
const SPARKS = [
  { at: 0.1, x: -11, y: -24 },
  { at: 0.2, x: 3, y: -31 },
  { at: 0.3, x: 13, y: -21 },
] as const;

/** One number in the roll. It places itself from the count alone — a row above the
 * line for every whole day it is behind, a row below for every day it is ahead —
 * so which numbers happen to be mounted never moves the ones that are. */
function Digit({ n, count }: { n: number; count: SharedValue<number> }) {
  const place = useAnimatedStyle(() => {
    const away = n - count.value;
    return {
      opacity: Math.max(0, 1 - Math.abs(away) * 1.6),
      transform: [{ translateY: away * LINE }],
    };
  });
  return <Animated.Text style={[styles.number, styles.rolling, place]}>{n}</Animated.Text>;
}

function Spark({ flare, at, x, y }: { flare: SharedValue<number>; at: number; x: number; y: number }) {
  const fly = useAnimatedStyle(() => {
    const p = Math.min(1, Math.max(0, (flare.value - at) / 0.55));
    // Out fast and slowing, the way anything thrown is.
    const out = 1 - (1 - p) * (1 - p);
    return {
      opacity: p <= 0 || p >= 1 ? 0 : 1 - p,
      transform: [{ translateX: x * out }, { translateY: y * out }, { scale: 1 - 0.45 * p }],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[styles.spark, fly]}>
      <HomeAsset name="flame" height={8} />
    </Animated.View>
  );
}

export function StreakPill({ value, seenKey, active = true }: {
  value: number;
  /** Where the last number this person was shown is kept. Without one, only a rise
   * while the pill is on screen is an occasion. */
  seenKey?: string | null;
  /** Whether the pill's screen is the one in front. While it is not, a new number is
   * held back rather than shown to nobody. */
  active?: boolean;
}) {
  const still = useReducedMotion();
  /** The roll's position: a whole number at rest, between two while it turns. */
  const count = useSharedValue(value);
  const flare = useSharedValue(0);
  const bump = useSharedValue(1);
  /** The numbers mounted: the one showing, and during a roll every one it passes. */
  const [span, setSpan] = useState<[number, number]>([value, value]);
  /** Nothing is drawn until the last-shown number has been read, or a streak that
   * grew overnight would show its new number for a frame before rolling up to it. */
  const [read, setRead] = useState(!seenKey);
  const shown = useRef(value);
  const first = useRef(true);

  useEffect(() => {
    // Not in front: keep showing what was last shown, and leave the new number for
    // when there is somebody to see it arrive.
    if (!active) return;
    let gone = false;
    let tidy: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let seen: number | null = null;
      if (seenKey) {
        try {
          const raw = await AsyncStorage.getItem(seenKey);
          seen = raw === null ? null : Number(raw);
        } catch { /* a nicety, not data: without it the number is simply shown */ }
      }
      if (gone) return;
      // Arriving, the comparison is with what was last shown, whenever that was.
      // After that it is with what is on screen.
      const from = first.current ? (Number.isFinite(seen) && seen !== null ? seen : value) : shown.current;
      first.current = false;
      shown.current = value;
      if (seenKey && seen !== value) AsyncStorage.setItem(seenKey, String(value)).catch(() => {});

      if (value > from && !still) {
        const days = value - from;
        const roll = Math.min(ROLL_MAX_MS, days * STEP_MS);
        setSpan([from, value]);
        count.value = from;
        count.value = withDelay(ARRIVE_MS + LEAD_MS,
          withTiming(value, { duration: roll, easing: Easing.out(Easing.cubic) }));
        flare.value = 0;
        flare.value = withDelay(ARRIVE_MS, withTiming(1, { duration: FLARE_MS, easing: Easing.linear }));
        bump.value = withDelay(ARRIVE_MS + LEAD_MS, withSequence(
          withTiming(1.08, { duration: 130, easing: Easing.out(Easing.quad) }),
          withSpring(1, { damping: 9, stiffness: 240 }),
        ));
        // Once it has settled, the numbers it passed are let go.
        tidy = setTimeout(() => { if (!gone) setSpan([value, value]); }, ARRIVE_MS + LEAD_MS + roll + 400);
      } else {
        count.value = value;
        setSpan([value, value]);
      }
      setRead(true);
    })();
    return () => { gone = true; if (tidy) clearTimeout(tidy); };
  }, [active, bump, count, flare, seenKey, still, value]);

  // The flame flares from its foot: taller, then under, then a smaller second lick,
  // leaning one way and the other as it goes.
  const flame = useAnimatedStyle(() => {
    const f = flare.value;
    const grow = interpolate(f, [0, 0.14, 0.32, 0.5, 0.7, 1], [1, 1.55, 0.92, 1.22, 0.98, 1]);
    const lean = interpolate(f, [0, 0.14, 0.32, 0.5, 0.7, 1], [0, -12, 9, -6, 3, 0]);
    return {
      transform: [{ translateY: -(grow - 1) * FLAME / 2 }, { rotate: `${lean}deg` }, { scale: grow }],
    };
  });
  // And leaves a larger, fainter one behind it for a moment.
  const echo = useAnimatedStyle(() => {
    const p = Math.min(1, flare.value / 0.55);
    return {
      opacity: p <= 0 || p >= 1 ? 0 : 0.42 * (1 - p),
      transform: [{ translateY: -p * FLAME * 0.6 }, { scale: 1 + p * 1.5 }],
    };
  });
  const lifted = useAnimatedStyle(() => ({ transform: [{ scale: bump.value }] }));

  const numbers: number[] = [];
  for (let n = span[0]; n <= span[1]; n++) numbers.push(n);

  return (
    <Animated.View style={[styles.shell, lifted]} accessible accessibilityLabel={`${value}-day streak`}>
      <View style={styles.face}>
        <View style={styles.flame}>
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, echo]}>
            <HomeAsset name="flame" />
          </Animated.View>
          {SPARKS.map((s) => <Spark key={s.at} flare={flare} {...s} />)}
          <Animated.View style={flame}><HomeAsset name="flame" /></Animated.View>
        </View>
        <View style={[styles.window, !read && styles.unread]}>
          {/* Holds the width open for the widest number in the roll; the numbers
              themselves are laid over it. */}
          <Text style={[styles.number, styles.sizer]}>{span[1]}</Text>
          {numbers.map((n) => <Digit key={n} n={n} count={count} />)}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: { height: 40, borderRadius: 27, backgroundColor: homeColors.streakBorder, paddingBottom: 2 },
  face: {
    flex: 1, borderRadius: 27, backgroundColor: homeColors.white, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  flame: { alignItems: 'center', justifyContent: 'center' },
  spark: { position: 'absolute', top: 2 },
  // One line tall and closed above and below it: a number is only seen while it is
  // on the line.
  window: { height: LINE, overflow: 'hidden', justifyContent: 'center' },
  unread: { opacity: 0 },
  number: { fontFamily: 'Geist_600SemiBold', fontSize: 22, lineHeight: LINE, color: homeColors.black },
  sizer: { opacity: 0 },
  rolling: { position: 'absolute', left: 0, right: 0, top: 0 },
});
