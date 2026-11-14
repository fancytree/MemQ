import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { fonts } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, interpolateColor, useAnimatedStyle, useDerivedValue, useReducedMotion, withTiming,
} from 'react-native-reanimated';

type LearningMode = 'knowledge' | 'language';

const TRACK_W = 54;
const TRACK_H = 32;
const THUMB = 26;
const PAD = (TRACK_H - THUMB) / 2;

/** Knowledge is the default; the switch enables the language-specific flow.
 *
 * The switch is drawn rather than borrowed. The platform one arrives in its own grey
 * with its own green or blue, which is the one control on these screens that belongs
 * to no palette; here the track takes the action purple when it is on and the card's
 * own shell colour when it is off, and the thumb slides between them.
 */
export function LearningModeSelector({ value, onChange, disabled = false }: {
  value: LearningMode;
  onChange: (value: LearningMode) => void;
  disabled?: boolean;
}) {
  const isLanguage = value === 'language';
  const reduce = useReducedMotion();
  const at = useDerivedValue(() => {
    const to = isLanguage ? 1 : 0;
    return reduce ? to : withTiming(to, { duration: 190, easing: Easing.out(Easing.cubic) });
  }, [isLanguage, reduce]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(at.value, [0, 1], [homeColors.border, homeColors.primary]),
  }));
  const thumb = useAnimatedStyle(() => ({
    transform: [{ translateX: at.value * (TRACK_W - THUMB - PAD * 2) }],
  }));

  return (
    <View style={styles.row}>
      <View style={styles.face}>
        <View style={styles.icon}><Feather name="globe" size={19} color={homeColors.deep} /></View>
        <Text style={styles.label}>Language</Text>
        <Pressable accessibilityRole="switch"
          accessibilityLabel="Language learning mode"
          accessibilityHint="When off, the lesson uses Knowledge mode."
          accessibilityState={{ checked: isLanguage, disabled }}
          disabled={disabled}
          hitSlop={8}
          onPress={() => onChange(isLanguage ? 'knowledge' : 'language')}>
          <Animated.View style={[styles.track, disabled && styles.trackOff, track]}>
            <Animated.View style={[styles.thumb, thumb]} />
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A shell with a lighter face on it, offset so a band of the shell shows along the
  // bottom edge — the same depth every other raised surface in the app carries. It
  // was a hairline outline, which is the older style.
  row: { borderRadius: 24, backgroundColor: homeColors.border, paddingBottom: ledge.raised },
  face: {
    minHeight: 64, borderRadius: 24, backgroundColor: homeColors.white,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  icon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: homeColors.selected,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: homeColors.darkest },

  track: {
    width: TRACK_W, height: TRACK_H, borderRadius: TRACK_H / 2,
    padding: PAD, justifyContent: 'center',
  },
  trackOff: { opacity: 0.45 },
  thumb: {
    width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: homeColors.white,
  },
});
