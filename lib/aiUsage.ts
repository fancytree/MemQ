/**
 * What is left of the free allowance, and asking an AI function for something.
 *
 * The limits are enforced where the model is called, not here: every AI function
 * counts and refuses for itself (supabase/functions/_shared/aiGate.ts). This file
 * used to be the only check there was — the app counted its own requests, wrote
 * the count itself, and stopped asking when it reached three. Anything that did
 * not ask through the app was never counted.
 *
 * What stays here is for the screen: how much of the month's allowance is left,
 * so a button can say so before it is pressed (lib/aiCredits.ts has the numbers).
 * If the app and the server disagree the server is right, and its refusal arrives
 * as an `AIRefused` with a sentence to show.
 */

import { CREDIT_FEATURES, creditPeriodStart, creditsSpent, type CreditUse } from '@/lib/aiCredits';
import { AIRefused, refusalFrom } from '@/lib/aiRefusal';
import { supabase } from '@/lib/supabase';

export { AIRefused } from '@/lib/aiRefusal';

/**
 * How many of the month's AI credits this person has spent, or null if it could
 * not be read. The rows are written by the server when a request succeeds; this
 * only counts them — one count for each kind of use, asked for together.
 */
export async function getCreditsSpent(userId: string): Promise<number | null> {
  const since = creditPeriodStart();
  const counts = await Promise.all(CREDIT_FEATURES.map(async (feature) => {
    const { count, error } = await supabase
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('feature', feature)
      .gte('created_at', since);
    return error || typeof count !== 'number' ? null : count;
  }));
  return creditsSpent(Object.fromEntries(CREDIT_FEATURES.map((feature, at) => [feature, counts[at]])));
}

/** Each use of the month's credits, newest first, for the credits page. The
 *  person's own rows only: row-level security decides that. */
export async function getCreditUses(userId: string, limit = 100): Promise<CreditUse[]> {
  const { data, error } = await supabase
    .from('ai_usage')
    .select('id, feature, created_at')
    .eq('user_id', userId)
    .in('feature', [...CREDIT_FEATURES])
    .gte('created_at', creditPeriodStart())
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .filter((row) => typeof row.id === 'string' && typeof row.feature === 'string' && typeof row.created_at === 'string')
    .map((row) => ({ id: row.id as string, feature: row.feature as string, created_at: row.created_at as string }));
}

/**
 * Ask an AI function for something.
 *
 * Throws `AIRefused` when the server said no for a reason the person should be
 * told in its own words, and a plain Error otherwise.
 */
export async function callAI<T = Record<string, unknown>>(name: string, body: unknown, fallback: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body: body as Record<string, unknown> });
  if (!error) return data as T;

  // A refusal comes back as a non-2xx reply; its body is on the error's context.
  const context = (error as { context?: unknown }).context;
  if (context && typeof (context as Response).json === 'function') {
    let reply: unknown = null;
    try { reply = await (context as Response).clone().json(); } catch { /* not JSON: an ordinary failure */ }
    const refused = refusalFrom(reply);
    if (refused) throw refused;
    const said = reply && typeof reply === 'object' ? (reply as Record<string, unknown>).message : null;
    if (typeof said === 'string' && said.trim()) throw new Error(said.trim());
  }
  throw new Error(fallback);
}
