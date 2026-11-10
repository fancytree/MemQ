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

export function setPendingTerms(terms: PendingTerm[], learningMode: 'language' | 'knowledge' = 'knowledge') {
  pending = terms;
  pendingLearningMode = learningMode;
}

export function getPendingLearningMode() { return pendingLearningMode; }

export function getPendingTerms(): PendingTerm[] | null {
  return pending;
}

export function clearPendingTerms() {
  pending = null;
  pendingLearningMode = 'knowledge';
}
