/**
 * Saying a card out loud.
 *
 * Every speaking button in the app goes through here, so they all behave the same:
 * one voice at a time, a flag while it is speaking for the button to animate on,
 * and the note for when nothing is heard.
 *
 * That note used to be a guess. It said "turn the volume up and check the silent
 * switch" to everybody, the first time anything was spoken, because the comment
 * here said iOS would not tell an app either of those things. Half of that was
 * wrong and the other half had a better answer than detecting it:
 *
 *   The volume IS readable — AVAudioSession's `outputVolume` on iOS, the music
 *   stream on Android — so the note is shown to the person whose volume is
 *   actually down, and to nobody else.
 *
 *   The silent switch is NOT readable on iOS; there is no public API, and the
 *   trick libraries use (play a short silent sound, time the callback) is a
 *   heuristic. But a card is only ever spoken because someone pressed a button
 *   asking for it, so the better answer is not to be silenced: the audio session
 *   is set to play in silent mode, and the switch stops mattering.
 *
 * What is left is a note that is true when it appears.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Loaded on use, so a development build without ExpoSpeech still opens. */
function speechModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-speech') as typeof import('expo-speech');
}

/** The audio session, for the same reason — a build without it still opens. */
function audioModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-audio') as typeof import('expo-audio');
}

/** How loud the phone is set. A module of this repo's own: see its Swift for
 *  why the library that does this could not be used. */
function volumeModule() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('@/modules/output-volume') as typeof import('@/modules/output-volume')).default;
}

/** Below this, a word is there but too quiet to make out. It is a fifth of the
 *  way up rather than silence: at two notches out of sixteen a phone at arm's
 *  length says nothing useful, and the person pressing play has already told us
 *  they expected to hear something. */
export const AUDIBLE_VOLUME = 0.2;

/** Whether to say that the volume is too low — the whole of the decision, kept
 *  apart from the speaking so it can be read and tested on its own.
 *
 *  `volume` is null where this build cannot read it. Nothing is known then, so
 *  nothing is claimed: a note that guesses is what this replaced. */
export function shouldOfferSoundHint({ dismissed, volume }: {
  /** Read once and kept: the person has had this note and put it away. */
  dismissed: boolean;
  volume: number | null;
}): boolean {
  if (dismissed) return false;
  if (volume === null) return false;
  return volume <= AUDIBLE_VOLUME;
}

/** Speech plays through the silent switch, and over whatever else is playing.
 *
 * It is said because a button was pressed asking for it, which is the case the
 * switch is not meant to cover — and iOS gives no way to read the switch, so the
 * alternative is a note that guesses.
 *
 * `duckOthers` is the other half of that bargain. Playing through silence means
 * claiming the playback session, and claiming it outright would stop whatever
 * the person had on — practising a few cards with music in the background would
 * kill the music, which is a worse thing to have done than the note it replaced.
 * Ducking lowers it for the length of a word and gives it straight back.
 *
 * Set once, on the first word spoken.
 */
let sessionReady: Promise<void> | null = null;
function playThroughSilence(): Promise<void> {
  sessionReady ??= (async () => {
    try {
      await audioModule().setAudioModeAsync({
        playsInSilentMode: true,
        interruptionMode: 'duckOthers',
      });
    } catch { /* an older build without the module: the switch still mutes, as before */ }
  })();
  return sessionReady;
}

/** How loud the phone is, 0 to 1, or null where it cannot be read.
 *
 *  Null is for a build without the native module — an older development build,
 *  or a platform that has none. Nothing is claimed on a null: see
 *  shouldOfferSoundHint. */
async function outputVolume(): Promise<number | null> {
  try {
    const volume = await volumeModule().get();
    return typeof volume === 'number' && Number.isFinite(volume) ? volume : null;
  } catch {
    return null;
  }
}

/** Stop whatever is being said. Safe where speech was never available. */
export function stopSpeaking() {
  try { void speechModule().stop(); } catch { /* nothing was speaking */ }
}

/** Who asked for what is being said now, so that a button leaving the screen
 *  silences its own word and not somebody else's. */
let speaker: symbol | null = null;

const SOUND_HINT_KEY = 'memq.sound-hint.v1';
/** Dismissed for good: the person has read it and does not need it again.
 *  Unlike before, it is not also "shown once and never again" — a note that is
 *  only shown when it is true can be shown whenever it is true. */
let hintDismissed = false;

/** Whether the note is up, held here rather than in the button that spoke.
 *
 * It points at the volume keys, which are on the edge of the screen and not
 * inside whatever card happens to be asking. So one host draws it, the way one
 * host draws dialogs, and this is what it listens to. */
const hintListeners = new Set<(showing: boolean) => void>();
let hintShowing = false;
/** The volume the sign went up at, so the watcher can tell a press of the key
 *  from the reading it gets on subscribing. */
let hintVolume: number | null = null;

/** Whether the sign has had its turn.
 *
 *  Without this it is raised after EVERY word that is spoken quietly, so the
 *  one way of making it go away that does not also put it away for good —
 *  turning the volume up, which is what it asked for — brings it straight back
 *  on the next word. Once a round is enough: it has been said, and the person
 *  either acted on it or chose not to. resetSoundHint starts the count again
 *  when the next practice does. */
let hintOffered = false;

/** A new practice round: the sign may be raised once more. Not called anywhere
 *  else — a card read on its own page gets at most one for the whole run, which
 *  is as much as it is worth. */
export function resetSoundHint() {
  hintOffered = false;
}
function setHintShowing(next: boolean) {
  if (hintShowing === next) return;
  hintShowing = next;
  for (const listener of hintListeners) listener(next);
}

/** Subscribe to whether the note should be up. Returns the unsubscribe. */
export function onSoundHint(listener: (showing: boolean) => void): () => void {
  hintListeners.add(listener);
  listener(hintShowing);
  return () => { hintListeners.delete(listener); };
}

/** Take it down now, without remembering anything.
 *
 *  For the other answer to the same question. Saying "can't listen now" says
 *  the sound is not wanted, which is an answer to a sign asking for more of it —
 *  so it goes, the way it goes when the key is pressed. Not dismissed for good:
 *  the person has told us about this minute, not about every one after it. */
export function hideSoundHint() {
  setHintShowing(false);
}

/** Put it away for good. */
export function dismissSoundHint() {
  hintDismissed = true;
  setHintShowing(false);
  void AsyncStorage.setItem(SOUND_HINT_KEY, '1').catch(() => {});
}

/** Whether the volume has been touched since the sign went up.
 *
 *  Any movement counts, in either direction, and not merely crossing back over
 *  AUDIBLE_VOLUME. The sign asks for one thing — the key — and the moment the
 *  key answers, it has been read: holding it up while somebody walks the volume
 *  up a notch at a time would make the thing they are being asked to press into
 *  the thing that will not go away. Turning it DOWN is an answer too: that is a
 *  person saying they meant it to be quiet.
 *
 *  `from` is null only where the sign went up without a reading, which cannot
 *  happen — shouldOfferSoundHint refuses a null — so it is treated as moved. */
export function volumeMoved(from: number | null, to: number): boolean {
  if (from === null) return true;
  // The system reports in sixteenths; anything smaller is noise, not a press.
  return Math.abs(to - from) > 0.01;
}

/** Watch the volume while the sign is up, so it goes the moment the key is
 *  pressed rather than waiting to be read and dismissed. This is the whole of
 *  what makes it worth standing it against a key: press the key, and the thing
 *  pointing at it leaves. */
export function watchVolumeWhileHinting(): () => void {
  let live = true;
  const timer = setInterval(() => {
    void outputVolume().then((volume) => {
      if (live && volume !== null && volumeMoved(hintVolume, volume)) setHintShowing(false);
    }).catch(() => {});
  }, VOLUME_POLL);

  return () => { live = false; clearInterval(timer); };
}

/** How often the volume is read while the sign is up. Fast enough that letting
 *  go of the key and looking at the screen finds it already gone.
 *
 *  A timer rather than a subscription: the only volume listener to hand belongs
 *  to react-native-volume-manager, which sets the session to .ambient to install
 *  it — the one category the ring/silent switch silences — and would undo
 *  playThroughSilence above. Reading a float three times a second, for the few
 *  seconds the sign is up, is the cheaper side of that trade. */
const VOLUME_POLL = 350;

/** How fast a word is said.
 *
 * iOS multiplies this by `AVSpeechUtteranceDefaultSpeechRate`, which is 0.5, so
 * these land at 0.45 and 0.125 of the engine's own scale: a shade under natural,
 * and deliberate enough to hear a word come apart into its syllables. `slow` was
 * 0.55 — two thirds of natural, which is the difference between someone talking
 * and the same person talking, not between hearing a word and studying it — and
 * then 0.35, which was still quicker than someone studying a word wants.
 *
 * It does not go much below this. Under about 0.2 the engine stops slowing speech
 * and starts stretching phonemes, and a word drawn out that far is harder to hear
 * than one said at a normal pace, not easier.
 */
export const speechRate = { natural: 0.9, slow: 0.25 } as const;

export type SpeakOptions = { languageCode?: string; rate?: number };

/**
 * `speaking` is true from the moment speech starts until it finishes, is stopped
 * or fails — what a button animates on. `unavailable` means this build has no
 * speech at all. The note about the volume is not here: it belongs to the screen
 * rather than to a button, so it is raised through `onSoundHint`.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const live = useRef(true);
  const mine = useRef(Symbol('speaker'));

  useEffect(() => {
    const owner = mine.current;
    live.current = true;
    return () => {
      live.current = false;
      if (speaker === owner) { speaker = null; stopSpeaking(); }
    };
  }, []);

  const speak = useCallback(async (text: string, options: SpeakOptions = {}) => {
    const spoken = text.trim();
    if (!spoken) return;
    const language = options.languageCode?.trim();
    try {
      await playThroughSilence();
      const Speech = speechModule();
      await Speech.stop();
      if (!live.current) return;
      speaker = mine.current;
      setSpeaking(true);
      const settle = () => { if (live.current) setSpeaking(false); };
      Speech.speak(spoken, {
        ...(language ? { language } : {}),
        rate: options.rate ?? speechRate.natural,
        onDone: settle, onStopped: settle, onError: settle,
      });
    } catch {
      if (live.current) { setUnavailable(true); setSpeaking(false); }
      return;
    }
    // Said. Now: was there any chance of hearing it? The volume is read after
    // speaking rather than before, so the word is never held up waiting on it.
    if (hintDismissed || hintOffered) return;
    const [seen, volume] = await Promise.all([
      AsyncStorage.getItem(SOUND_HINT_KEY).catch(() => null),
      outputVolume(),
    ]);
    if (seen) hintDismissed = true;
    const offer = shouldOfferSoundHint({ dismissed: hintDismissed, volume });
    if (!offer) return;
    hintVolume = volume;
    hintOffered = true;
    setHintShowing(true);
  }, []);

  return { speak, speaking, unavailable };
}
