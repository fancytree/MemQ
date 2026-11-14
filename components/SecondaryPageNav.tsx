import { BackButton } from '@/components/ui/RoundButtons';
import { layout } from '@/theme/spacing';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

interface SecondaryPageNavProps {
  onBack: () => void;
  backLabel?: string;
  /** A page's own action for this bar — the gear, say. It sits opposite the arrow,
   *  where the eye already looks for it, rather than down in the page's first row. */
  right?: ReactNode;
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
  right,
}: SecondaryPageNavProps) {
  // The arrow is the button now, so the destination is no longer written on the
  // screen — but it is still worth saying out loud, so the label each page already
  // passes becomes the spoken one.
  const where = backLabel.replace(/^[\s←]+/, '').trim();
  return (
    <View style={styles.header}>
      <BackButton onPress={onBack}
        label={where && where.toLowerCase() !== 'back' ? `Back to ${where}` : 'Back'} />
      {right ?? <View style={styles.navRightSpacer} />}
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
  navRightSpacer: {
    width: 52,
  },
});
