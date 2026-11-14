/**
 * In-memory store used to hand off collected terms from /create → /create-name.
 * Cleared automatically after the lesson is created.
 */

export interface PendingTerm {
  term: string;
  definition: string;
  explanation: string | null;
  language_data?: import('./languageCard').LanguageCardData | null;
}

let pending: PendingTerm[] | null = null;
let pendingLearningMode: 'language' | 'knowledge' = 'knowledge';
let pendingSource = '';

export function setPendingTerms(
  terms: PendingTerm[],
  learningMode: 'language' | 'knowledge' = 'knowledge',
  /** What the cards were made from: the sentence the person typed, or the name of
   *  the file they picked. The naming screen opens with this already worked into a
   *  title, so they are editing a suggestion instead of starting from an empty box. */
  source = '',
) {
  pending = terms;
  pendingLearningMode = learningMode;
  pendingSource = source;
}

export function getPendingLearningMode() { return pendingLearningMode; }
export function getPendingSource() { return pendingSource; }

/** A lesson title and description read out of whatever the cards were made from.
 *
 * A title is a label, not a summary, so this reaches for the shortest honest piece of
 * what was given: the first sentence, and inside that the first clause, because "Daily
 * greetings in Italian, the ones you actually use in a shop" is one name followed by
 * an aside. Only when neither is short enough does it cut at a word, which is the one
 * case that can read oddly — and it is a suggestion in an editable box, so a wrong
 * guess costs a keystroke.
 *
 * The description keeps everything that was given, and only when there is more of it
 * than the title already says.
 */
const TITLE_MAX = 42;
const TITLE_MIN = 8;

export function lessonFromSource(source: string): { name: string; description: string } {
  const text = source.replace(/\s+/g, ' ').trim();
  if (!text) return { name: '', description: '' };

  let name = text.split(/(?<=[.!?。！？])\s/)[0] ?? text;
  if (name.length > TITLE_MAX) {
    const clause = name.split(/[,;:，、；：—–]\s*/)[0] ?? name;
    if (clause.length >= TITLE_MIN) name = clause;
  }
  if (name.length > TITLE_MAX) {
    const cut = name.slice(0, TITLE_MAX);
    const space = cut.lastIndexOf(' ');
    name = space >= TITLE_MIN ? cut.slice(0, space) : cut;
  }
  name = name.replace(/[\s.,;:!?。，、；：！？]+$/, '').trim();
  name = name.charAt(0).toUpperCase() + name.slice(1);

  const description = text.length > name.length ? text.slice(0, 240).trim() : '';
  return { name, description };
}

export function getPendingTerms(): PendingTerm[] | null {
  return pending;
}

export function clearPendingTerms() {
  pending = null;
  pendingLearningMode = 'knowledge';
  pendingSource = '';
}
