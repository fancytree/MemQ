/**
 * A question the app stops to ask.
 *
 * The sheet family left three of these behind, and they are one object: a scrim, a
 * card held in the middle of it (or against the bottom edge), something said, and
 * the choices. They were written three times — lib/dialog.tsx's host, the confirm
 * dialog, and the flashcard guide in the quiz — and the first two each drew the card
 * and the buttons by hand. Those buttons were the last ones in the app that were not
 * components/ui/Button: fifty points tall where the scale says forty-four, at the
 * card's 24-point corner rather than the button's pill, flat on a surface whose whole
 * language is a painted lip, and dimming on press because there was no lip to use up.
 *
 * So the chrome is here once, and the button row with it, since a dialog is the one
 * place in the app where buttons are chosen from data rather than written out.
 *
 * `place` is the only real variation. A question goes in the middle of the screen,
 * where it blocks what is behind it; something being explained while you keep
 * working — the flashcard guide — sits against the bottom edge, near the thumb.
 */

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { colors, fonts, layout, space, type } from '@/theme';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/** One of several things to pick, rather than one of two things to do. */
export type DialogChoice = {
  label: string;
  onPress: () => void;
};

export type DialogButton = {
  text: string;
  onPress?: () => void;
  /** `cancel` is the way out, `destructive` is the one that cannot be undone. */
  style?: 'default' | 'cancel' | 'destructive';
  /** Mid-commit: a spinner in place of the label, and no further presses. */
  loading?: boolean;
};

export function Dialog({
  visible, onDismiss, place = 'centre',
  head, title, subject, message, choices, buttons, onAnswer, children,
}: {
  visible: boolean;
  /** Leaving without answering: the back gesture, or a tap on the scrim. */
  onDismiss: () => void;
  /** `centre` blocks what is behind it; `bottom` sits by the thumb. */
  place?: 'centre' | 'bottom';
  /** A row above the title — an icon, a way to close. */
  head?: ReactNode;
  title: string;
  /** Between the title and the message, in the reading ink: what is being acted
   *  on, where naming it in the title would make the title a sentence. */
  subject?: string;
  message?: string;
  /** Several things to pick between, drawn as chips rather than as buttons.
   *
   *  Three filled buttons stacked make three calls to action out of what is one
   *  question with three answers, and the dialog comes out heavier than what it
   *  interrupts. A chip is already the app's word for one of a set of choices —
   *  it is what the daily study duration is picked with — so the same question
   *  gets the same shape here. */
  choices?: DialogChoice[];
  /** What to DO, as buttons: the way out, the one that commits. Two short ones
   *  sit side by side; anything else stacks. */
  buttons?: DialogButton[];
  /** Run before a button's own handler: how the host takes the dialog down. */
  onAnswer?: (button: DialogButton) => void;
  /** Between the message and the choices. */
  children?: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent
      onRequestClose={onDismiss}>
      <View accessibilityViewIsModal style={[styles.scrim, place === 'bottom' && styles.scrimBottom]}>
        {/* The way out, for a question that has no "never mind" among its own
            answers. "Quiet for how long?" is three lengths and a skip: every one
            of them does something, so without this the only way past the dialog
            is to pick one of them. The scrim already looks like the rest of the
            screen waiting behind it, and tapping the thing you were looking at
            is how you get back to it everywhere else.

            It does what the back gesture does — takes the dialog down and runs
            nothing — so every dialog already behaves this way from the hardware
            button, and this is the same door with a handle on it. Where leaving
            without answering would be wrong, the answer is a dialog whose
            buttons cover it, not one that cannot be left. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onDismiss}
        />
        <Card pad="lg" gap={space[5]} style={styles.card}>
          {head}
          {/* The copy scrolls and the choices do not: a long message must not push
              the way out of the dialog off the bottom of the screen. */}
          <ScrollView bounces={false} style={styles.copyScroll} contentContainerStyle={styles.copy}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            {!!subject && <Text style={styles.subject}>{subject}</Text>}
            {!!message && <Text style={styles.message}>{message}</Text>}
          </ScrollView>
          {children}
          {!!choices?.length && (
            <View style={styles.choices}>
              {choices.map((choice) => (
                <Chip key={choice.label} fill label={choice.label} onPress={choice.onPress} />
              ))}
            </View>
          )}
          {!!buttons?.length && <DialogActions buttons={buttons} onPress={onAnswer} />}
        </Card>
      </View>
    </Modal>
  );
}

/** The choices, as the app's own buttons. */
export function DialogActions({ buttons, onPress }: {
  buttons: DialogButton[];
  onPress?: (button: DialogButton) => void;
}) {
  // Two short choices sit side by side; anything else stacks, because a row of
  // three squeezes every label into something unreadable.
  const side = buttons.length === 2 && buttons.every((b) => b.text.length <= 14);
  // Side by side, the way out is on the left and the answer on the right; stacked,
  // the answer is first and the way out is last, nearest the thumb.
  const ordered = [...buttons].sort((a, b) =>
    (Number(a.style === 'cancel') - Number(b.style === 'cancel')) * (side ? -1 : 1));
  const busy = buttons.some((b) => b.loading);
  return (
    <View style={[styles.actions, side && styles.actionsRow]}>
      {ordered.map((button, index) => (
        <Button key={`${button.text}-${index}`} size="md"
          variant={button.style === 'cancel' ? 'secondary'
            : button.style === 'destructive' ? 'danger'
            : 'primary'}
          label={button.text} accessibilityLabel={button.text}
          loading={button.loading} disabled={busy && !button.loading}
          onPress={() => { onPress?.(button); button.onPress?.(); }}
          style={side ? styles.share : undefined} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1, justifyContent: 'center',
    paddingHorizontal: layout.screenInline, backgroundColor: colors.scrim,
  },
  // Against the bottom edge, with the page's own margin under it.
  scrimBottom: { justifyContent: 'flex-end', paddingBottom: space[6] },
  // Wide enough to read on a phone, narrow enough on a tablet that the line length
  // stays a line length. It never takes the whole screen: a dialog that does is a
  // page, and this one has to show that there is something behind it.
  card: { width: '100%', maxWidth: 440, maxHeight: '80%', alignSelf: 'center' },

  // Only as tall as it needs to be, and the first thing to give way when the card
  // runs out of room.
  copyScroll: { flexGrow: 0, flexShrink: 1 },
  copy: { gap: space[2] },
  title: { ...type.page, color: colors.sub },
  subject: { ...type.body, fontFamily: fonts.semibold, color: colors.sub },
  message: { ...type.small, color: colors.faint },

  // One row, equal shares. A set of answers to one question is a set, and three
  // chips at their own natural widths read as three separate offers of different
  // weights — the longest looking like the one meant to be picked. Equal thirds
  // say that the only difference between them is the length of time. It is also
  // what holds the labels short: a label that will not fit a third of the row is
  // a label to shorten, not a reason to let this row wrap.
  choices: { flexDirection: 'row', gap: space[2] },

  actions: { gap: space[2] },
  actionsRow: { flexDirection: 'row' },
  // In a row each choice takes half, so neither reads as the bigger one.
  share: { flex: 1, minWidth: 0 },
});
