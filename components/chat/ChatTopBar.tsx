/**
 * The row above a conversation: a way out, what this is, a way to start over.
 *
 * Both chat screens have one and they are the same row, so it is written once.
 * What each screen chooses is the title and whether there is anything to clear.
 *
 * The title sits beside the cross rather than centred over it, because this app
 * reads from the leading edge; a centred one would also need the trailing control
 * to exist even when there is nothing for it to do.
 */

import { CloseButton, RoundAction } from '@/components/ui/RoundButtons';
import { dialog } from '@/lib/dialog';
import { colors, fonts, layout, space, type } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

export function ChatTopBar({ title, onClose, started, onClear }: {
  title: string;
  onClose: () => void;
  /** Whether there is a conversation to throw away yet. */
  started: boolean;
  onClear: () => void;
}) {
  /* A bin, not a replay arrow. `replay` reads as "do that again" — which is the
   * opposite of what this does; what actually happens is that the conversation is
   * thrown away. The word and the mark now say the same thing. */
  const ask = () => dialog('Clear this conversation?',
    'It goes, and nothing drafted in it is kept.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: onClear },
    ]);

  return (
    <View style={styles.bar}>
      <CloseButton onPress={onClose} label="Close" />
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      {/* Only once there is a conversation: a control that can do nothing until
          later is one more thing to read on an empty screen. The slot keeps its
          place so the title does not shift when it arrives. */}
      {started
        ? <RoundAction icon="delete" label="Clear conversation" onPress={ask} />
        : <View style={styles.slot} />}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    paddingHorizontal: layout.screenInline,
    paddingTop: space[3],
    paddingBottom: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  title: { ...type.heading, fontFamily: fonts.semibold, color: colors.text, flex: 1 },
  slot: { width: 44 },
});
