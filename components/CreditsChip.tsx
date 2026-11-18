/**
 * The month's AI credits as a small tag: a spark and the number left.
 *
 * On Today and on the You page, where someone glances rather than reads. It
 * is the same shape as the streak beside it — a number that is theirs, kept in
 * view — and pressing it opens the page that says where the credits went and
 * what more there could be (app/credits.tsx).
 *
 * Nothing is drawn until the number is known. A tag that says 50 and then
 * corrects itself to 12 is worse than one that arrives a moment late.
 */

import { Icon } from '@/components/ui/Icon';
import { creditsLabel } from '@/lib/aiCredits';
import { useCredits } from '@/lib/useCredits';
import { colors, fonts, radius, space, type } from '@/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export function CreditsChip({ size = 'md', style }: {
  /** `md` is the pill that pairs with the streak in a top bar. `sm` is a flat
   *  tag for sitting on a line with other tags, under a name. */
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}) {
  const { credits } = useCredits();
  if (!credits) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${creditsLabel(credits)}. Open AI credits.`}
      onPress={() => router.push('/credits' as never)}
      hitSlop={size === 'sm' ? space[2] : undefined}
      style={({ pressed }) => (size === 'sm'
        ? [styles.small, pressed && styles.faded, style]
        : [styles.shell, pressed && styles.pressed, style])}
    >
      {size === 'sm' ? (
        <>
          <Icon name="sparkle" size={13} color={colors.action} />
          <Text style={styles.smallNumber}>{credits.left.toLocaleString('en-US')}</Text>
        </>
      ) : (
        <View style={styles.face}>
          <Icon name="sparkle" size={16} color={colors.action} />
          <Text style={styles.number}>{credits.left.toLocaleString('en-US')}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The streak pill's measures (components/ui/StreakPill), so the two sit as a pair.
  shell: { height: 40, borderRadius: radius.lg, backgroundColor: colors.chartSoft, paddingBottom: space.hair },
  pressed: { paddingBottom: 0, marginTop: space.hair },
  // The tint the app uses for AI — the "Ask a question" tile on Today is the
  // same — so the tag is told from the streak beside it at a glance, and says
  // what kind of number it is before it is read. Tinted rather than solid: a
  // solid purple here would be a second primary button above the first.
  face: {
    flex: 1, borderRadius: radius.lg, backgroundColor: colors.tint, paddingHorizontal: space[3],
    flexDirection: 'row', alignItems: 'center', gap: space[1],
  },
  number: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  // The PRO badge's box exactly (app/you.tsx): the same line of type, the same
  // padding, and a border of the same width — in the tag's own colour, so it is
  // not seen but still counted. Set to a height of its own it stood a few points
  // taller than the badge beside it, and two tags on one line that are nearly
  // the same size look like a mistake.
  small: {
    borderWidth: 1, borderColor: colors.tint, borderRadius: radius.pill, backgroundColor: colors.tint,
    paddingHorizontal: space[2], paddingVertical: space.hair,
    flexDirection: 'row', alignItems: 'center', gap: space.hair,
  },
  smallNumber: { ...type.caption, fontFamily: fonts.bold, color: colors.text },
  faded: { opacity: 0.6 },
});
