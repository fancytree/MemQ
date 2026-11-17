import { Icon } from '@/components/ui/Icon';
import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
import { type } from '@/theme/typography';
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
import { MascotRig, RIG_HAND_LINE } from '@/components/mascot/rig/MascotRig';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { useSubscription } from '@/context/SubscriptionContext';
import { safeBack } from '@/lib/safeBack';
import { ledge } from '@/theme/ledge';
import { space, radius, layout } from '@/theme/spacing';
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
import { Button } from '@/components/ui/Button';
import { colors } from '@/theme/colors';

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
const HAND_LINE = RIG_HAND_LINE;
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
        colors={[colors.limePale, colors.limeBright, colors.limeSurface, colors.bg]}
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
          <Icon name="zap" size={16} color={colors.action} />
          <Text style={styles.pillText}>MemQ Pro</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Unlock the full stack</Text>
        <Text style={styles.subtitle}>Break the limits and study without boundaries.</Text>

        {/* Body behind the card, hands over its front edge — the character holds what
            you get the way it holds the setup questions on the first run. */}
        <MascotRig width={PERCH} mood="excited" calm style={styles.perch}
          behind={(
            <Card corner="xl" pad="lg" gap={space[5]} style={[styles.card, { marginLeft: bleed, marginRight: bleed }]}>
                {FEATURES.map((feature) => (
                  <View key={feature.title} style={styles.feature}>
                    <View style={styles.tick}>
                      <Icon name="check" size={14} color={colors.surf} />
                    </View>
                    <View style={styles.featureBody}>
                      <Text style={styles.featureTitle}>{feature.title}</Text>
                      <Text style={styles.featureText}>{feature.body}</Text>
                    </View>
                  </View>
                ))}
            </Card>
          )} />
      </ScrollView>

      <SafeAreaView edges={['bottom']}>
        <View style={styles.footer}>
          <Text style={styles.hint}>7-day free trial · Cancel anytime</Text>
          <Button size="xl" label="Start free trial" onPress={() => setShowPaywallModal(true)} />
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
  // Ridden up under the character's hands, so it reads as the thing being held.
  card: { marginTop: CARD_LIFT },
  root: { flex: 1, backgroundColor: colors.bg },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 113, left: -19 },
  waveFront: { position: 'absolute', top: 150, left: -19 },

  scroll: { flex: 1 },
  // Centred in what is left between the nav and the button, so the character and the
  // card it holds sit in the middle of the screen rather than pinned under the nav.
  content: {
    flexGrow: 1, justifyContent: 'center',
    paddingHorizontal: layout.screenInline, paddingBottom: space[5],
  },

  // The same shape the Today heading wears: a soft translucent lozenge, not a tracked
  // capitalised kicker.
  pill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[1],
    paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.pill,
    backgroundColor: colors.veil,
  },
  pillText: { ...type.body, fontFamily: 'Geist_500Medium', color: colors.text },
  title: {
    ...oneLine(type.title), fontFamily: 'Geist_800ExtraBold',
    marginTop: space[3],
    letterSpacing: -1.1,
    color: colors.text,
  },
  subtitle: {
    ...type.body, fontFamily: 'Geist_500Medium',
    marginTop: space[2],
    marginBottom: space[8],
    color: colors.sub,
  },

  perch: { alignSelf: 'center' },
  // Ridden up under the character's hands, so it reads as the thing being held.

  feature: { flexDirection: 'row', gap: space[3] },
  tick: {
    width: 24, height: 24, borderRadius: radius.md, marginTop: space[0],
    backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center',
  },
  featureBody: { flex: 1, gap: space[1] },
  featureTitle: { ...type.body, fontFamily: 'Geist_600SemiBold', color: colors.text },
  featureText: { ...type.small, fontFamily: 'Geist_400Regular', color: colors.faint },

  footer: { paddingHorizontal: layout.screenInline, paddingTop: space[3], gap: space[3] },
  hint: {
    ...type.small, fontFamily: 'Geist_500Medium',
    color: colors.faint,
    textAlign: 'center',
  },
  lead: {
    height: 59 + ledge.lead, borderRadius: radius.pill,
    backgroundColor: colors.actionShell, paddingBottom: ledge.lead,
  },
  leadFace: {
    flex: 1, borderRadius: radius.pill, backgroundColor: colors.action,
    alignItems: 'center', justifyContent: 'center',
  },
  leadText: { ...type.heading, fontFamily: 'Geist_500Medium', color: colors.surf },

  legal: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: space[2],
  },
  legalLink: {
    ...type.caption, fontFamily: 'Geist_400Regular',
    color: colors.faint,
    textDecorationLine: 'underline',
  },
  legalSep: { ...type.caption, fontFamily: 'Geist_400Regular', color: colors.faint },
});
