import type { ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeAsset } from '@/components/HomeAsset';
import { MascotRig, RIG_HAND_LINE, type MascotMood } from '@/components/mascot/rig/MascotRig';
import { BackButton } from '@/components/ui/RoundButtons';
import { LedgePressable } from '@/components/ui/LedgePressable';
import { colors } from '@/theme';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { layout } from '@/theme/spacing';
import { fonts } from '@/theme/typography';

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
        colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.gradientSoft, homeColors.canvas]}
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
            <View style={[styles.card, { marginLeft: bleed, marginRight: bleed }]}>
              <View style={styles.cardFace}>{children}</View>
            </View>
          )} />
        <LedgePressable accessibilityRole="button" accessibilityState={{ disabled: off, busy: action.busy }}
          disabled={off} onPress={action.onPress} style={[styles.lead, off && styles.leadOff]}>
          <View style={styles.leadFace}>
            {action.busy
              ? <ActivityIndicator color={homeColors.white} />
              : <Text style={styles.leadText}>{action.label}</Text>}
          </View>
        </LedgePressable>
        {footer && (
          <Pressable accessibilityRole="button" onPress={footer.onPress} disabled={footer.disabled} style={styles.footer}>
            <Text style={styles.footerText}>{footer.label}</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A filled field for the card's face: a well sunk into the white, not a bordered
 * box. Put a TextInput in it with `authField.input`. */
export const authField = StyleSheet.create({
  well: { minHeight: 52, borderRadius: 16, backgroundColor: homeColors.canvas, justifyContent: 'center', paddingHorizontal: 16 },
  input: { fontFamily: fonts.medium, fontSize: 16, color: homeColors.darkest, paddingVertical: 14 },
  /** Room on the right for the show-password button. */
  secret: { paddingRight: 44 },
  eye: { position: 'absolute', right: 4, top: 0, bottom: 0, width: 44, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.red },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: homeColors.canvas },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 196, left: -19 },
  waveFront: { position: 'absolute', top: 233, left: -19 },
  bar: { paddingHorizontal: layout.screenInline, flexDirection: 'row' },
  content: { flexGrow: 1, paddingHorizontal: layout.screenInline, paddingTop: 12, gap: 16 },
  heading: { gap: 4 },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 44, color: homeColors.deep },
  copy: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: homeColors.muted },
  perch: { alignSelf: 'center' },
  card: { marginTop: CARD_LIFT, backgroundColor: homeColors.border, borderRadius: 32, paddingBottom: ledge.raised },
  cardFace: { backgroundColor: homeColors.white, borderRadius: 32, padding: 16, gap: 12 },
  // The one thing these pages want pressed, so it carries the deepest lip.
  lead: { height: 59 + ledge.lead, borderRadius: 42, backgroundColor: homeColors.deep, paddingBottom: ledge.lead },
  leadOff: { opacity: 0.45 },
  leadFace: { flex: 1, borderRadius: 42, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  leadText: { fontFamily: fonts.medium, fontSize: 22, lineHeight: 30, color: homeColors.white },
  footer: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  footerText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary },
});
