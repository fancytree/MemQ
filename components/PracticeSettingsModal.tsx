/**
 * What a practice round is made of, and how strictly a written answer is marked.
 *
 * This replaces a sheet that offered true/false, multiple choice and written —
 * question kinds belonging to a screen that no longer exists. Practice asks three
 * things: a flashcard, a multiple choice, and a written recall, in that order for a
 * term still being learned, and one of the three at random for a term already
 * mastered. Those are what this turns on and off.
 */

import { Toggle } from '@/components/ui/Toggle';
import { fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { sheet } from '@/theme/sheet';
import { layout } from '@/theme/spacing';
import { Feather } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export type PracticeMode = 'flip' | 'mcq' | 'recall';

export type PracticeSettings = {
  /** Which of the three a round may ask. At least one is always on. */
  modes: Record<PracticeMode, boolean>;
  /** How a written answer is marked. Relaxed accepts an answer whose keywords mostly
   *  match; strict wants the words themselves. */
  grading: 'relaxed' | 'strict';
};

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  modes: { flip: true, mcq: true, recall: true },
  grading: 'relaxed',
};

const MODES: { key: PracticeMode; label: string; hint: string }[] = [
  { key: 'flip', label: 'Flashcards', hint: 'See the card, then turn it over.' },
  { key: 'mcq', label: 'Multiple choice', hint: 'Pick the right answer from four.' },
  { key: 'recall', label: 'Written', hint: 'Type the answer from memory.' },
];

const GRADING: { key: PracticeSettings['grading']; label: string; hint: string }[] = [
  { key: 'relaxed', label: 'Relaxed', hint: 'Accepts an answer that means the right thing, with synonyms, rephrasing or typos.' },
  { key: 'strict', label: 'Strict', hint: 'Wants the answer itself, give or take capitals and punctuation.' },
];

export default function PracticeSettingsModal({ visible, onClose, settings, onChange }: {
  visible: boolean;
  onClose: () => void;
  settings: PracticeSettings;
  onChange: (settings: PracticeSettings) => void;
}) {
  // Turning the last one off would leave a round with nothing to ask, so the last one
  // on cannot be turned off. Its switch is disabled rather than silently refusing.
  const onCount = MODES.filter((m) => settings.modes[m.key]).length;

  return (
    <Modal visible={visible} animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close practice settings"
            onPress={onClose} style={styles.close} hitSlop={8}>
            <Feather name="x" size={22} color={homeColors.deep} />
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>Practice</Text>
          <View style={styles.closeSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>What a round asks</Text>
          <View style={styles.card}><View style={styles.cardFace}>
            {MODES.map((mode, i) => {
              const on = settings.modes[mode.key];
              const last = on && onCount === 1;
              return (
                <View key={mode.key} style={[styles.row, i > 0 && styles.rowGap]}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>{mode.label}</Text>
                    <Text style={styles.rowHint}>{mode.hint}</Text>
                  </View>
                  <Toggle value={on} disabled={last} label={mode.label}
                    hint={last ? 'A round needs at least one kind of question.' : undefined}
                    onValueChange={(next) =>
                      onChange({ ...settings, modes: { ...settings.modes, [mode.key]: next } })} />
                </View>
              );
            })}
          </View></View>

          <Text style={styles.sectionLabel}>Marking written answers</Text>
          <View style={styles.card}><View style={styles.cardFace}>
            {GRADING.map((option, i) => {
              const chosen = settings.grading === option.key;
              return (
                <Pressable key={option.key} accessibilityRole="radio"
                  accessibilityState={{ checked: chosen }}
                  onPress={() => onChange({ ...settings, grading: option.key })}
                  style={[styles.row, i > 0 && styles.rowGap]}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>{option.label}</Text>
                    <Text style={styles.rowHint}>{option.hint}</Text>
                  </View>
                  <View style={[styles.ring, chosen && styles.ringOn]}>
                    {chosen && <View style={styles.dot} />}
                  </View>
                </Pressable>
              );
            })}
          </View></View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, ...sheet.surface },
  head: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: layout.screenInline, paddingTop: 8, paddingBottom: 14,
  },
  close: { width: 44, height: 44, alignItems: 'flex-start', justifyContent: 'center' },
  closeSpacer: { width: 44 },
  title: {
    fontFamily: fonts.display, fontSize: 23, lineHeight: 32, color: homeColors.deep,
  },

  body: { paddingHorizontal: layout.screenInline, paddingBottom: 32, gap: 10 },
  sectionLabel: {
    fontFamily: fonts.semibold, fontSize: 18, lineHeight: 24,
    color: homeColors.darkest, marginTop: 14,
  },
  card: { borderRadius: 28, backgroundColor: homeColors.border, paddingBottom: ledge.raised },
  cardFace: { borderRadius: 28, backgroundColor: homeColors.white, padding: 18 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56 },
  rowGap: { marginTop: 14 },
  rowCopy: { flex: 1, gap: 3 },
  rowLabel: {
    fontFamily: fonts.semibold, fontSize: 17, lineHeight: 24, color: homeColors.darkest,
  },
  rowHint: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: homeColors.muted },

  ring: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 2,
    borderColor: homeColors.border, alignItems: 'center', justifyContent: 'center',
  },
  ringOn: { borderColor: homeColors.primary },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: homeColors.primary },
});
