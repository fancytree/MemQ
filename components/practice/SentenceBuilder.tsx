/**
 * Building a sentence: its words are laid out shuffled, and tapping one moves it up
 * into the sentence being built. Tapping a word in the sentence sends it back.
 *
 * The screen owns which words have been placed, because the button that checks the
 * sentence lives in its footer.
 */

import type { BuildQuestion } from '@/lib/practiceRound';
import { space, radius, type, colors, fonts } from '@/theme';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LedgePressable } from '@/components/ui/LedgePressable';
import { ledge } from '@/theme/ledge';

const key = (word: string) => word.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}'’-]/gu, '');

/** The same words in the same order; capitals and punctuation are not the exercise. */
export function isBuiltCorrectly(question: BuildQuestion, placed: number[]): boolean {
  return placed.length === question.answer.length
    && placed.every((tile, index) => key(question.tiles[tile]) === key(question.answer[index]));
}

export function SentenceBuilder({ question, placed, onChange, revealed, correct }: {
  question: BuildQuestion;
  /** Indexes into `question.tiles`, in the order they were placed. */
  placed: number[];
  onChange: (placed: number[]) => void;
  revealed: boolean;
  correct: boolean;
}) {
  // Room for the whole sentence from the start. A box that grew a row as words were
  // placed would push the words still to be tapped out from under the finger.
  const rows = Math.max(2, Math.ceil(question.tiles.length / 3));
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} nestedScrollEnabled showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View accessibilityLabel={`Your sentence: ${placed.map((tile) => question.tiles[tile]).join(' ') || 'empty'}`}
        style={[styles.line, !revealed && { minHeight: 24 + rows * 52 }, revealed && (correct ? styles.lineRight : styles.lineWrong)]}>
        {placed.length === 0 && <Text style={styles.placeholder}>Your sentence</Text>}
        {placed.map((tile, position) => (
          <LedgePressable key={`${tile}`} accessibilityRole="button" accessibilityLabel={`Remove ${question.tiles[tile]}`}
            disabled={revealed} onPress={() => onChange(placed.filter((_, index) => index !== position))} style={styles.word}>
            <View style={styles.wordFace}>
              <Text style={styles.wordText}>{question.tiles[tile]}</Text>
            </View>
          </LedgePressable>
        ))}
      </View>
      {revealed ? (!correct && <View style={styles.answer}>
        <Text style={styles.answerLabel}>Correct sentence</Text>
        <Text style={styles.answerText}>{question.answer.join(' ')}</Text>
      </View>) : <View style={styles.bank}>
        {question.tiles.map((word, tile) => {
          const used = placed.includes(tile);
          return (
            <LedgePressable key={`${tile}`} accessibilityRole="button" accessibilityLabel={word}
              accessibilityState={{ disabled: used }} disabled={used}
              onPress={() => onChange([...placed, tile])} style={[styles.word, used && styles.wordDown]}>
              <View style={[styles.wordFace, used && styles.wordFaceUsed]}>
                <Text style={[styles.wordText, used && styles.usedText]}>{word}</Text>
              </View>
            </LedgePressable>
          );
        })}
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  wrap: { gap: space[4], paddingBottom: space[1] },
  line: {
    minHeight: 108, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: space[2], padding: space[3],
    borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.panel,
  },
  lineRight: { borderColor: colors.green, backgroundColor: colors.greenL },
  lineWrong: { borderColor: colors.wrong, backgroundColor: colors.warnL },
  placeholder: { ...type.small, color: colors.faint },
  bank: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space[2] },
  // A small control: the shallow lip, drawn as the layer it is rather than a shadow.
  word: { minHeight: 44, borderRadius: radius.md, backgroundColor: colors.line, paddingBottom: ledge.control },
  // A word already placed is down, so it has no lip left to show.
  wordDown: { paddingBottom: 0 },
  wordFace: {
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: space[3], paddingVertical: space[2],
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surf,
  },
  wordFaceUsed: { backgroundColor: colors.panel, borderColor: colors.panel },
  wordText: { ...type.body, fontFamily: fonts.medium, color: colors.text },
  usedText: { opacity: 0 },
  answer: { gap: space[1], padding: space[3], borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.green, backgroundColor: colors.surf },
  answerLabel: { ...type.small, fontFamily: fonts.medium, color: colors.green },
  answerText: { ...type.body, color: colors.text },
});
