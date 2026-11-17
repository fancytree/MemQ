/**
 * What a practice card shows once the answer is out.
 *
 * Two shapes, and they are the same two wherever an answer appears — turning a
 * flashcard over, or opening the explanation behind a question. Before this each
 * face had written its own: the same panel, the same padding and the same corner,
 * but with the label at twelve points on one and fourteen on the other, the answer
 * at twenty on one and sixteen on the other, and the prose in two different inks.
 *
 * `Answer` is the thing being learned, on the inset panel — a meaning, the right
 * choice. `AnswerNote` is what is said about it, which has no panel because it is
 * reading copy and not a value.
 */

import { colors, fonts, radius, space, type } from '@/theme';
import { oneLine } from '@/theme/typography';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function Answer({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.panel}>
      <Text style={styles.label}>{label}</Text>
      {typeof children === 'string' ? <Text style={styles.value}>{children}</Text> : children}
    </View>
  );
}

export function AnswerNote({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Text style={styles.label}>{label}</Text>
      {typeof children === 'string' ? <Text style={styles.prose}>{children}</Text> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.md, backgroundColor: colors.panel, padding: space[4], gap: space[2] },
  note: { gap: space[1] },
  // The label names the block rather than saying anything, which is the caption's
  // job; the answer is the payoff, so it is the largest thing on the face.
  label: { ...oneLine(type.caption), fontFamily: fonts.semibold, color: colors.sub },
  value: { ...type.heading, color: colors.text },
  prose: { ...type.small, color: colors.text },
});
