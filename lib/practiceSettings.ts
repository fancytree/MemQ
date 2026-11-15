/**
 * What a practice round asks, kept between sessions.
 *
 * It lives on the device rather than in the database: it is a preference about how
 * this person likes to practise, it is read before the first question is picked, and
 * a round should not wait on the network to find out what to ask.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_PRACTICE_SETTINGS, normalizePracticeSettings, type PracticeSettings } from '@/lib/practiceModes';

const KEY = 'memq.practiceSettings.v1';

export async function loadPracticeSettings(): Promise<PracticeSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_PRACTICE_SETTINGS;
    return normalizePracticeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_PRACTICE_SETTINGS;
  }
}

export async function savePracticeSettings(settings: PracticeSettings): Promise<void> {
  try { await AsyncStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* a preference, not data */ }
}
