/**
 * What is left of the free allowance, and asking an AI function for something.
 *
 * The limits are enforced where the model is called, not here: every AI function
 * counts and refuses for itself (supabase/functions/_shared/aiGate.ts). This file
 * used to be the only check there was — the app counted its own requests, wrote
 * the count itself, and stopped asking when it reached three. Anything that did
 * not ask through the app was never counted.
 *
 * What stays here is for the screen: how many are left, so the button can say so
 * before it is pressed. The numbers below mirror the server's and are only ever
 * used to draw; if the two disagree the server is right, and its refusal arrives
 * as an `AIRefused` with a sentence to show.
 */

import { AIRefused, refusalFrom } from '@/lib/aiRefusal';
import { supabase } from '@/lib/supabase';

export { AIRefused } from '@/lib/aiRefusal';

export type AIFeature = 'lesson_generate' | 'pdf_process';

/** Mirrors ALLOWANCES in supabase/functions/_shared/aiGate.ts. Keep the two in step. */
export const AI_LIMITS: Record<AIFeature, { free: number; period: 'month' | 'lifetime' }> = {
  lesson_generate: { free: 5, period: 'month' },
  pdf_process: { free: 3, period: 'lifetime' },
};

/** The UTC start of the window a limit is counted over, or null for "ever". */
function periodStart(period: 'month' | 'lifetime'): Date | null {
  if (period === 'lifetime') return null;
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** How many times this person has used `feature` in the current window. The rows
 *  are written by the server when a request succeeds; this only reads them. */
export async function getAIUsageCount(feature: AIFeature, userId: string): Promise<number> {
  const since = periodStart(AI_LIMITS[feature].period);
  let query = supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature);
  if (since) query = query.gte('created_at', since.toISOString());
  const { count, error } = await query;
  // Unknown is shown as none used: the button stays live and the server decides.
  if (error) return 0;
  return count ?? 0;
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
