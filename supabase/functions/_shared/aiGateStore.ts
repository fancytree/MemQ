/**
 * The gate's hands: the real database behind `aiGate.ts`, built from a request.
 *
 * Kept apart from the rules so the rules can be tested with nothing but values.
 * Reads and the usage row go through the caller's own token, so row-level security
 * decides what is theirs. Only the day's budget uses the service role: it is the
 * project's total, and no caller may read or write it.
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import {
  addUsage, admit, INTERNAL_HEADER, NO_USAGE, type Admission, type Allowance, type Gate, type GateStore,
} from './aiGate.ts';
import type { TokenUsage } from './chatCost.ts';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${INTERNAL_HEADER}`,
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

/** Work that must not hold up the reply: filing what it cost. Falls back to a
 *  detached promise where the runtime has no waitUntil. */
export function afterResponse(work: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else void work.catch(() => {});
}

export function storeFor(supabase: SupabaseClient, budget: SupabaseClient | null): GateStore {
  return {
    userId: async () => {
      try {
        const { data, error } = await supabase.auth.getUser();
        return !error && data.user ? data.user.id : null;
      } catch { return null; }
    },
    isPro: async (userId) => {
      const { data } = await supabase.from('profiles').select('is_pro').eq('id', userId).maybeSingle();
      return data?.is_pro === true;
    },
    used: async (userId, feature, since) => {
      let query = supabase.from('ai_usage').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('feature', feature);
      if (since) query = query.gte('created_at', since);
      const { count, error } = await query;
      return error || typeof count !== 'number' ? null : count;
    },
    spentToday: async () => {
      if (!budget) return 0;
      const { data } = await budget.rpc('ai_budget_today');
      return typeof data === 'number' ? data : 0;
    },
    record: async (row) => { await supabase.from('ai_usage').insert(row); },
    addSpend: async (micros) => { if (budget) await budget.rpc('ai_budget_add', { p_micros: micros }); },
  };
}

export type Opened =
  | { ok: true; admission: Extract<Admission, { ok: true }>; supabase: SupabaseClient; service: SupabaseClient | null; authorization: string }
  | { ok: false; response: Response };

/** Everything a function needs to do before it spends anything, in one call. */
export async function openGate(req: Request, allowance: Allowance): Promise<Opened> {
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || undefined;
  if (!url || !anon) return { ok: false, response: json({ error: 'Not configured' }, 500) };

  const authorization = req.headers.get('Authorization') || '';
  const supabase: SupabaseClient = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const service: SupabaseClient | null = serviceKey
    ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;

  const admission = await admit({
    store: storeFor(supabase, service),
    allowance, authorization, serviceKey,
    internalHeader: req.headers.get(INTERNAL_HEADER),
    env: (name) => Deno.env.get(name),
  });
  if (!admission.ok) return { ok: false, response: json(admission.body, admission.status) };
  return { ok: true, admission, supabase, service, authorization };
}

/**
 * What one request has spent so far, between the door and the reply.
 *
 * A function may call the model more than once (a batch that had to be repaired),
 * and may fail after it has paid. This keeps the running total and files it the
 * right way at the end: as a use when the work was delivered, as cost only when
 * it was not.
 */
export type Meter = {
  add: (model: string, usage: TokenUsage) => void;
  /** The work was delivered: count a use and file the cost. */
  done: () => void;
  /** It was not: file whatever was already spent, and charge the person nothing. */
  failed: () => void;
};

export function meter(gate: Gate): Meter {
  let model = '';
  let usage: TokenUsage = NO_USAGE;
  let paid = false;
  return {
    add: (name, used) => { model = name; usage = addUsage(usage, used); paid = true; },
    done: () => afterResponse(gate.settle(model, usage)),
    failed: () => { if (paid) afterResponse(gate.settle(model, usage, { counted: false })); },
  };
}
