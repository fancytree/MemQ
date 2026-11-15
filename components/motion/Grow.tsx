import { useEffect, useRef, useState } from 'react';
import { Text, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming, type SharedValue,
} from 'react-native-reanimated';

/** How numbers arrive.
 *
 * A screen's numbers come after the screen does, and a number that simply appears
 * reads as a number that was always there. These grow into place instead: a count
 * counts up to its value, a progress bar fills to its length. They move when the
 * value changes, not each time the screen is shown — coming back to the same
 * numbers shows them still — and with reduced motion they are simply there.
 *
 * Used by Today, Library and the You page, so a number arrives the same way
 * wherever it is.
 */
export const GROW_MS = 620;
const EASE = Easing.out(Easing.cubic);

/** A value that follows `target`, easing to it after `delay`. It starts at zero, so
 * the first real value grows in from nothing. */
export function useEased(target: number, delay = 0, ms = GROW_MS): SharedValue<number> {
  const still = useReducedMotion();
  const value = useSharedValue(still ? target : 0);
  useEffect(() => {
    value.value = still ? target : withDelay(delay, withTiming(target, { duration: ms, easing: EASE }));
  }, [target, delay, ms, still, value]);
  return value;
}

/** A whole number that counts to its value instead of jumping to it. */
export function CountUp({ value, style, delay = 0 }: { value: number; style?: StyleProp<TextStyle>; delay?: number }) {
  const still = useReducedMotion();
  const [shown, setShown] = useState(still ? value : 0);
  const from = useRef(still ? value : 0);
  useEffect(() => {
    const start = from.current;
    if (still || start === value) { setShown(value); from.current = value; return; }
    const began = Date.now() + delay;
    let frame = 0;
    const tick = () => {
      const p = Math.min(1, Math.max(0, (Date.now() - began) / GROW_MS));
      setShown(Math.round(start + (value - start) * (1 - (1 - p) ** 3)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); from.current = value; };
  }, [value, still, delay]);
  return <Text style={style}>{shown}</Text>;
}

/** The filled part of a progress track, growing from the left to `pct` percent.
 * Give it the fill's own style; the track around it stays as it is. */
export function ProgressFill({ pct, delay = 0, style }: { pct: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const grown = useEased(Math.max(0, Math.min(100, pct)), delay, GROW_MS + 180);
  const width = useAnimatedStyle(() => ({ width: `${grown.value}%` }));
  return <Animated.View style={[style, width]} />;
}
