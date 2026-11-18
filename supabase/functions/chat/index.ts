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
 *   - this file is the gates, the inputs and the record. The turn itself — call
 *     the model, run a tool, stop — is chatRun.ts, where it can be tested
 *   - nothing is written to the person's lessons here. Drafting generates, the
 *     person ticks what they want in the app, and the app saves it
 *   - what the call actually cost is recorded after the stream closes, never on the
 *     way to it
 *   - what is worth remembering about the person is worked out after that again,
 *     every few messages, by a call of its own (chatMemory.ts)
 */

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// The same specifier the shared tool layer types against. Two copies of this
// library — one from esm.sh, one from npm: — are two different types to the
// compiler, and the client would not be passable to chatToolset.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@^2';
import OpenAI from 'https://esm.sh/openai@6.49.0';
import { isDirectUserSession } from '../_shared/directSession.ts';
import { budgetVerdict, ceilingMicros, costMicros, type TokenUsage } from '../_shared/chatCost.ts';
import { CHAT_QUOTA, forcedTool, modelFor, SYSTEM_PROMPTS, type ChatMode } from '../_shared/chatModes.ts';
import { contextNote, readRequest } from '../_shared/chatRequest.ts';
import { LESSONS_IN_CONTEXT, shelfNote, shelve } from '../_shared/chatLessons.ts';
import { HISTORY_LIMIT, historyInput, rewind, turnRows, type Drawn, type HistoryRow } from '../_shared/chatHistory.ts';
import {
  lookOver, MEMORY_MAX, memoryNote, recentTalk, shouldRemember, type Remembered,
} from '../_shared/chatMemory.ts';
import { framing, readAttachments, refusalMessage, type FilePart } from '../_shared/chatFile.ts';
import { ownedPdfPath, signOwnedPdfReference } from '../_shared/pdfReference.ts';
import { internalToken } from '../_shared/aiGate.ts';
import { encodeEvent, errorStream, SSE_HEADERS, type ChatEvent } from '../_shared/chatStream.ts';
import { chatToolset } from '../_shared/chatToolset.ts';
import { MAX_OUTPUT_TOKENS, runTurn, TurnFailed, type ModelEvent } from '../_shared/chatRun.ts';
import { draftLesson } from '../_shared/draftLesson.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
/**
 * What this part would cost, asked before it is paid for.
 *
 * The provider will count the input of a request without running it, which is the
 * only exact answer available: a page's worth of tokens depends on what is on the
 * page, so anything computed on this side from bytes or page counts would be a
 * guess. Only the file part is counted, not the whole turn — the number refuses a
 * document that is too long, and the rest of the turn is not the document's fault.
 *
 * Throws rather than returning a number it does not have, so the caller can decide
 * what a missing count means. It does not stop the turn: the daily ceiling is still
 * there behind it.
 */
async function countInputTokens(key: string, model: string, part: FilePart): Promise<number> {
  const response = await fetch('https://api.openai.com/v1/responses/input_tokens', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: [{ role: 'user', content: [part] }] }),
  });
  if (!response.ok) throw new Error(`input_tokens said ${response.status}`);
  const counted = (await response.json())?.input_tokens;
  if (typeof counted !== 'number' || !Number.isFinite(counted)) throw new Error('no count');
  return counted;
}

function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

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
  const [profile, spend, used, history, lessons, remembered, fingerprint] = await Promise.all([
    supabase.from('profiles').select('is_pro').eq('id', user.id).maybeSingle(),
    budgetClient ? budgetClient.rpc('ai_budget_today') : Promise.resolve({ data: 0, error: null }),
    supabase.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('feature', quota.feature).gte('created_at', startOfMonthUtc()),
    parsed.body.thread_id
      ? supabase.from('chat_messages').select('id, role, content')
          .eq('thread_id', parsed.body.thread_id).eq('user_id', user.id)
          .order('created_at', { ascending: false }).limit(HISTORY_LIMIT)
      : Promise.resolve({ data: [], error: null }),
    /* Riding along with the gates rather than waiting its turn: this is why the
     * model can name a lesson, and point a tool at one, without a call to go and
     * find out what there is (chatLessons.ts). */
    supabase.from('lessons').select('id, name, learning_mode', { count: 'exact' }).eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(LESSONS_IN_CONTEXT),
    /* What Inkling knows about them from before, read alongside everything else
     * so that knowing someone costs no waiting (chatMemory.ts). */
    supabase.from('user_memories').select('id, content').eq('user_id', user.id)
      .order('created_at', { ascending: true }).limit(MEMORY_MAX),
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
  const allowed = isPro ? quota.pro : quota.free;
  const usedCount = used.count ?? allowed;
  if (usedCount >= allowed) {
    // Paying lifts the allowance a long way; it does not make an account an API.
    return errorStream('quota', isPro
      ? 'That is more than this account can use for now. It will be back next month.'
      : 'You have used this month’s AI messages.');
  }

  const threadId = parsed.body.thread_id ?? crypto.randomUUID();
  const model = modelFor(mode, (name) => Deno.env.get(name));
  const openai = new OpenAI({ apiKey: openaiKey });

  /* Null when the read failed, which is not the same as having none: a turn
   * without the list is one where the model stays unspecific, and that is still
   * honest. A wrong list would not be. */
  const shelf = lessons.error ? null : shelve(lessons.data as Array<Record<string, unknown>>, lessons.count);

  const tools = chatToolset(mode, {
    shelf,
    cards: async (lessonId, limit) => {
      // Row-level security is what makes this theirs; the lesson id itself only
      // ever comes from their own shelf.
      const { data, error, count } = await supabase.from('terms')
        .select('term, definition', { count: 'exact' })
        .eq('lesson_id', lessonId).order('created_at', { ascending: false }).limit(limit);
      if (error) throw new Error('unreadable');
      return { cards: (data ?? []) as Array<{ term: string; definition: string }>, total: count ?? (data ?? []).length };
    },
    draft: (args) => draftLesson(args, {
      fetch, functionsUrl: `${supabaseUrl}/functions/v1`, authorization,
      // This turn has already been counted as a chat message. Signed, so the
      // generator does not also count it as one of their generated lessons.
      internal: () => (serviceKey ? internalToken(serviceKey, user.id) : Promise.resolve(null)),
    }),
  });

  /* Null when it could not be read. Then nothing is said about them this turn,
   * and — the part that matters — nothing is rewritten afterwards either: a list
   * rebuilt from "nothing yet" would replace the one that is really there. */
  const memories: Remembered[] | null = remembered.error
    ? null
    : ((remembered.data ?? []) as Array<{ id: unknown; content: unknown }>)
        .filter((row): row is Remembered => typeof row.id === 'string' && typeof row.content === 'string');

  /* A question asked again replaces the answer it got. The exchange, and whatever
   * followed it, leaves the model's view now and the table afterwards. */
  const past = (history.data ?? []) as HistoryRow[];
  const { kept, dropped } = parsed.body.retry ? rewind(past, message) : { kept: past, dropped: [] };

  /* The file goes in ahead of the question, so the model has read it before it is
   * asked anything about it, wrapped in the rule that it is data (chatFile.ts).
   *
   * It rides on this one turn only. The client clears it after sending, and the
   * history rows keep the question and the answer but not the document: a file
   * re-sent every turn would be paid for every turn, and by then the answer
   * already says what was in it.
   *
   * A file that cannot be read ends the turn here. Answering the question anyway
   * would mean answering as if the document said nothing, which is worse than
   * saying plainly that it could not be opened. */
  let fileParts: FilePart[] = [];
  const attachments = parsed.body.attachments;
  if (attachments.length) {
    const read = await readAttachments(attachments, {
      sign: (reference) => signOwnedPdfReference(
        reference, supabaseUrl,
        () => supabase.auth.getUser(),
        (path) => supabase.storage.from('pdfs').createSignedUrl(path, 15 * 60),
        Deno.env.get('SUPABASE_PUBLIC_URL') || undefined,
      ),
      fetch,
      countTokens: (part) => countInputTokens(openaiKey, model, part),
    });
    if (!read.ok) return errorStream('bad_request', refusalMessage(read.reason));
    fileParts = read.parts;
  }

  /* Order is what the cache is made of.
   *
   * The provider caches a prefix once it is long enough (about a thousand tokens)
   * and identical to one it has just seen. So everything is laid out from what
   * changes least to what changes most: instructions and tools never change; the
   * lessons are the same for a whole conversation unless one is added, and what
   * is remembered about the person changes less often than that; the history
   * only grows at its end; and what is new this turn — where it came from, the
   * file, the question — comes last.
   *
   * The lessons used to sit after the history. That was measured, not guessed: the
   * instructions and tools together come to just under the threshold, so with the
   * list behind a growing history the stable prefix was never long enough and the
   * second and third turns of a conversation were paid for in full. In front of
   * the history, the prefix is the whole of the previous turn. */
  const known = shelfNote(shelf);
  const about = memoryNote(memories);
  const note = contextNote(context);
  const fence = attachments.length ? framing(attachments.map((file) => file.name)) : null;
  const input: Array<Record<string, unknown>> = [
    ...(about ? [{ role: 'user', content: about }] : []),
    ...(known ? [{ role: 'user', content: known }] : []),
    ...historyInput(kept),
    ...(note ? [{ role: 'user', content: note }] : []),
    ...(fileParts.length && fence ? [{ role: 'user', content: [
      { type: 'input_text', text: fence.before },
      ...fileParts,
      { type: 'input_text', text: fence.after },
    ] }] : []),
    { role: 'user', content: message },
  ];

  const encoder = new TextEncoder();
  let outcome: { answer: string; notes: string[]; shown: Drawn[]; toolCalls: number; usage: TokenUsage } =
    { answer: '', notes: [], shown: [], toolCalls: 0, usage: { prompt: 0, cached: 0, completion: 0 } };

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(encodeEvent(event)));
      let failed = false;
      try {
        outcome = await runTurn({
          tools, send,
          forced: forcedTool(mode, parsed.body.intent),
          call: async (request) => await openai.responses.create({
            model,
            instructions: SYSTEM_PROMPTS[mode],
            input: request.input as never,
            tools: request.tools as never,
            ...(request.toolChoice ? { tool_choice: request.toolChoice as never } : {}),
            /* No reasoning pass before the first token. What is left for this
             * model is "say the thing in eighty words" or "name the tool": the
             * hard part was taken out of its hands on purpose. Reasoning tokens
             * are billed as output, so that pause was paid for twice.
             *
             * Spelled `reasoning: { effort }`, not `reasoning_effort`: this calls
             * responses, which rejects the flat name outright. */
            ...(model === 'gpt-6-luna' ? { reasoning: { effort: 'none' as const } } : {}),
            max_output_tokens: MAX_OUTPUT_TOKENS,
            // Our own history is the record; the provider keeps nothing.
            store: false,
            stream: true,
          }) as unknown as AsyncIterable<ModelEvent>,
        }, input);
        send({ type: 'done', thread_id: threadId });
      } catch (error) {
        failed = true;
        if (error instanceof TurnFailed) outcome = error.partial;
        send({ type: 'error', code: 'upstream', message: 'The model did not answer. Try again in a moment.' });
      } finally {
        controller.close();
        const said = outcome.answer;
        afterResponse(record({
          supabase, budgetClient, userId: user.id, mode, model,
          usage: outcome.usage, toolCalls: outcome.toolCalls,
          clientHash: fingerprint, feature: quota.feature, threadId, message,
          answer: said, notes: outcome.notes, shown: outcome.shown, failed, dropped,
          isNewThread: !parsed.body.thread_id,
        }).then(() => {
          /* After the record, and only when there is something to look at: a turn
           * that answered, a list that was read, and either the person saying
           * "remember" or enough messages gone by. `usedCount` is how many they
           * had sent on this line before this one, already counted for the quota,
           * so "every few" costs no query of its own. */
          /* The files rode on this one message and are not opened again (see
           * above), so they go now rather than sitting in storage for good. */
          const spent = attachments
            .map((file) => ownedPdfPath(file.url, supabaseUrl, user.id, Deno.env.get('SUPABASE_PUBLIC_URL') || undefined))
            .filter((path): path is string => !!path);
          if (spent.length && budgetClient) {
            void Promise.resolve(budgetClient.storage.from('pdfs').remove(spent)).catch(() => {});
          }
          if (failed || !memories || !shouldRemember(usedCount + 1, message)) return;
          return remember({
            supabase, budgetClient, openai, userId: user.id, mode, model,
            clientHash: fingerprint, memories, message,
            talk: recentTalk(kept, message, said),
          });
        }));
      }
    },
  });

  return new Response(stream, { headers: { ...corsHeaders, ...SSE_HEADERS } });
});

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
  notes: string[];
  /** The interfaces the notes stand for, kept so the app can draw them again. */
  shown: Drawn[];
  /** A turn the model never answered. Its cost is still recorded; the question is
   *  not, so that asking again does not leave it in the thread twice. */
  failed: boolean;
  /** Rows a retry replaced. */
  dropped: string[];
  isNewThread: boolean;
};

/** What the turn cost and what was said, written after the stream has closed.
 *  Nothing here is allowed to fail the turn: the person already has their answer. */
async function record(args: RecordArgs): Promise<void> {
  const spent = costMicros(args.model, args.usage);
  await Promise.allSettled([
    // A turn the model never answered is not charged to the person's allowance.
    // What it cost the project still goes on the day's budget, below.
    args.failed ? Promise.resolve() : args.supabase.from('ai_usage').insert({
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
    args.dropped.length
      ? args.supabase.from('chat_messages').delete().in('id', args.dropped).eq('user_id', args.userId)
      : Promise.resolve(),
  ]);
  if (args.failed) return;
  /* After the thread exists, so the foreign key holds. Each row gets its own
   * instant: rows written by one statement share a timestamp, and history is read
   * back in time order — an answer filed before its own question is a
   * conversation the model reads backwards. */
  const now = Date.now();
  const rows = turnRows(args.message, args.answer, args.notes, args.shown).map((row, at) => ({
    thread_id: args.threadId, user_id: args.userId, role: row.role, content: row.content,
    created_at: new Date(now + at).toISOString(),
    // Only on the rows that have one. A row that stands for an interface is filed
    // under the id the app was given for it when it was drawn.
    ...(row.id ? { id: row.id } : {}),
    ...(row.payload ? { payload: row.payload } : {}),
  }));
  /* Words first, on their own: they are the conversation. The rows that carry an
   * interface go second, so that if they cannot be written — the one way this can
   * fail that the others cannot — the question and the answer are still kept. */
  const plain = rows.filter((row) => !('payload' in row));
  const drawn = rows.filter((row) => 'payload' in row);
  if (plain.length) await args.supabase.from('chat_messages').insert(plain);
  if (drawn.length) await args.supabase.from('chat_messages').insert(drawn);
}

type RememberArgs = {
  supabase: SupabaseClient;
  budgetClient: SupabaseClient | null;
  openai: OpenAI;
  userId: string;
  mode: ChatMode;
  model: string;
  clientHash: string | null;
  memories: Remembered[];
  message: string;
  talk: Array<{ role: string; content: string }>;
};

/** What the person's allowance never sees: looking a conversation over is the
 *  app's own housekeeping, so it is counted for the project and not against them. */
const MEMORY_FEATURE = 'ai_memory';

/**
 * Look the last few exchanges over and bring the list up to date.
 *
 * Runs after the answer has gone and the turn is recorded, so it can take as long
 * as it takes and fail without anyone noticing — a memory not written today is
 * written the next time the conversation is looked at.
 */
async function remember(args: RememberArgs): Promise<void> {
  try {
    const { changes, usage } = await lookOver(async (request) => await args.openai.responses.create({
      model: args.model,
      instructions: request.instructions,
      input: request.input as never,
      tools: request.tools as never,
      tool_choice: request.toolChoice as never,
      ...(args.model === 'gpt-6-luna' ? { reasoning: { effort: 'none' as const } } : {}),
      // A dozen short sentences and the braces around them.
      max_output_tokens: 900,
      store: false,
    }) as never, args.memories, args.talk, args.message);

    await Promise.allSettled([
      args.supabase.from('ai_usage').insert({
        user_id: args.userId, feature: MEMORY_FEATURE, model: args.model, mode: args.mode,
        prompt_tokens: usage.prompt, cached_tokens: usage.cached, completion_tokens: usage.completion,
        tool_calls: 1, client_hash: args.clientHash,
      }),
      args.budgetClient?.rpc('ai_budget_add', { p_micros: costMicros(args.model, usage) }) ?? Promise.resolve(),
    ]);
    if (!changes || (!changes.add.length && !changes.drop.length)) return;

    /* The new before the old goes. If the second write fails the list is a little
     * too long for a while, which the next look-over tidies; the other order could
     * leave it missing something for good. */
    if (changes.add.length) {
      const now = Date.now();
      const { error } = await args.supabase.from('user_memories').insert(changes.add.map((content, at) => ({
        user_id: args.userId, content, created_at: new Date(now + at).toISOString(),
      })));
      if (error) return;
    }
    if (changes.drop.length) {
      await args.supabase.from('user_memories').delete().in('id', changes.drop).eq('user_id', args.userId);
    }
  } catch {
    // Nothing to tell anyone: the person has their answer, and this is tried again.
  }
}
