import { space } from '@/theme/spacing';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { MascotRig } from '@/components/mascot/rig/MascotRig';
import { type, fonts } from '@/theme/typography';
import { colors } from '@/theme/colors';

/** A page waiting for its own content: the character, happy and hopping, and one
 * short line. (Not the working mood: its face is a frown.)
 *
 * The in-page sibling of LoadingScreen. That one covers everything, wordmark and
 * all, because nothing can be done until it is finished; this one sits in the
 * page under its own bar, so the way back stays where it is.
 *
 * It does not appear at once. Most loads are over in a moment, and a character
 * that blinks onto the screen and straight off again is worse than nothing, so it
 * fades in only once the wait has gone on long enough to notice.
 */
const WAIT_MS = 220;

export function MascotLoading({ label = 'Loading…', width = 140, style }: {
  label?: string;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.wrap, style]} accessible accessibilityRole="progressbar" accessibilityLabel={label}>
      <Animated.View entering={FadeIn.delay(WAIT_MS).duration(240)} style={styles.inner}>
        <MascotRig width={width} mood="happy" calm />
        {!!label && <Text style={styles.label}>{label}</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', gap: space[2] },
  label: { ...type.small, fontFamily: fonts.medium, color: colors.faint },
});
