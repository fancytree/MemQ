import { oneLine } from '@/theme/typography';
import { Card } from '@/components/ui/Card';
/**
 * What a practice round is made of, and how strictly a typed answer is marked.
 *
 * A round takes each card through up to three steps — look at it, recognise it,
 * produce it — and each step can be asked in several forms (lib/practiceRound).
 * What is switched on and off here is the forms, grouped by what the person does:
 * turn a card over, pick, match, type, listen, build.
 */

import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { CloseButton } from '@/components/ui/RoundButtons';
import { SheetHead } from '@/components/ui/Sheet';
import { listenBreakLeft } from '@/lib/listenBreak';
import type { PracticeMode, PracticeSettings } from '@/lib/practiceModes';
import { space, radius, type, colors, fonts } from '@/theme';
import { sheet } from '@/theme/sheet';
import { layout } from '@/theme/spacing';
import { StatusBar } from 'expo-status-bar';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export { DEFAULT_PRACTICE_SETTINGS, type PracticeMode, type PracticeSettings } from '@/lib/practiceModes';

const MODES: { key: PracticeMode; label: string; hint: string }[] = [
  { key: 'flip', label: 'Flashcards', hint: 'See the card, then turn it over.' },
  { key: 'mcq', label: 'Multiple choice', hint: 'Pick one of four: a meaning, a synonym, an opposite, or the word for a gap.' },
  { key: 'match', label: 'Matching', hint: 'Pair words with their meanings as new ones keep arriving. Language lessons only.' },
  { key: 'recall', label: 'Written', hint: 'Type the meaning, or spell the word from memory.' },
  { key: 'listen', label: 'Listening', hint: 'Hear a word, then type it or pick its meaning. Language lessons only.' },
  { key: 'build', label: 'Sentence building', hint: 'Put the words of a sentence in order. Language lessons only.' },
];

const GRADING: { key: PracticeSettings['grading']; label: string; hint: string }[] = [
  { key: 'relaxed', label: 'Relaxed', hint: 'The right idea counts, however it is worded. A small spelling slip passes, and is pointed out.' },
  { key: 'strict', label: 'Strict', hint: 'Spelling must be exact, accents included, and a meaning must be the card’s own. Capitals and punctuation are let go.' },
];

export default function PracticeSettingsModal({
  visible, onClose, settings, onChange, listenBreak, onEndListenBreak,
}: {
  visible: boolean;
  onClose: () => void;
  settings: PracticeSettings;
  onChange: (settings: PracticeSettings) => void;
  /** When the person asked not to be made to listen until, or null. */
  listenBreak?: number | null;
  onEndListenBreak?: () => void;
}) {
  // A break taken from inside a round is switched on from a dialog and would
  // otherwise have nowhere to be switched off: a person who chose "rest of today"
  // and then put their headphones on has no way to say so. This is where the
  // Listening row says it is paused, and the way back.
  const paused = listenBreakLeft(listenBreak ?? null);
  // Turning the last one off would leave a round with nothing to ask, so the last one
  // on cannot be turned off. Its switch is disabled rather than silently refusing.
  const onCount = MODES.filter((m) => settings.modes[m.key]).length;

  return (
    <Modal visible={visible} animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <SheetHead align="center" title="Practice" close={false}
          onClose={onClose} closeLabel="Close practice settings"
          lead={<CloseButton onPress={onClose} label="Close practice settings" />} />

        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionLabel}>What a round asks</Text>
          <Card gap={0}>
            {MODES.map((mode, i) => {
              const on = settings.modes[mode.key];
              const last = on && onCount === 1;
              return (
                <View key={mode.key} style={[styles.row, i > 0 && styles.rowGap]}>
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowLabel}>{mode.label}</Text>
                    <Text style={styles.rowHint}>{mode.hint}</Text>
                    {mode.key === 'listen' && !!paused && !!onEndListenBreak && (
                      <View style={styles.paused}>
                        <Text style={styles.pausedText}>Paused · {paused}</Text>
                        <Button variant="ghost" size="sm" label="Resume"
                          accessibilityLabel="Resume listening questions" onPress={onEndListenBreak} />
                      </View>
                    )}
                  </View>
                  <Toggle value={on} disabled={last} label={mode.label}
                    hint={last ? 'A round needs at least one kind of question.' : undefined}
                    onValueChange={(next) =>
                      onChange({ ...settings, modes: { ...settings.modes, [mode.key]: next } })} />
                </View>
              );
            })}
          </Card>

          <Text style={styles.sectionLabel}>Marking typed answers</Text>
          <Card gap={0}>
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
          </Card>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, ...sheet.surface },

  body: { paddingHorizontal: layout.screenInline, paddingBottom: space[8], gap: space[2] },
  sectionLabel: {
    ...type.body, fontFamily: fonts.semibold,
    color: colors.text,
    marginTop: space[3],
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 56 },
  rowGap: { marginTop: space[3] },
  rowCopy: { flex: 1, gap: space.hair },
  paused: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginTop: space[1] },
  pausedText: { ...type.caption, fontFamily: fonts.semibold, color: colors.sub },
  rowLabel: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  rowHint: { ...type.small, color: colors.faint },

  ring: {
    width: 24, height: 24, borderRadius: radius.md, borderWidth: 2,
    borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  ringOn: { borderColor: colors.action },
  dot: { width: 12, height: 12, borderRadius: radius.sm, backgroundColor: colors.action },
});
