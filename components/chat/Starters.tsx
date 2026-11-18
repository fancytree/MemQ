/**
 * A few things to say, offered above the box.
 *
 * On an empty conversation they are a way in: an empty chat asks an open question
 * and most people have no answer to it — not because they want nothing, but
 * because they do not yet know what this thing can do. Three examples answer that
 * faster than any sentence of instructions.
 *
 * After an answer they are the next move, which is a different job done by the
 * same thing. Someone who has just been told what spaced repetition is rarely
 * wants to type; they want the obvious next step, and "make cards from this" is
 * a whole sentence they should not have to write. Keeping both in one place, just
 * above the box, means that spot always answers the same question: what could I
 * say next?
 *
 * They sit just above the box, not under the opening line at the top: that is
 * where the hand already is, and where the thing they fill in lives.
 *
 * Tapping one writes it into the box rather than sending it. The suggestion is a
 * starting point — most people want to change a word before they ask — and the
 * difference between a draft and a sent message is the difference between a
 * suggestion and a decision made for them.
 *
 * They are buttons, not chips. The Chip component is for picking one of a set and
 * carries a chosen state; these do something the moment they are touched and keep
 * nothing. They are stacked rather than laid in a row because a useful example is
 * a sentence, and sentences do not fit in pills.
 *
 * Each row is a `Card` with an `onPress`, not two hand-built layers: a card is
 * already a shell with a lighter face that presses down into its lip, and writing
 * that out here would be the same thing drawn slightly differently.
 *
 * Each screen writes its own, because what is worth suggesting depends on what
 * that line can actually do — suggesting something the model has no tool for is
 * worse than suggesting nothing. See ChatShell's `starters`.
 */

import { Card } from '@/components/ui/Card';
import { colors, fonts, space, type } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export function Starters({ starters, onPick }: {
  starters: string[];
  /** Given the text to put in the box, exactly as it is written on the button. */
  onPick: (text: string) => void;
}) {
  if (!starters.length) return null;
  return (
    <View style={styles.list} accessibilityRole="menu">
      {starters.map((text) => (
        <Card key={text} onPress={() => onPick(text)} accessibilityLabel={text} pad="sm">
          {/* No mark on the end. An arrow would say this is sent, and it is not —
              it lands in the box for the person to change or send themselves. */}
          <Text style={styles.text}>{text}</Text>
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* Sitting on the bar below it, so the two read as one block: the examples and
   * the box they go into. */
  list: { gap: space[2], paddingHorizontal: space[4], paddingBottom: space[3] },
  text: { ...type.small, fontFamily: fonts.regular, color: colors.text },
});
