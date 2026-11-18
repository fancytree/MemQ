/**
 * Reading "no" from an AI function.
 *
 * The functions that call a model now decide for themselves whether someone has
 * any left (supabase/functions/_shared/aiGate.ts). When the answer is no they say
 * so with a code and a sentence written to be shown as it is — "you have used this
 * month's AI-generated lessons, you can still add cards by hand" — rather than
 * failing in a way the app would report as an error.
 *
 * No imports, so it can be tested without the app around it.
 */

export type RefusalCode =
  /** Their allowance for this is used up. The one where Pro is the answer. */
  | 'quota'
  /** The project's own ceiling for the day. Nothing they can do but wait. */
  | 'daily_budget'
  /** The file is bigger than is read. */
  | 'too_large';

const CODES: RefusalCode[] = ['quota', 'daily_budget', 'too_large'];

export class AIRefused extends Error {
  readonly code: RefusalCode;
  constructor(code: RefusalCode, message: string) {
    super(message);
    this.name = 'AIRefused';
    this.code = code;
  }
}

/** The refusal in a function's reply, or null if the reply was not one. */
export function refusalFrom(body: unknown): AIRefused | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  const code = CODES.find((known) => known === value.code);
  if (!code) return null;
  const message = typeof value.message === 'string' && value.message.trim()
    ? value.message.trim() : 'That is not available right now.';
  return new AIRefused(code, message);
}
