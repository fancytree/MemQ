import type { ReactNode } from 'react';
import {
  Pressable, StyleSheet,
  type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';

/** A lipped button that presses flat.
 *
 * Every raised thing in this app is a darker shell with a lighter face sitting on
 * it, offset so a band of the shell shows along the bottom edge (theme/ledge.ts).
 * That band is the button's height off the page, so pressing it should use it up:
 * the face travels down by exactly the lip and the lip is gone. Dimming the button,
 * or shrinking it, says something happened; this says what — it went down.
 *
 * It takes the place of the `Pressable` that was the shell, and is styled the way
 * that one was: the shell's colour as `backgroundColor`, the lip as `paddingBottom`,
 * the face as its child. Nothing about a button's layout changes by switching to
 * it. Under it the shell is drawn as its own layer, so that it can be drawn shorter:
 * pressed, its top comes down with the face and it is exactly hidden behind it.
 *
 * Only for things that do something when pressed. A card that only holds content
 * has a lip too, and is not asking to be pushed; a card that opens something is a
 * button, and presses like one.
 */
type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Down is quick and lands; up is a spring, so the button comes back with a little
 * life in it. A tap shorter than the way down still goes all the way down first —
 * a button that only flinches has not been pressed. */
const DOWN = { duration: 70, easing: Easing.out(Easing.quad) } as const;
const UP = { damping: 13, stiffness: 420, mass: 0.6 } as const;

export function LedgePressable({ style, children, onPressIn, onPressOut, ...props }: Props) {
  // The shell's colour and the layout of what is on it are lifted off the
  // pressable: the colour goes to the layer that can shorten, and the layout to the
  // layer that travels.
  const {
    backgroundColor, alignItems, justifyContent, flexDirection, gap, ...box
  } = StyleSheet.flatten(style) ?? {};
  const lip = typeof box.paddingBottom === 'number' ? box.paddingBottom : 0;
  // A shell given a height has room the face must fill. One that is as tall as its
  // content has none, and must not be told to grow: under a parent that offers it
  // more height than it needs, a growing child makes the shell take all of it, and
  // the button comes out as a face with a slab of shell hanging below.
  const fills = box.height !== undefined;
  const floor = !fills && typeof box.minHeight === 'number' ? { minHeight: box.minHeight - lip } : null;
  const still = useReducedMotion();
  const press = useSharedValue(0);

  const down = (event: GestureResponderEvent) => {
    press.value = still ? 1 : withTiming(1, DOWN);
    onPressIn?.(event);
  };
  const up = (event: GestureResponderEvent) => {
    press.value = still ? 0 : withSequence(withTiming(1, DOWN), withSpring(0, UP));
    onPressOut?.(event);
  };

  // The face may overshoot on the way back; the shell may not, or its top edge
  // would rise above the button.
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: lip * press.value }] }));
  const shell = useAnimatedStyle(() => ({ top: lip * Math.min(1, Math.max(0, press.value)) }));

  return (
    <Pressable {...props} onPressIn={down} onPressOut={up} style={box}>
      <Animated.View pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor, borderRadius: box.borderRadius }, shell]} />
      <Animated.View style={[fills && styles.fills, floor, { alignItems, justifyContent, flexDirection, gap }, face]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The face of a shell of fixed height: everything in it but the lip.
  fills: { flexGrow: 1 },
});
