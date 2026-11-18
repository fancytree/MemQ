/**
 * AI credits: how many are left, what uses them, where they went, and what more
 * there could be.
 *
 * The tag on Today and on the You page (components/CreditsChip) and the card on
 * the settings page (components/CreditsCard) open this.
 * A number in a tag raises three questions — of how many, spent on what, and can
 * I have more — and this page is the answers, in that order.
 *
 * The record is this month's only, because the month is what the number is
 * counted over; last month's uses explain nothing about what is left now.
 */

import { ChatTopBar } from '@/components/chat/ChatTopBar';
import { CreditsCard } from '@/components/CreditsCard';
import { EdBase } from '@/components/EdBase';
import { OwnAiEntry } from '@/components/OwnAiEntry';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useSubscription } from '@/context/SubscriptionContext';
import { CREDIT_LIMIT, CREDIT_PRICES, creditHistory, type CreditUse } from '@/lib/aiCredits';
import { getCreditUses } from '@/lib/aiUsage';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { useCredits } from '@/lib/useCredits';
import { colors, fonts, hairline, layout, space, type } from '@/theme';
import { Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const count = (n: number) => n.toLocaleString('en-US');

export default function CreditsScreen() {
  const { showPaywall } = useSubscription();
  const { credits } = useCredits();
  /** Null while it is being read, so "nothing used" is not said before it is known. */
  const [uses, setUses] = useState<CreditUse[] | null>(null);

  useFocusEffect(useCallback(() => {
    let live = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const found = data.user ? await getCreditUses(data.user.id) : [];
      if (live) setUses(found);
    })();
    return () => { live = false; };
  }, []));

  const entries = useMemo(() => creditHistory(uses ?? []), [uses]);

  return (
    <EdBase scroll={false} bottomInset={0}>
      <Stack.Screen options={{ headerShown: false }} />
      <ChatTopBar title="AI credits" onClose={() => safeBack('/(tabs)')} started={false} onClear={() => {}} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* How many are left. The one large thing on the page. */}
        {credits && <CreditsCard credits={credits} />}

        {/* More of them, for an account that could have more — and the way that
            costs nothing, which is the honest thing to put beside it. */}
        {credits && !credits.isPro && (
          <>
            <Card pad="lg" gap={space[3]} faceStyle={styles.pro}>
              <Text style={styles.proTitle}>{count(CREDIT_LIMIT.pro)} credits a month with Pro</Text>
              <Text style={styles.proBody}>
                {CREDIT_LIMIT.pro / CREDIT_LIMIT.free} times what a free account has, and longer PDFs.
              </Text>
              <Button label="See Pro" size="sm" width="full" onPress={() => void showPaywall()} />
            </Card>
            <OwnAiEntry />
          </>
        )}

        {/* What they are spent on. */}
        <View style={styles.block}>
          <Text accessibilityRole="header" style={styles.heading}>What uses credits</Text>
          <Card pad="none" gap={0}>
            {CREDIT_PRICES.map((price, at) => (
              <View key={price.name} style={[styles.row, at > 0 && styles.rule]}>
                <Text style={styles.rowName}>{price.name}</Text>
                <Text style={styles.rowCost}>{price.cost}</Text>
              </View>
            ))}
          </Card>
          <Text style={styles.note}>Practising, and making cards with your own AI, never use any.</Text>
        </View>

        {/* Where they went. One list, the day written on each line. */}
        <View style={styles.block}>
          <Text accessibilityRole="header" style={styles.heading}>Used this month</Text>
          {uses !== null && entries.length === 0 && (
            <Text style={styles.note}>Nothing yet. Each use will be listed here.</Text>
          )}
          {entries.length > 0 && (
            <Card pad="none" gap={0}>
              {entries.map((entry, at) => (
                <View key={entry.id} style={[styles.row, at > 0 && styles.rule]}>
                  <View style={styles.use}>
                    <Text style={styles.rowName}>{entry.name}</Text>
                    <Text style={styles.time}>{entry.when}</Text>
                  </View>
                  <Text style={styles.rowCost}>−{entry.cost}</Text>
                </View>
              ))}
            </Card>
          )}
        </View>
      </ScrollView>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenInline, paddingBottom: space[8], gap: space[4] },

  note: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },

  pro: { backgroundColor: colors.tint },
  proTitle: { ...type.heading, color: colors.text },
  proBody: { ...type.small, color: colors.sub },

  block: { gap: space[2] },
  // A heading, not a label: under the card at the top this page has two parts,
  // and each is named at the size the settings page names its own.
  heading: { ...type.heading, color: colors.text, marginTop: space[2] },
  row: {
    minHeight: 52, paddingHorizontal: space[4], paddingVertical: space[3],
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3],
  },
  rule: { borderTopWidth: hairline, borderTopColor: colors.line },
  rowName: { ...type.body, color: colors.text },
  rowCost: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  use: { flex: 1, gap: space.hair },
  time: { ...type.caption, fontFamily: fonts.regular, color: colors.sub },
});
