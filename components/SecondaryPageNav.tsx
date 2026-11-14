import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';
import { colors } from '@/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SecondaryPageNavProps {
  onBack: () => void;
  backLabel?: string;
}

/** The back bar on a second-level page.
 *
 * No rule under it. It used to draw one by default, which put a hairline across the
 * top of every settings page — under a gradient that is already a background in its
 * own right, and above content that is already separated from it by a gap. Two of
 * the newer screens had turned it off one at a time; the rest had it because it was
 * the default rather than because anyone chose it. */
export function SecondaryPageNav({
  onBack,
  backLabel = '← Profile',
}: SecondaryPageNavProps) {
  return (
    <View style={styles.header}>
      <TouchableOpacity accessibilityLabel="Go back" onPress={onBack} activeOpacity={0.7} accessibilityRole="button" style={styles.backButton}>
        <Text style={styles.navBack}>{backLabel}</Text>
      </TouchableOpacity>
      <View style={styles.navRightSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenInline,
    paddingTop: 14,
    paddingBottom: 14,
  },
  backButton: { minHeight: 44, justifyContent: 'center' },
  navBack: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.muted,
    fontFamily: fonts.regular,
    fontWeight: '400',
  },
  navRightSpacer: {
    width: 52,
  },
});
