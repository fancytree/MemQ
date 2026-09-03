/**
 * In-memory store used to hand off collected terms from /create → /create-name.
 * Cleared automatically after the lesson is created.
 */

export interface PendingTerm {
  term: string;
  definition: string;
  explanation: string | null;
}

let pending: PendingTerm[] | null = null;

export function setPendingTerms(terms: PendingTerm[]) {
  pending = terms;
}

export function getPendingTerms(): PendingTerm[] | null {
  return pending;
}

export function clearPendingTerms() {
  pending = null;
}
