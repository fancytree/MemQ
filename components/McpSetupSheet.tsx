/**
 * How to make lessons from somewhere else.
 *
 * MemQ can be connected to an app that speaks MCP, which can then create lessons
 * and cards in this account. Connected apps (under Settings) lists what is
 * connected and lets you disconnect — but nothing anywhere said how to connect in
 * the first place, which is the half a person actually needs.
 *
 * It is shown from New Lesson, behind the same EXPO_PUBLIC_MCP_ENABLED flag that
 * hides Connected apps, so it appears only in a build where connecting works.
 */

import { CloseButton } from '@/components/ui/RoundButtons';
import { mcpServerUrl as serverUrl, setMcpGuidanceDismissed } from '@/lib/mcp';
import { fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { sheet } from '@/theme/sheet';
import { layout } from '@/theme/spacing';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


const STEPS: { title: string; body: string }[] = [
  {
    title: 'Add MemQ in the other app',
    body: serverUrl
      ? 'Open where it keeps its connectors and add MemQ using the address below.'
      : 'Open where it keeps its connectors and add MemQ.',
  },
  {
    title: 'Sign in and approve',
    body: 'It sends you here to sign in to MemQ and say yes. Nothing is shared until you do.',
  },
  {
    title: 'Ask it for a lesson',
    body: 'Say what you want to learn. The lesson and its cards show up in your library.',
  },
];

export function McpSetupSheet({ visible, onClose, offerDismiss = false }: {
  visible: boolean;
  onClose: () => void;
  /** Shown when it opened by itself: the way to stop it doing that. */
  offerDismiss?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [dismissed, setDismissed] = useState(false);
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent
      onRequestClose={onClose}>
      <View style={sheet.scrim}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close"
          style={StyleSheet.absoluteFill} onPress={onClose} />
        <View accessibilityViewIsModal style={[styles.surface, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={sheet.handle} />
          <View style={sheet.head}>
            <Text accessibilityRole="header" style={styles.title}>From another app</Text>
            <CloseButton onPress={onClose} label="Close" />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            <Text style={styles.intro}>
              MemQ can be connected to an app that writes lessons for you — one that speaks
              MCP, like Claude. Ask it for a lesson there and the cards land here.
            </Text>

            <View style={styles.card}><View style={styles.cardFace}>
              {STEPS.map((step, i) => (
                <View key={step.title} style={[styles.step, i > 0 && styles.stepGap]}>
                  <View style={styles.number}><Text style={styles.numberText}>{i + 1}</Text></View>
                  <View style={styles.stepCopy}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepBody}>{step.body}</Text>
                  </View>
                </View>
              ))}
            </View></View>

            {!!serverUrl && (
              <View style={styles.card}><View style={styles.cardFace}>
                <Text style={styles.addressLabel}>MemQ&apos;s address</Text>
                <Text selectable style={styles.address}>{serverUrl}</Text>
                <Text style={styles.addressHint}>Press and hold to copy.</Text>
              </View></View>
            )}

            <Text style={styles.later}>
              No rush. This lives in Settings under Connected apps, where you can also
              see what is connected and disconnect it.
            </Text>

            <Pressable accessibilityRole="button" accessibilityLabel="Open connected apps"
              onPress={() => { onClose(); router.push('/profile/connections' as never); }}
              style={styles.link}>
              <Text style={styles.linkText}>Open Connected apps</Text>
              <Feather name="arrow-right" size={18} color={homeColors.primary} />
            </Pressable>

            {offerDismiss && (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: dismissed }}
                accessibilityLabel="Don't show this again"
                onPress={() => { const next = !dismissed; setDismissed(next); void setMcpGuidanceDismissed(next); }}
                style={styles.dismissRow}>
                <View style={[styles.box, dismissed && styles.boxOn]}>
                  {dismissed && <Feather name="check" size={15} color={homeColors.white} />}
                </View>
                <Text style={styles.dismissText}>Don&apos;t show this again</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  surface: { ...sheet.surface, maxHeight: '86%', paddingTop: 0 },
  title: { fontFamily: fonts.display, fontSize: 23, lineHeight: 32, color: homeColors.deep },

  body: { paddingHorizontal: layout.screenInline, paddingBottom: 28, gap: 12 },
  intro: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: homeColors.muted },

  card: { borderRadius: 28, backgroundColor: homeColors.border, paddingBottom: ledge.raised },
  cardFace: { borderRadius: 28, backgroundColor: homeColors.white, padding: 18 },

  step: { flexDirection: 'row', gap: 14 },
  stepGap: { marginTop: 18 },
  number: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: homeColors.selected,
    alignItems: 'center', justifyContent: 'center',
  },
  numberText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.deep },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: homeColors.darkest },
  stepBody: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: homeColors.muted },

  addressLabel: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.darkest },
  address: {
    marginTop: 8, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21,
    color: homeColors.deep,
  },
  addressHint: { marginTop: 6, fontFamily: fonts.regular, fontSize: 13, color: homeColors.muted },

  later: {
    marginTop: 2, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21,
    color: homeColors.muted,
  },

  dismissRow: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10,
    alignSelf: 'center', paddingHorizontal: 4,
  },
  box: {
    width: 24, height: 24, borderRadius: 8, borderWidth: 2,
    borderColor: homeColors.border, alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { borderColor: homeColors.primary, backgroundColor: homeColors.primary },
  dismissText: { fontFamily: fonts.regular, fontSize: 14, color: homeColors.muted },

  link: {
    marginTop: 2, minHeight: 50, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
  },
  linkText: { fontFamily: fonts.semibold, fontSize: 15, color: homeColors.primary },
});
