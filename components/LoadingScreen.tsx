import { space } from '@/theme/spacing';
import { type } from '@/theme/typography';
/**
 * The full-screen wait.
 *
 * Shown while the app is working on something the person has just asked for and
 * cannot do anything else until it finishes — signing in, signing up, the first
 * session check at launch. It is the whole screen on purpose: there is nothing to
 * do but wait, so there is nothing else to look at.
 *
 * It is the same place as the rest of the app, not a grey interstitial: the gradient
 * and the two hills Today and the sign-in screens stand on, the wordmark, and the
 * character waiting with you. It used to be a system spinner on a flat background.
 *
 * The character is held on one face, and it is the happy one, hopping on the spot.
 * The working mood's face is a thinking frown with the mouth turned down, and a
 * wait should not look like something has gone wrong.
 */
import Logo from '@/components/icons/Logo';
import { HomeAsset } from '@/components/HomeAsset';
import { MascotRig } from '@/components/mascot/rig/MascotRig';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

interface LoadingScreenProps {
  visible: boolean;
  /** What to say while waiting. One line for every wait by default: naming the
   * particular errand — signing in, creating an account — tells the person
   * something they already know, since they just pressed the thing that started
   * it. What it says instead is that somebody is working. */
  label?: string;
}

const WORKING = 'Working on it\u2026';

const MASCOT = 220;

export default function LoadingScreen({ visible, label = WORKING }: LoadingScreenProps) {
  if (!visible) return null;

  // A Modal so it covers everything, including the native splash screen.
  return (
    <Modal visible transparent={false} animationType="fade" statusBarTranslucent>
      <View style={styles.container}>
        <LinearGradient pointerEvents="none"
          colors={[colors.limePale, colors.limeBright, colors.limeSurface, colors.bg]}
          locations={[0, 0.21154, 0.44712, 1]} style={styles.background} />
        <View pointerEvents="none" style={styles.waveBack}><HomeAsset name="waveBack" /></View>
        <View pointerEvents="none" style={styles.waveFront}><HomeAsset name="waveFront" /></View>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.content}>
            <Logo width={200} />
            <MascotRig width={MASCOT} mood="happy" calm style={styles.mascot} />
            {!!label && <Text style={styles.label}>{label}</Text>}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  background: { position: 'absolute', top: 0, left: 0, right: 0, height: 874 },
  waveBack: { position: 'absolute', top: 150, left: -19 },
  waveFront: { position: 'absolute', top: 187, left: -19 },
  safe: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[2] },
  mascot: { marginTop: space[2] },
  label: { ...type.body, fontFamily: 'Geist_500Medium', color: colors.faint },
});
