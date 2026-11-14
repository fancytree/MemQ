/**
 * What a practice round asks, kept between sessions.
 *
 * It lives on the device rather than in the database: it is a preference about how
 * this person likes to practise, it is read before the first question is picked, and
 * a round should not wait on the network to find out what to ask.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PRACTICE_SETTINGS, type PracticeSettings } from '@/components/PracticeSettingsModal';

const KEY = 'memq.practiceSettings.v1';

export async function loadPracticeSettings(): Promise<PracticeSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRACTICE_SETTINGS;
    const saved = JSON.parse(raw) as Partial<PracticeSettings>;
    const modes = { ...DEFAULT_PRACTICE_SETTINGS.modes, ...(saved.modes ?? {}) };
    // A stored state with everything off would leave a round with nothing to ask.
    const anyOn = modes.flip || modes.mcq || modes.recall;
    return {
      modes: anyOn ? modes : DEFAULT_PRACTICE_SETTINGS.modes,
      grading: saved.grading === 'strict' ? 'strict' : 'relaxed',
    };
  } catch {
    return DEFAULT_PRACTICE_SETTINGS;
  }
}

export async function savePracticeSettings(settings: PracticeSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* a preference, not data */ }
}
