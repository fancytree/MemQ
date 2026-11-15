/**
 * A spelled answer, shown back with every slip marked.
 *
 * Relaxed marking lets a small slip pass — but "passed" must never look like "right".
 * What was typed is shown with the letters that are wrong or do not belong struck
 * through; beneath it the right spelling, with the letters that were missed or
 * mistaken picked out. The two lines are read against each other.
 */

import type { Mark, SpellingVerdict } from '@/lib/answerCheck';
import { colors, fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { StyleSheet, Text, View } from 'react-native';

const plain = (marks: Mark[]) => marks.map((mark) => mark.text).join('');

export function SpellingResult({ verdict, skipped }: { verdict: SpellingVerdict; skipped: boolean }) {
  const { result } = verdict;
  const tone = result === 'correct' ? colors.green : colors.warn;
  const heading = skipped ? 'Give this one another try later'
    : result === 'correct' ? 'You got it!'
      : result === 'almost' ? (verdict.accentsOnly ? 'Almost — mind the accents' : 'Almost — check the spelling')
        : 'Not quite — compare the spelling';
  return (
    <View style={styles.result}>
      <Text style={[styles.label, { color: tone }]}>{heading}</Text>
      <View accessibilityLabel={skipped ? 'Skipped' : `Your answer: ${plain(verdict.typed)}`}
        style={[styles.box, { borderColor: result === 'correct' ? colors.green : homeColors.quizWrongOutline }]}>
        {skipped ? <Text style={styles.text}>Skipped</Text> : <Text style={styles.text}>
          {verdict.typed.map((mark, index) => <Text key={index} style={!mark.ok && styles.slip}>{mark.text}</Text>)}
        </Text>}
      </View>
      {result !== 'correct' && <>
        <Text style={[styles.label, { color: colors.green }]}>Correct spelling</Text>
        <View accessibilityLabel={`Correct spelling: ${plain(verdict.expected)}`} style={[styles.box, { borderColor: colors.green }]}>
          <Text style={styles.text}>
            {verdict.expected.map((mark, index) => <Text key={index} style={!mark.ok && !skipped && styles.missed}>{mark.text}</Text>)}
          </Text>
        </View>
      </>}
    </View>
  );
}

const styles = StyleSheet.create({
  result: { gap: 8 },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20 },
  box: { minHeight: 52, justifyContent: 'center', borderWidth: 1.5, borderRadius: 16, backgroundColor: homeColors.white, paddingHorizontal: 16, paddingVertical: 10 },
  text: { fontFamily: fonts.regular, fontSize: 18, lineHeight: 26, color: homeColors.darkest, letterSpacing: 0.3 },
  slip: { color: colors.red, backgroundColor: colors.redL, textDecorationLine: 'line-through', fontFamily: fonts.semibold },
  missed: { color: colors.green, backgroundColor: colors.greenL, textDecorationLine: 'underline', fontFamily: fonts.bold },
});
