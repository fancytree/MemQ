/**
 * Unlock MemQ Pro — what the subscription is for, before any price is named.
 *
 * It is drawn in the language the rest of the app is drawn in: the gradient and the
 * drifting hill, the character, and surfaces that are a coloured shell with a lighter
 * face sitting on it, the band along the bottom edge standing in for a shadow
 * (theme/ledge.ts). It used to be the older editorial style — hairline rules, outlined
 * boxes, a kicker in tracked capitals — which made the one screen asking for money the
 * one screen that did not look like the app.
 *
 * The character holds the list of what you get, the way it holds the setup questions
 * on the first run. The price lives one step further on, in the plan sheet.
 */

import { HomeAsset } from '@/components/HomeAsset';
import { MASCOT_HANDS } from '@/components/mascot/figma-parts';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { useSubscription } from '@/context/SubscriptionContext';
import { safeBack } from '@/lib/safeBack';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const FEATURES = [
  {
    title: 'Unlimited PDF uploads',
    body: 'Break the 5-file lifetime limit. Upload every lecture slide, textbook, and note without worrying about quotas.',
  },
  {
    title: 'Unlimited AI chat',
    body: 'Remove the 8-message daily cap. Ask follow-up questions freely until you fully understand the concept.',
  },
];

/** How wide the character stands over the card it is holding. */
const PERCH = 150;

/** Where the card's top edge crosses the character, read off the hands rather than
 *  typed in: a little below their middle, so their lower part laps onto the card and
 *  they read as resting on the edge instead of hovering above it. The first run and
 *  the sign-in screens perch on the same line. */
const HAND_LINE = MASCOT_HANDS.reduce((sum, h) => sum + (h.box[1] + h.box[3]) / 2, 0)
  / MASCOT_HANDS.length / 256;
const CARD_LIFT = -(1 - (HAND_LINE + 7 / 256)) * PERCH;

export default function UnlockProScreen() {
  const { setShowPaywallModal } = useSubscription();
  const { width } = useWindowDimensions();
  // The card is nested inside the character's box, so it has to be pulled back out to
  // the width it would have had on its own.
  const bleed = -((width - layout.screenInline * 2) - PERCH) / 2;

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <LinearGradient pointerEvents="none"
        colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
        locations={[0, 0.21154, 0.44712, 1]}
        style={styles.background} />
      {/* Two hills, not one. A single one ends on a straight horizontal edge partway
          down the screen, which reads as the background stopping rather than as a
          landscape; the second crosses it and carries the colour down behind the card. */}
      <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
      <View pointerEvents="none" style={styles.waveFront}><HomeAsset name="waveFront" /></View>

      <SafeAreaView edges={['top']}>
        <SecondaryPageNav onBack={() => safeBack('/you')} backLabel="← Back" />
      </SafeAreaView>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.pill}>
          <Feather name="zap" size={16} color={homeColors.primary} />
          <Text style={styles.pillText}>MemQ Pro</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Unlock the full stack</Text>
        <Text style={styles.subtitle}>Break the limits and study without boundaries.</Text>

        {/* Body behind the card, hands over its front edge — the character holds what
            you get the way it holds the setup questions on the first run. */}
        <MascotCharacter width={PERCH} mood="excited" calm style={styles.perch}
          behind={(
            <View style={[styles.card, { marginLeft: bleed, marginRight: bleed }]}>
              <View style={styles.cardFace}>
                {FEATURES.map((feature) => (
                  <View key={feature.title} style={styles.feature}>
                    <View style={styles.tick}>
                      <Feather name="check" size={14} color={homeColors.white} />
                    </View>
                    <View style={styles.featureBody}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      <Text style={styles.featureText}>{feature.body}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )} />
      </ScrollView>

      <SafeAreaView edges={['bottom']}>
        <View style={styles.footer}>
          <Text style={styles.hint}>7-day free trial · Cancel anytime</Text>
          <Pressable accessibilityRole="button" style={styles.lead}
            onPress={() => setShowPaywallModal(true)}>
            <View style={styles.leadFace}>
              <Text style={styles.leadText}>Start free trial</Text>
            </View>
          </Pressable>
          <View style={styles.legal}>
            <Pressable accessibilityRole="button" onPress={() => Linking.openURL(APPLE_EULA_URL)}>
              <Text style={styles.legalLink}>Terms of Use (EULA)</Text>
            </Pressable>
            <Text style={styles.legalSep}>|</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/profile/privacy-policy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: homeColors.canvas },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 113, left: -19 },
  waveFront: { position: 'absolute', top: 150, left: -19 },

  scroll: { flex: 1 },
  // Centred in what is left between the nav and the button, so the character and the
  // card it holds sit in the middle of the screen rather than pinned under the nav.
  content: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: layout.screenInline, paddingBottom: 20,
  },

  // The same shape the Today heading wears: a soft translucent lozenge, not a tracked
  // capitalised kicker.
  pill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 36,
    backgroundColor: homeColors.focus,
  },
  pillText: {
    fontFamily: 'Geist_500Medium', fontSize: 16, color: homeColors.darkest,
  },
  title: {
    marginTop: 14,
    fontFamily: 'Geist_800ExtraBold', fontSize: 34, lineHeight: 38,
    letterSpacing: -1.1, color: homeColors.darkest,
  },
  subtitle: {
    marginTop: 10, marginBottom: 30,
    fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 22, color: homeColors.deep,
  },

  perch: { alignSelf: 'center' },
  // Ridden up under the character's hands, so it reads as the thing being held.
  card: {
    marginTop: CARD_LIFT,
    backgroundColor: homeColors.border, borderRadius: 32, paddingBottom: ledge.raised,
  },
  cardFace: {
    backgroundColor: homeColors.white, borderRadius: 32, padding: 20, gap: 20,
  },

  feature: { flexDirection: 'row', gap: 12 },
  tick: {
    width: 24, height: 24, borderRadius: 12, marginTop: 1,
    backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center',
  },
  featureBody: { flex: 1, gap: 4 },
  featureTitle: {
    fontFamily: 'Geist_600SemiBold', fontSize: 17, lineHeight: 24, color: homeColors.darkest,
  },
  featureText: {
    fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, color: homeColors.muted,
  },

  footer: { paddingHorizontal: layout.screenInline, paddingTop: 12, gap: 12 },
  hint: {
    fontFamily: 'Geist_500Medium', fontSize: 14, lineHeight: 20,
    color: homeColors.muted, textAlign: 'center',
  },
  lead: {
    height: 59 + ledge.lead, borderRadius: 42,
    backgroundColor: homeColors.deep, paddingBottom: ledge.lead,
  },
  leadFace: {
    flex: 1, borderRadius: 42, backgroundColor: homeColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  leadText: {
    fontFamily: 'Geist_500Medium', fontSize: 22, lineHeight: 30, color: homeColors.white,
  },

  legal: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  legalLink: {
    fontFamily: 'Geist_400Regular', fontSize: 13, color: homeColors.muted,
    textDecorationLine: 'underline',
  },
  legalSep: { fontFamily: 'Geist_400Regular', fontSize: 13, color: homeColors.muted },
});
