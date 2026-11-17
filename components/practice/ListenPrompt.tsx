/**
 * A question that is heard instead of read.
 *
 * It says the word once when it appears, and again whenever it is asked to — at
 * speaking pace, or slowly. Speech is loaded when it is first needed, the way the
 * pronunciation button does it, so a build without it still opens; there, and
 * anywhere a person simply cannot listen right now, "Can't listen now" trades the
 * question for one that can be read.
 */

import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { componentTokens, space, type, colors, fonts } from '@/theme';
import { SpeakingWave } from '@/components/SpeakingPulse';
import { speechRate, useSpeech } from '@/lib/speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

export function ListenPrompt({ text, languageCode, onCannotListen }: {
  text: string;
  languageCode?: string;
  /** Absent once the question has been answered: there is nothing left to trade. */
  onCannotListen?: () => void;
}) {
  // Speech, the flag the button animates on, and the silent-switch note all come
  // from the one place every speaking button in the app uses.
  const { speak, speaking, unavailable } = useSpeech();
  const say = useCallback((rate: number) => { void speak(text, { languageCode, rate }); }, [speak, text, languageCode]);
  useEffect(() => { say(speechRate.natural); }, [say]);

  // Neither button is offered until the word has been said at speaking pace once.
  //
  // Before you have heard it, slower is not a choice you are in a position to
  // make — the question has only just arrived, and two buttons side by side ask
  // you to decide between them before there is anything to decide. Afterwards it
  // is exactly the right offer, because by then you know whether you caught it.
  //
  // "Said once" is the speaking flag coming back down, whatever brought it down:
  // finished, stopped, or failed. All three leave you having had your go.
  const [heard, setHeard] = useState(false);
  const wasSpeaking = useRef(false);
  const shown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (speaking) { wasSpeaking.current = true; return; }
    if (wasSpeaking.current) { wasSpeaking.current = false; setHeard(true); }
  }, [speaking]);
  useEffect(() => {
    if (!heard) return;
    Animated.timing(shown, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [heard, shown]);

  return (
    <View style={styles.wrap}>
      {/* The sound itself, and the button for it: one thing, not two. Pressing a
          waveform to hear it again is how every player people already use works,
          and the alternative was a disc and a band taking it in turns in the same
          slot, which made the screen flicker between two different shapes. */}
      <Pressable
        onPress={() => say(speechRate.natural)}
        accessibilityRole="button"
        accessibilityLabel={speaking ? 'Speaking' : 'Play again'}
        accessibilityState={{ busy: speaking }}
        hitSlop={space[2]}
        style={({ pressed }) => [styles.voice, pressed && styles.pressed]}
      >
        <SpeakingWave width={VOICE} height={PLAY} color={colors.action} active={speaking} />
      </Pressable>
      {/* Under the waveform rather than beside it: beside it they would eat into
          the width that is the whole point of the waveform. The row holds its
          place from the start, so nothing jumps when it arrives.

          Both arrive together, once the word has been said at speaking pace. The
          two of them are one offer — hear it again, or hear it slower — and
          until you have heard it neither is a choice you are in a position to
          make. Nothing is out of reach in the meantime: the question plays by
          itself, and the waveform is the play button.

          Replay is here as well as on the waveform itself. Pressing the sound to
          hear it again is the convention, but it is a convention you have to
          already know — nothing about a row of bars says "press me". The arrow
          says it, and it is the same action, so finding either one works. */}
      <Animated.View
        pointerEvents={heard ? 'auto' : 'none'}
        accessibilityElementsHidden={!heard}
        importantForAccessibility={heard ? 'auto' : 'no-hide-descendants'}
        style={[styles.controls, { opacity: shown }]}
      >
        <IconButton size="sm" variant="secondary" label="Play again"
          accessibilityState={{ busy: speaking }} onPress={() => say(speechRate.natural)}>
          <Icon name="replay" size={18} color={componentTokens.button.secondary.label} />
        </IconButton>
        <Button variant="secondary" size="sm" label="Slow" accessibilityLabel="Play slowly" onPress={() => say(speechRate.slow)} />
      </Animated.View>
      {unavailable && <Text style={styles.note}>Sound isn’t available in this build.</Text>}
      {onCannotListen && <Button variant="quiet" size="sm" label="Can’t listen now" onPress={onCannotListen} />}
    </View>
  );
}

/** How tall the voice print stands. It is the big round button's diameter: that
 *  button is gone, but it was the right amount of room for this screen's one
 *  instruction, and it is a comfortable thing to hit. */
const PLAY = componentTokens.iconButton.size.xl;
/** How wide the voice print is: most of the card, which is the point of it. */
const VOICE = 280;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space[2] },
  voice: { alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  // No surface to press flat, so pressing dims it — the same answer Button gives
  // for its surfaceless variants.
  pressed: { opacity: componentTokens.button.pressedOpacity },
  note: { ...type.caption, fontFamily: fonts.regular, color: colors.faint, textAlign: 'center' },
});
