/**
 * The card a question is asked on — every question, of every kind.
 *
 * A round can ask six different things: turn a flashcard over, pick one of four,
 * pair words with meanings, put a sentence in order, type what you remember, listen
 * and answer. They were drawn as two different cards. The flashcard had its own
 * shell, its own head absolutely positioned at twenty points, seventy-two points of
 * room above its content and fifty-six below; everything else had a second shell
 * with a head in flow and twenty points all round. The two heads were the same row
 * written twice — the same type, the same colour, the same chip, under four
 * different style names.
 *
 * So there is one card. What changes between question types is what goes in it, not
 * what it is. Language and knowledge are the same way: a language card has a
 * pronunciation, a part of speech and something to play, and those are things in
 * the body — not a different card.
 *
 * `hint` is the line along the bottom edge, for a card whose whole surface does
 * something and has to say so. `onPress` makes the card itself the control, which
 * is what turning a flashcard over is.
 */

import { Card } from '@/components/ui/Card';
import { colors, fonts, interaction, radius, space, type } from '@/theme';
import { oneLine } from '@/theme/typography';
import type { ReactNode } from 'react';
import {
  Pressable, StyleSheet, Text, View,
  type AccessibilityActionEvent, type AccessibilityActionInfo, type StyleProp, type ViewStyle,
} from 'react-native';

/** The hint is one small line, and a line is not a target. The room it needs to
 *  be one is taken outside the layout rather than inside it: given as height, the
 *  line sat a finger's width off the bottom edge of the card and read as a gap
 *  somebody had left by mistake. */
const HINT_SLOP = Math.round((interaction.minTarget - type.caption.lineHeight) / 2);

export function PracticeCard({
  topic, kind, hint, onHintPress, children, onPress, style, faceStyle,
  accessibilityLabel, accessibilityHint, accessibilityActions, onAccessibilityAction,
}: {
  /** Which lesson the card came from. */
  topic: string;
  /** What this one asks: Flashcard, Match, Build, or the question's own chip. */
  kind: string;
  /** Along the bottom edge, when the card itself is the thing to press. */
  hint?: string;
  /** Makes that line the control instead of the whole card. A card whose face is
   *  the thing to read — a turned-over card, with more on it than fits — cannot
   *  also be the thing to press: a drag down the middle of it is somebody reading
   *  on, and it came back as a tap that turned the card over. So the line along
   *  the bottom says what it does and is the only part that does it. */
  onHintPress?: () => void;
  children: ReactNode;
  onPress?: () => void;
  /** Where the card sits. */
  style?: StyleProp<ViewStyle>;
  /** How its content is laid out — a board wants different room than a question. */
  faceStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityActions?: ReadonlyArray<AccessibilityActionInfo>;
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
}) {
  return (
    <Card fill pad="lg" gap={space[3]} onPress={onPress} style={style} faceStyle={faceStyle}
      accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions} onAccessibilityAction={onAccessibilityAction}>
      {/* Where the question came from, and what it is asking. Every card opens the
          same way, so the eye knows where to look before it reads anything. */}
      <View style={styles.head}>
        <Text numberOfLines={2} style={styles.topic}>{topic}</Text>
        {!!kind && <View style={styles.kind}><Text style={styles.kindLabel}>{kind}</Text></View>}
      </View>
      {children}
      {!!hint && (onHintPress
        ? (
          <Pressable accessibilityRole="button" accessibilityLabel={hint} onPress={onHintPress} hitSlop={HINT_SLOP}>
            <Text style={styles.hint}>{hint}</Text>
          </Pressable>
        )
        : <Text style={styles.hint}>{hint}</Text>)}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  topic: { ...type.small, fontFamily: fonts.medium, flexShrink: 1, color: colors.faint },
  kind: { borderRadius: radius.md, backgroundColor: colors.panel, paddingHorizontal: space[2], paddingVertical: space[1] },
  kindLabel: { ...oneLine(type.caption), fontFamily: fonts.semibold, color: colors.sub },
  hint: { ...oneLine(type.caption), color: colors.faint, textAlign: 'center' },
});
