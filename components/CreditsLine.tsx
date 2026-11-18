/**
 * Where someone stands with the month's AI credits, in one line.
 *
 * Under the box on the create screens it is always there for a free account:
 * that is where credits are spent three at a time, and a number that only shows
 * up when it is nearly gone is a number nobody planned around. Everywhere else
 * — the chat, a paying account — it stays out of the way until there is little
 * left, and then says so.
 *
 * Pro is offered beside it only when it would help: when little is left or none.
 * Never to someone who already pays.
 *
 * The line can be tapped. "Credits" is our word, so the person who wonders what
 * one is can open the page that says — what they are spent on, where this
 * month's went (app/credits.tsx) — rather than being left to work it out from
 * what disappears.
 */

import { creditsLabel, type Credits } from '@/lib/aiCredits';
import { colors, fonts, space, type } from '@/theme';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

export function CreditsLine({ credits, always = false, onUpgrade, style }: {
  /** Null while it is not known: nothing is drawn. */
  credits: Credits | null;
  /** Show it even when plenty is left. For the place credits are mostly spent. */
  always?: boolean;
  onUpgrade: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!credits) return null;
  // A paying account is only told when it is running low; nobody else needs it
  // in the chat until it matters.
  if (!credits.low && (credits.isPro || !always)) return null;
  const offer = !credits.isPro && credits.low;
  return (
    <View style={[styles.line, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${creditsLabel(credits)}. Open AI credits.`}
        hitSlop={space[2]}
        onPress={() => router.push('/credits' as never)}
        style={styles.words}
      >
        <Text style={[styles.text, credits.out && styles.out]}>{creditsLabel(credits)}</Text>
      </Pressable>
      {offer && (
        <Pressable accessibilityRole="button" onPress={onUpgrade} hitSlop={space[2]} style={styles.offer}>
          <Text style={styles.offerText}>See Pro</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[2], minHeight: 28 },
  words: { flexShrink: 1 },
  text: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
  out: { color: colors.text, fontFamily: fonts.medium },
  offer: { justifyContent: 'center' },
  offerText: { ...type.caption, fontFamily: fonts.semibold, color: colors.action },
});
