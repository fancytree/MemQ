/**
 * Building a sentence: its words are laid out shuffled, and tapping one moves it up
 * into the sentence being built. Tapping a word in the sentence sends it back.
 *
 * The screen owns which words have been placed, because the button that checks the
 * sentence lives in its footer.
 */

import type { BuildQuestion } from '@/lib/practiceRound';
import { colors, fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
    <ScrollView style={styles.scroll} contentContainerStyle={styles.wrap} nestedScrollEnabled showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
      <View accessibilityLabel={`Your sentence: ${placed.map((tile) => question.tiles[tile]).join(' ') || 'empty'}`}
        style={[styles.line, !revealed && { minHeight: 24 + rows * 52 }, revealed && (correct ? styles.lineRight : styles.lineWrong)]}>
        {placed.length === 0 && <Text style={styles.placeholder}>Your sentence</Text>}
        {placed.map((tile, position) => (
          <Pressable key={`${tile}`} accessibilityRole="button" accessibilityLabel={`Remove ${question.tiles[tile]}`}
            disabled={revealed} onPress={() => onChange(placed.filter((_, index) => index !== position))} style={styles.word}>
            <Text style={styles.wordText}>{question.tiles[tile]}</Text>
          </Pressable>
        ))}
      </View>
      {revealed ? (!correct && <View style={styles.answer}>
        <Text style={styles.answerLabel}>Correct sentence</Text>
        <Text style={styles.answerText}>{question.answer.join(' ')}</Text>
      </View>) : <View style={styles.bank}>
        {question.tiles.map((word, tile) => {
          const used = placed.includes(tile);
          return (
            <Pressable key={`${tile}`} accessibilityRole="button" accessibilityLabel={word}
              accessibilityState={{ disabled: used }} disabled={used}
              onPress={() => onChange([...placed, tile])} style={[styles.word, used && styles.used]}>
              <Text style={[styles.wordText, used && styles.usedText]}>{word}</Text>
            </Pressable>
          );
        })}
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  wrap: { gap: 16, paddingBottom: 5 },
  line: {
    minHeight: 108, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'flex-start', gap: 8, padding: 12,
    borderRadius: 16, borderWidth: 1.5, borderColor: homeColors.border, backgroundColor: homeColors.nav,
  },
  lineRight: { borderColor: colors.green, backgroundColor: colors.greenL },
  lineWrong: { borderColor: homeColors.quizWrongOutline, backgroundColor: colors.warnL },
  placeholder: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 40, color: homeColors.muted },
  bank: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  word: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14,
    borderWidth: 1, borderColor: homeColors.border, backgroundColor: homeColors.white,
    boxShadow: `0px 2px 0px ${homeColors.border}`,
  },
  used: { backgroundColor: homeColors.nav, boxShadow: `0px 0px 0px ${homeColors.border}` },
  wordText: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: homeColors.darkest },
  usedText: { opacity: 0 },
  answer: { gap: 6, padding: 14, borderRadius: 16, borderWidth: 1.5, borderColor: colors.green, backgroundColor: homeColors.white },
  answerLabel: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.green },
  answerText: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: homeColors.darkest },
});
