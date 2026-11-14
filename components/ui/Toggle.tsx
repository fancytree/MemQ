import { homeColors } from '@/theme/colors';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useDerivedValue, useReducedMotion, withTiming,
} from 'react-native-reanimated';

const TRACK_W = 54;
const TRACK_H = 32;
const THUMB = 26;
const PAD = (TRACK_H - THUMB) / 2;
const TRAVEL = TRACK_W - THUMB - PAD * 2;

/** An on/off switch, drawn rather than borrowed.
 *
 * The platform's arrives in its own grey and slides to its own green or blue, which
 * makes it the one control on a screen that belongs to no palette — and it looked it,
 * sitting next to surfaces built out of this one. Here the track takes the card's own
 * shell colour when it is off and the action purple when it is on.
 *
 * It keeps the switch role, the checked state and the disabled state a platform
 * control carries, so nothing changes for anyone reading the screen rather than
 * looking at it.
 */
export function Toggle({ value, onValueChange, disabled = false, label, hint }: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const reduce = useReducedMotion();
  const at = useDerivedValue(() => {
    const to = value ? 1 : 0;
    return reduce ? to : withTiming(to, { duration: 190, easing: Easing.out(Easing.cubic) });
  }, [value, reduce]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(at.value, [0, 1], [homeColors.border, homeColors.primary]),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: at.value * TRAVEL }],
  }));

  return (
    <Pressable accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onValueChange(!value)}>
      <Animated.View style={[styles.track, disabled && styles.off, track]}>
        <Animated.View style={[styles.thumb, thumb]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2,
    padding: PAD, justifyContent: 'center',
  },
  off: { opacity: 0.45 },
  thumb: {
    width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: homeColors.white,
  },
});
