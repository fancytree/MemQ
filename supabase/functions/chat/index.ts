/**
 * One turn of chat, as a stream.
 *
 * Replaces chat-assistant. That one put about a dozen round trips in front of the
 * first word — three auth calls, three writes to the thread, the history, then a
 * model call it waited out in full, then a second model call from the client to
 * extract a term — which is why a greeting took seconds (spec §10). Here: one auth
 * call, one query, then tokens.
 *
 * Shape of the work:
 *   - the two lines (create, practice) have separate tool whitelists, separate
 *     quotas and separate prompts; the line arrives with the request, because the
 *     quota has to be charged before the model runs
 *   - server tools run here and feed back to the model; client tools are finished
 *     interfaces and end the turn
 *   - nothing is written to the person's lessons here. Drafting generates, the
 *     person ticks what they want in the app, and the app saves it
 *   - what the call actually cost is recorded after the stream closes, never on the
 *     way to it
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// The same specifier the shared tool layer types against. Two copies of this
// library — one from esm.sh, one from npm: — are two different types to the
// compiler, and the client would not be passable to chatToolset.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import OpenAI from 'https://esm.sh/openai@6.49.0';
import { isDirectUserSession } from '../_shared/directSession.ts';
import { budgetVerdict, ceilingMicros, costMicros, type TokenUsage } from '../_shared/chatCost.ts';
import { isChatComponent, parseComponentProps, type ChatComponentName } from '../_shared/chatComponents.ts';
import { CHAT_QUOTA, isChatMode, modelFor, SYSTEM_PROMPTS, type ChatMode } from '../_shared/chatModes.ts';
import { contextNote, readRequest, type ChatContext } from '../_shared/chatRequest.ts';
import { encodeEvent, errorStream, SSE_HEADERS, type ChatEvent } from '../_shared/chatStream.ts';
import { chatToolset, toResponsesTools, type ChatTool } from '../_shared/chatToolset.ts';
import {
  detailsById, draftLesson, draftLessonInput, slimForModel, withDetails,
  type LanguageDetails,
} from '../_shared/draftLesson.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * How many times the model may call server tools before it has to answer.
 *
 * Measured, not guessed. A create turn really goes list_lessons -> list_cards ->
 * draft_lesson -> show_card_drafts: three server rounds and then the interface. The
 * first bound here was 3, set from an assumption of "read, then draft", which left
 * no room at all — one extra look, or one retry after bad component props, and the
 * person was told it got stuck while nothing had gone wrong. Six leaves room for
 * that retry and a couple of looks. An unused round costs nothing; the loop ends as
 * soon as the model stops calling tools.
 */
const MAX_TOOL_ROUNDS = 6;
/** Enough context to hold a thread together without paying for all of it forever. */
const HISTORY_LIMIT = 20;
/** Work that must not delay the first token: recording what it cost, saving the
 *  turn. Falls back to a detached promise where the runtime has no waitUntil. */
function afterResponse(work: Promise<unknown>): void {
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(work);
  else void work.catch(() => {});
}

/** An opaque fingerprint for rate limiting. Quotas keyed only on the account reset
 *  with a new free signup (spec §11.1); this raises the cost of that without keeping
 *  anything about the person — the address and client are hashed with a secret and
 *  the inputs are never stored. Without a configured salt there is no fingerprint,
 *  rather than a guessable one. */
async function clientHash(req: Request): Promise<string | null> {
  const salt = Deno.env.get('AI_CLIENT_SALT');
  if (!salt) return null;
  const address = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const client = req.headers.get('x-client-info') || '';
  if (!address && !client) return null;
  const bytes = new TextEncoder().encode(`${salt}:${address}:${client}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Quotas are monthly (spec §9.4), counted in UTC so the window does not shift
 *  with where the caller happens to be. */
function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

type StreamEvent = {
  type?: string;
  delta?: string;
  response?: {
    output?: Array<Record<string, unknown>>;
    usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
  };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorStream('bad_request', 'Use POST.');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');
  if (!supabaseUrl || !anonKey || !openaiKey) {
    return errorStream('internal', 'Chat is not configured.');
  }

  const authorization = req.headers.get('Authorization') || '';
  if (!authorization || !isDirectUserSession(authorization)) {
    return errorStream('unauthorized', 'Sign in to use chat.');
  }

  // The caller's own privileges, never the service role: every tool below reads and
  // writes as them, so row-level security is what enforces ownership.
  const supabase: SupabaseClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // One auth round trip for the whole turn. The old assistant made three.
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorStream('unauthorized', 'Sign in to use chat.');

  const parsed = readRequest(await req.json().catch(() => null));
  if (!parsed.ok) return errorStream('bad_request', parsed.error);
  const { mode, message, context } = parsed.body;
  const quota = CHAT_QUOTA[mode];

  // Everything the gates need, in one go rather than one after another.
  const budgetClient = serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
  const [profile, spend, used, history, fingerprint] = await Promise.all([
    supabase.from('profiles').select('is_pro').eq('id', user.id).maybeSingle(),
    budgetClient ? budgetClient.rpc('ai_budget_today') : Promise.resolve({ data: 0, error: null }),
    supabase.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('feature', quota.feature).gte('created_at', startOfMonthUtc()),
    parsed.body.thread_id
      ? supabase.from('chat_messages').select('role, content')
          .eq('thread_id', parsed.body.thread_id).eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(HISTORY_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    clientHash(req),
  ]);

  const isPro = profile.data?.is_pro === true;

  // The day's ceiling first: it protects the project, so it outranks the per-caller
  // allowance. Paying callers pass it; free callers fall back to adding cards by hand.
  const spentMicros = typeof spend.data === 'number' ? spend.data : 0;
  const verdict = budgetVerdict(spentMicros, ceilingMicros((name) => Deno.env.get(name)), isPro);
  if (!verdict.allowed) {
    return errorStream('daily_budget', 'AI is resting for today. You can still add cards by hand, and it will be back tomorrow.');
  }
  // A failed count must not hand out free capacity, so treat it as spent.
  const usedCount = used.count ?? quota.free;
  if (!isPro && usedCount >= quota.free) {
    return errorStream('quota', 'You have used this month’s AI messages.');
  }

  const threadId = parsed.body.thread_id ?? crypto.randomUUID();
  const model = modelFor(mode, (name) => Deno.env.get(name));
  const openai = new OpenAI({ apiKey: openaiKey });

  /** The language details of whatever has been drafted this turn, by card id.
   *  They never go to the model — see `slimForModel` — and are put back on the way
   *  out, so the chat model is not paid to carry them twice. */
  const drafted = new Map<string, LanguageDetails>();

  const tools: ChatTool[] = chatToolset(mode, {
    supabase,
    userId: user.id,
    draft: async (args) => {
      const result = await draftLesson(draftLessonInput.parse(args), {
        fetch,
        functionsUrl: `${supabaseUrl}/functions/v1`,
        authorization,
      });
      for (const [id, details] of detailsById(result)) drafted.set(id, details);
      return slimForModel(result);
    },
  });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  const note = contextNote(context);
  const input: Array<Record<string, unknown>> = [
    // Oldest first: the query above reads newest-first so the limit keeps the recent end.
    ...[...(history.data ?? [])].reverse().map((row) => ({ role: row.role === 'assistant' ? 'assistant' : 'user', content: row.content })),
    ...(note ? [{ role: 'user', content: note }] : []),
    { role: 'user', content: message },
  ];

  const encoder = new TextEncoder();
  const usage: TokenUsage = { prompt: 0, cached: 0, completion: 0 };
  let toolCalls = 0;
  let answer = '';

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));
      try {
        send({ type: 'status', status: 'thinking' });

        for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
          const response = await openai.responses.create({
            model,
            instructions: SYSTEM_PROMPTS[mode],
            input: input as never,
            tools: toResponsesTools(tools) as never,
            // Our own history is the record; the provider keeps nothing.
            store: false,
            stream: true,
          });

          const calls: Array<{ call_id: string; name: string; args: string }> = [];
          let produced: Array<Record<string, unknown>> = [];

          for await (const raw of stream_(response)) {
            if (raw.type === 'response.output_text.delta' && raw.delta) {
              answer += raw.delta;
              send({ type: 'text', delta: raw.delta });
              continue;
            }
            if (raw.type === 'response.failed' || raw.type === 'response.incomplete') {
              throw new Error('upstream');
            }
            if (raw.type === 'response.completed' && raw.response) {
              const u = raw.response.usage;
              usage.prompt += u?.input_tokens ?? 0;
              usage.completion += u?.output_tokens ?? 0;
              usage.cached += u?.input_tokens_details?.cached_tokens ?? 0;
              produced = raw.response.output ?? [];
              for (const item of produced) {
                if (item.type === 'function_call' && typeof item.name === 'string') {
                  calls.push({
                    call_id: String(item.call_id ?? ''),
                    name: item.name,
                    args: typeof item.arguments === 'string' ? item.arguments : '{}',
                  });
                }
              }
            }
          }

          if (!calls.length) break;
          toolCalls += calls.length;

          // A client tool is a finished interface, so it ends the turn: forwarding it
          // and then asking the model for another line would pay the whole prefix
          // again to add a sentence nobody asked for.
          const component = calls.find((call) => isChatComponent(call.name));
          if (component) {
            let props: unknown;
            try { props = JSON.parse(component.args); } catch { props = null; }
            // Put back what the model was never given. Before validation, so the
            // props that reach the app are checked as a whole.
            props = withDetails(props, drafted);
            const checked = parseComponentProps(component.name as ChatComponentName, props);
            if (checked.ok) {
              send({ type: 'component', name: component.name, props: checked.props });
              break;
            }
            // Bad props: tell the model what was wrong and let it try once more.
            input.push(...produced, {
              type: 'function_call_output', call_id: component.call_id,
              output: JSON.stringify({ error: checked.error }),
            });
            continue;
          }

          if (round === MAX_TOOL_ROUNDS) {
            send({ type: 'text', delta: '\n\nI got stuck working that out. Could you say it another way?' });
            break;
          }

          send({ type: 'status', status: calls.some((c) => c.name === 'draft_lesson') ? 'drafting' : 'reading' });
          input.push(...produced);
          for (const call of calls) {
            const tool = byName.get(call.name);
            let output: string;
            if (!tool?.run) {
              output = JSON.stringify({ error: `${call.name} is not available.` });
            } else {
              try {
                output = JSON.stringify(await tool.run(JSON.parse(call.args || '{}')));
              } catch (error) {
                // The model may be able to correct itself, so it sees the refusal —
                // but only ever our own message, never a provider or database detail.
                output = JSON.stringify({ error: error instanceof Error ? error.message : 'That did not work.' });
              }
            }
            input.push({ type: 'function_call_output', call_id: call.call_id, output });
          }
        }

        send({ type: 'done', thread_id: threadId });
      } catch {
        send({ type: 'error', code: 'upstream', message: 'The model did not answer. Try again in a moment.' });
      } finally {
        controller.close();
        afterResponse(record({
          supabase, budgetClient, userId: user.id, mode, model, usage, toolCalls,
          clientHash: fingerprint, feature: quota.feature, threadId, message, answer,
          isNewThread: !parsed.body.thread_id,
        }));
      }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, ...SSE_HEADERS } });
});

/** The SDK's stream is async-iterable; this narrows it to the few fields read above
 *  rather than leaning on a provider type that changes between versions. Unknown
 *  event kinds fall through and are ignored. */
async function* stream_(response: unknown): AsyncGenerator<StreamEvent> {
  for await (const event of response as AsyncIterable<StreamEvent>) yield event;
}

type RecordArgs = {
  supabase: SupabaseClient;
  budgetClient: SupabaseClient | null;
  userId: string;
  mode: ChatMode;
  model: string;
  usage: TokenUsage;
  toolCalls: number;
  clientHash: string | null;
  feature: string;
  threadId: string;
  message: string;
  answer: string;
  isNewThread: boolean;
};

/** What the turn cost and what was said, written after the stream has closed.
 *  Nothing here is allowed to fail the turn: the person already has their answer. */
async function record(args: RecordArgs): Promise<void> {
  const spent = costMicros(args.model, args.usage);
  await Promise.allSettled([
    args.supabase.from('ai_usage').insert({
      user_id: args.userId,
      feature: args.feature,
      model: args.model,
      mode: args.mode,
      prompt_tokens: args.usage.prompt,
      cached_tokens: args.usage.cached,
      completion_tokens: args.usage.completion,
      tool_calls: args.toolCalls,
      client_hash: args.clientHash,
    }),
    args.budgetClient?.rpc('ai_budget_add', { p_micros: spent }) ?? Promise.resolve(),
    args.isNewThread
      ? args.supabase.from('chat_threads').insert({
          user_id: args.userId, thread_id: args.threadId, mode: args.mode,
          // The first thing asked is the best title available without paying a model to write one.
          title: args.message.slice(0, 80),
        })
      : args.supabase.from('chat_threads').update({ updated_at: new Date().toISOString() })
          .eq('thread_id', args.threadId).eq('user_id', args.userId),
  ]);
  // After the thread exists, so the foreign key holds.
  const rows = [{ thread_id: args.threadId, user_id: args.userId, role: 'user', content: args.message }];
  if (args.answer.trim()) rows.push({ thread_id: args.threadId, user_id: args.userId, role: 'assistant', content: args.answer });
  await args.supabase.from('chat_messages').insert(rows);
}
