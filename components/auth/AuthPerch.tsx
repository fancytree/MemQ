import { Card } from '@/components/ui/Card';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeAsset } from '@/components/HomeAsset';
import { MascotRig, RIG_HAND_LINE, type MascotMood } from '@/components/mascot/rig/MascotRig';
import { BackButton } from '@/components/ui/RoundButtons';
import { space, radius, type, colors } from '@/theme';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';
import { Button } from '@/components/ui/Button';

/** The page the account's side doors are drawn on: forgetting a password and
 * setting a new one.
 *
 * They are reached from sign-in and lead back to it, so they stand on the same
 * ground — the hill, the character perched on a white card with its hands over the
 * front edge, one lipped button under it. A plain form on a white page here read as
 * having stepped out of the app to do it.
 */
const PERCH = 132;
/** How far the card rides up over the body, so the hands land on its top edge. */
const CARD_LIFT = -(1 - (RIG_HAND_LINE + 7 / 256)) * PERCH;

export function AuthPerch({
  title, copy, onBack, backLabel = 'Back', mood = 'onboarding', eyesShut, action, footer, children,
}: {
  title: string;
  /** One short line. */
  copy?: string;
  onBack: () => void;
  backLabel?: string;
  mood?: MascotMood;
  /** Covers its eyes while a password is being typed, the way sign-in's does. */
  eyesShut?: boolean;
  action: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean };
  footer?: { label: string; onPress: () => void; disabled?: boolean };
  /** The fields, laid out on the card's face. */
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // The card is drawn behind the character, at its width; these margins widen it
  // back out to the page's.
  const bleed = -((width - layout.screenInline * 2) - PERCH) / 2;
  const off = action.disabled || action.busy;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.screen}>
      <LinearGradient pointerEvents="none"
        colors={[colors.limePale, colors.limeBright, colors.limeSurface, colors.bg]}
        locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
      <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
      <View pointerEvents="none" style={styles.waveFront}><HomeAsset name="waveFront" /></View>
      <View style={[styles.bar, { paddingTop: insets.top + 12 }]}>
        <BackButton onPress={onBack} label={backLabel} />
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {!!copy && <Text style={styles.copy}>{copy}</Text>}
        </View>
        <MascotRig width={PERCH} mood={mood} calm eyesShut={eyesShut} style={styles.perch}
          behind={(
            <Card corner="xl" style={[styles.card, { marginLeft: bleed, marginRight: bleed }]}>{children}</Card>
          )} />
        <Button size="xl" label={action.label} loading={action.busy} disabled={off} onPress={action.onPress} />
        {footer && (
          <Pressable accessibilityRole="button" onPress={footer.onPress} disabled={footer.disabled} style={styles.footer}>
            <Text style={styles.footerText}>{footer.label}</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Ridden up under the character's hands, so it reads as the thing being held.
  card: { marginTop: CARD_LIFT },
  screen: { flex: 1, backgroundColor: colors.bg },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 196, left: -19 },
  waveFront: { position: 'absolute', top: 233, left: -19 },
  bar: { paddingHorizontal: layout.screenInline, flexDirection: 'row' },
  content: { flexGrow: 1, paddingHorizontal: layout.screenInline, paddingTop: space[3], gap: space[4] },
  heading: { gap: space[1] },
  title: { ...type.title, color: colors.sub },
  copy: { ...type.body, fontFamily: fonts.medium, color: colors.faint },
  perch: { alignSelf: 'center' },
  // The one thing these pages want pressed, so it carries the deepest lip.
  footer: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  footerText: { ...type.small, fontFamily: fonts.semibold, color: colors.action },
});
