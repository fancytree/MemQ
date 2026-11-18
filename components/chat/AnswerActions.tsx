/**
 * The four things you can do with an answer, under the answer.
 *
 * Copy, listen, ask again, keep. They are small, quiet and left-aligned under the
 * prose — the answer is the thing on the page and these are what you reach for
 * afterwards, so they are drawn at the weight of a caption rather than as buttons
 * competing with it. `colors.faint` at rest, and nothing but the icon: four words
 * under every answer would read as a toolbar, and a toolbar under every paragraph
 * is most of the screen.
 *
 * Why these four. Copy and listen are what someone does with a sentence they want
 * to take somewhere else — a message to a friend, or an ear instead of an eye.
 * Ask again is for an answer that missed. And "make cards" is the one move this
 * whole screen exists for: the suggestion row above the box offers it in words
 * when the model thinks of it, and this offers it always, in the one place where
 * "this" is unambiguous — under the answer it would be made from.
 *
 * Copy says so, by turning into a tick for a moment. There is no other way to
 * tell: the clipboard is somewhere else, and a button that does nothing visible
 * is a button you press twice.
 *
 * Listen is the app's one speaking button (SpeakingGlyph), the same mark and the
 * same animation as on a card, so the gesture that plays a word plays a paragraph.
 *
 * There is no "practise" mark here, and there was for a day. It started the round
 * of everything due today, under an answer about something else entirely, with no
 * words on it — so nobody could tell what pressing it would begin. A way into
 * practice has to say which practice. That is the button the Ask line puts up
 * when someone says they want a round, and it carries the lesson's name.
 *
 * Ask again is under every answer, not only the last one. The answer you want
 * done differently is usually not the one you just read — it is the one three
 * turns up that sent the rest of the conversation the wrong way — and a button
 * that is there for one paragraph and gone for the others reads as missing.
 * Pressing it takes the turns below it with it: they were replying to the answer
 * being replaced, so keeping them would leave the page answering a question that
 * is no longer on it.
 */

import { Icon } from '@/components/ui/Icon';
import { SpeakingGlyph } from '@/components/SpeakingPulse';
import { useSpeech } from '@/lib/speech';
import { colors, fonts, space, type } from '@/theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

/* Loaded when it is first needed, like the pickers in ChatShell: the module is
 * native, and an older development build that does not carry it should lose the
 * copy button rather than the whole screen. */
type Clipboard = { setStringAsync: (text: string) => Promise<boolean> };
let clipboard: Clipboard | null | undefined;
function loadClipboard(): Clipboard | null {
  if (clipboard === undefined) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    try { const mod = require('expo-clipboard'); clipboard = (mod?.default ?? mod) as Clipboard; }
    catch { clipboard = null; }
  }
  return clipboard;
}

/** How long the tick stands in for the copy mark. Long enough to be seen on the
 *  way back from the thing you pasted into, short enough not to look stuck. */
const SAID_COPIED = 1600;

export function AnswerActions({ text, onRetry, onMakeCards }: {
  /** The prose of this answer, as one string. Empty means there is nothing here
   *  worth copying or reading aloud, and the row does not draw. */
  text: string;
  /** Ask the same question again, in place of this answer and everything under
   *  it. Always given; optional only so a caller with nothing to re-ask can
   *  leave the mark off. */
  onRetry?: () => void;
  /** Absent on the Ask line, which does not make cards: a mark there could only
   *  ever be answered with directions to somewhere else.
   *  Turn this answer into cards. Says it in the box as the person would, rather
   *  than starting anything behind their back. */
  onMakeCards?: () => void;
}) {
  const said = text.trim();
  const { speak, speaking } = useSpeech();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async () => {
    const module = loadClipboard();
    if (!module) return;
    try { await module.setStringAsync(said); } catch { return; }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), SAID_COPIED);
  }, [said]);

  if (!said) return null;
  return (
    <View style={styles.row} accessibilityRole="toolbar">
      <Action label={copied ? 'Copied' : 'Copy'} onPress={() => void copy()}>
        <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? colors.action : colors.faint} />
      </Action>
      <Action label="Listen" busy={speaking} onPress={() => void speak(said)}>
        <SpeakingGlyph size={16} color={colors.faint} active={speaking} />
      </Action>
      {onRetry && (
        <Action label="Ask again" onPress={onRetry}>
          <Icon name="replay" size={16} color={colors.faint} />
        </Action>
      )}
      {onMakeCards && (
        <Action label="Make cards from this" onPress={onMakeCards}>
          <Icon name="layers" size={16} color={colors.faint} />
        </Action>
      )}
      {/* The one word in the row, and only while it is true: it is the answer to
          "did that work", not a label for the button. */}
      {copied && <Text style={styles.said}>Copied</Text>}
    </View>
  );
}

function Action({ label, busy, onPress, children }: {
  label: string;
  busy?: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={busy ? { busy } : undefined}
      onPress={onPress}
      // Room to aim at without taking room on the page: the marks sit close
      // together and the targets overlap into the gap around them.
      hitSlop={10}
      style={({ pressed }) => [styles.action, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], marginTop: space[1] },
  action: { paddingVertical: space[1] },
  pressed: { opacity: 0.5 },
  said: { ...type.caption, fontFamily: fonts.regular, color: colors.action },
});
