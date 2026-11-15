/**
 * A question that is heard instead of read.
 *
 * It says the word once when it appears, and again whenever it is asked to — at
 * speaking pace, or slowly. Speech is loaded when it is first needed, the way the
 * pronunciation button does it, so a build without it still opens; there, and
 * anywhere a person simply cannot listen right now, "Can't listen now" trades the
 * question for one that can be read.
 */

import { ledge } from '@/theme/ledge';
import { LedgePressable } from '@/components/ui/LedgePressable';
import { colors, fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function ListenPrompt({ text, languageCode, onCannotListen }: {
  text: string;
  languageCode?: string;
  /** Absent once the question has been answered: there is nothing left to trade. */
  onCannotListen?: () => void;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const say = useCallback(async (rate: number) => {
    const spoken = text.trim();
    if (!spoken) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Speech = require('expo-speech') as typeof import('expo-speech');
      await Speech.stop();
      Speech.speak(spoken, { ...(languageCode?.trim() ? { language: languageCode.trim() } : {}), rate });
    } catch {
      setUnavailable(true);
    }
  }, [text, languageCode]);

  useEffect(() => {
    void say(0.9);
    return () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        void (require('expo-speech') as typeof import('expo-speech')).stop();
      } catch { /* nothing was speaking */ }
    };
  }, [say]);

  return (
    <View style={styles.wrap}>
      <View style={styles.buttons}>
        <LedgePressable accessibilityRole="button" accessibilityLabel="Play again" onPress={() => void say(0.9)} style={styles.play}>
          <View style={styles.playFace}><Feather name="volume-2" size={30} color={colors.onAction} /></View>
        </LedgePressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Play slowly" onPress={() => void say(0.55)} style={styles.slow}>
          <Text style={styles.slowText}>Slow</Text>
        </Pressable>
      </View>
      {unavailable && <Text style={styles.note}>Sound isn’t available in this build.</Text>}
      {onCannotListen && <Pressable accessibilityRole="button" onPress={onCannotListen} hitSlop={8} style={styles.cannot}>
        <Text style={styles.cannotText}>Can’t listen now</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // The question's one big button: a round face on a deep shell, lipped by the lead
  // depth, so a tap presses it down rather than dimming it.
  play: { width: 76, height: 76 + ledge.lead, borderRadius: 38, backgroundColor: homeColors.deep, paddingBottom: ledge.lead },
  playFace: { flex: 1, borderRadius: 38, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center' },
  slow: {
    minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderRadius: 22, borderWidth: 1, borderColor: homeColors.border, backgroundColor: homeColors.white,
    boxShadow: `0px 2px 0px ${homeColors.border}`,
  },
  slowText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.deep },
  note: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: homeColors.muted, textAlign: 'center' },
  cannot: { minHeight: 44, justifyContent: 'center' },
  cannotText: { fontFamily: fonts.medium, fontSize: 13, color: homeColors.muted },
});
