/**
 * Where someone stands with the month's AI credits, as a card: the number left,
 * out of how many, and how far through them they are.
 *
 * Two places, one card. At the top of the credits page it is the one large
 * thing there. On the settings page it is the first thing under the name, and
 * pressing it opens that page — it used to be a row among the settings, under a
 * heading that said "AI", and looked like one more thing to configure. It is
 * not a setting; it is something the account has.
 *
 * So it is set the way the app sets the one thing a screen is for: reversed out
 * of the deep purple, with the lime the rest of the app is lit by as the measure
 * of how much is gone, and the lip of a deeper purple that the buttons stand on.
 * A pale version was tried on the settings page; its lip could not be seen
 * against the cream, and two purples for one card was one too many.
 *
 * The number counts up and the measure grows when the card arrives, as numbers
 * do everywhere else in the app (components/motion/Grow).
 */

import { CountUp, ProgressFill } from '@/components/motion/Grow';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import type { Credits } from '@/lib/aiCredits';
import { colors, fonts, radius, space, type } from '@/theme';
import { oneLine } from '@/theme/typography';
import { StyleSheet, Text, View } from 'react-native';

const count = (n: number) => n.toLocaleString('en-US');

export function CreditsCard({ credits, onPress }: {
  credits: Credits;
  /** Given where the card is the way in to the credits page. */
  onPress?: () => void;
}) {
  const share = Math.min(1, credits.used / credits.limit);
  return (
    <Card pad="lg" gap={space[4]} onPress={onPress} style={styles.shell} faceStyle={styles.face}
      accessibilityLabel={onPress
        ? `${count(credits.left)} of ${count(credits.limit)} AI credits left this month. Open AI credits.`
        : undefined}>
      {/* A spark far larger than the one in the tile, run off the corner. It is
          the same mark, so it says the same thing; at this size it is ground
          rather than sign. */}
      <View pointerEvents="none" style={styles.mark}>
        <Icon name="sparkle" size={MARK} color={colors.chartBar} />
      </View>
      <View style={styles.standing}>
        <View style={styles.spark}>
          <Icon name="sparkle" size={22} color={colors.action} />
        </View>
        <View style={styles.figures} accessible accessibilityLabel={`${count(credits.left)} of ${count(credits.limit)} AI credits left this month`}>
          <CountUp value={credits.left} format={count} style={styles.left} />
          <Text style={styles.of}>of {count(credits.limit)} AI credits left this month</Text>
        </View>
        {onPress && <View style={styles.go}><Icon name="chevronRight" size={20} color={colors.tint} /></View>}
      </View>
      <View style={styles.track} accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: credits.limit, now: credits.used }}>
        <ProgressFill pct={share * 100} style={styles.fill} />
      </View>
      <Text style={styles.note}>
        {credits.out ? `All used. Back to ${count(credits.limit)} on ${credits.resets}.` : `Back to ${count(credits.limit)} on ${credits.resets}.`}
      </Text>
    </Card>
  );
}

const SPARK = 48;
/** The share of the display face's size left blank above a line of figures. */
const CAP_GAP = 0.38;
/** How large the spark behind the card is drawn. */
const MARK = 168;

const styles = StyleSheet.create({
  // The lip under a deep face is the deeper purple the buttons stand on.
  shell: { backgroundColor: colors.actionShell },
  face: { backgroundColor: colors.action, overflow: 'hidden' },
  mark: { position: 'absolute', right: -MARK * 0.22, top: -MARK * 0.2, opacity: 0.35 },
  // From the top, not the middle. The figure and its caption are two lines of
  // different sizes; centred against the tile, the large number rode above the
  // tile's top edge and nothing in the row shared a line. The tile's top and the
  // number's top are the edge everything hangs from.
  standing: { flexDirection: 'row', alignItems: 'flex-start', gap: space[4] },
  spark: {
    width: SPARK, height: SPARK, borderRadius: radius.md, backgroundColor: colors.surf,
    alignItems: 'center', justifyContent: 'center',
  },
  figures: { flex: 1 },
  // One line, so with its leading off: iOS puts a line's leading above the
  // glyphs, which would drop the number below the top edge it is meant to share.
  // And pulled up by what the display face keeps empty above its figures — a
  // little over a third of its size, measured — so it is the tops of the digits,
  // not the top of their box, that sit on the tile's top edge.
  left: { ...oneLine(type.display), color: colors.surf, marginTop: -Math.round(type.display.fontSize * CAP_GAP) },
  of: { ...type.small, color: colors.tint },
  // The way in, level with the tile rather than with the top edge.
  go: { height: SPARK, justifyContent: 'center' },
  track: { height: space[2], borderRadius: radius.pill, backgroundColor: colors.actionShell, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.limeBright },
  note: { ...type.caption, fontFamily: fonts.regular, color: colors.tint },
});
