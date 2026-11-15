import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { MascotRig } from '@/components/mascot/rig/MascotRig';
import { homeColors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

/** A page waiting for its own content: the character at work, and one short line.
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
        <MascotRig width={width} mood="working" calm />
        {!!label && <Text style={styles.label}>{label}</Text>}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inner: { alignItems: 'center', gap: 8 },
  label: { fontFamily: fonts.medium, fontSize: 15, color: homeColors.muted },
});
