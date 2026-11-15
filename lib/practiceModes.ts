/**
 * What a practice round may ask, and how a typed answer is marked.
 * Kept free of imports so the round can be built, and tested, without the app.
 */

/**
 * The kinds of question a person can turn on and off. Each covers a family:
 *
 *   flip    a flashcard: look, turn it over, say whether you knew
 *   mcq     pick one of four — a meaning, a synonym, an opposite, the word for a gap
 *   match   pair several cards with their meanings at once
 *   recall  type it — the meaning, or the word itself spelled from memory
 *   listen  hear it, then type it (dictation) or pick what it means
 *   build   put the words of a sentence in order
 *
 * `listen` and `build` need a language card; a round simply never offers them otherwise.
 */
export type PracticeMode = 'flip' | 'mcq' | 'match' | 'recall' | 'listen' | 'build';
export const PRACTICE_MODES: PracticeMode[] = ['flip', 'mcq', 'match', 'recall', 'listen', 'build'];

export type PracticeSettings = {
  /** Which kinds a round may ask. At least one is always on. */
  modes: Record<PracticeMode, boolean>;
  /** How a typed answer is marked; see lib/answerCheck. */
  grading: 'relaxed' | 'strict';
};

export const DEFAULT_PRACTICE_SETTINGS: PracticeSettings = {
  modes: { flip: true, mcq: true, match: true, recall: true, listen: true, build: true },
  grading: 'relaxed',
};

/** Whatever was stored, as settings a round can be built from. Kinds added since it
 *  was stored come in switched on. */
export function normalizePracticeSettings(saved: unknown): PracticeSettings {
  const raw = saved && typeof saved === 'object' ? saved as { modes?: unknown; grading?: unknown } : {};
  const stored = raw.modes && typeof raw.modes === 'object' ? raw.modes as Record<string, unknown> : {};
  const modes = { ...DEFAULT_PRACTICE_SETTINGS.modes };
  for (const mode of PRACTICE_MODES) if (typeof stored[mode] === 'boolean') modes[mode] = stored[mode] as boolean;
  // A stored state with everything off would leave a round with nothing to ask.
  const anyOn = PRACTICE_MODES.some((mode) => modes[mode]);
  return {
    modes: anyOn ? modes : { ...DEFAULT_PRACTICE_SETTINGS.modes },
    grading: raw.grading === 'strict' ? 'strict' : 'relaxed',
  };
}
