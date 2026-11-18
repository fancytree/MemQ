/**
 * Asking the chat function something, and reading the answer as it arrives.
 *
 * React Native's own `fetch` is backed by XMLHttpRequest and hands back a body
 * only once it is complete, which would throw away the whole point of streaming.
 * `expo/fetch` is the WinterCG one, with a real `ReadableStream` body, so that is
 * what this uses. `supabase.functions.invoke` cannot stream either, so the endpoint
 * is called directly.
 *
 * The source of chunks is injectable. That is how the shell can be driven by a
 * scripted answer — in the lab, and in a test — without a server, and it keeps the
 * parsing and the transport apart.
 */

import { fetch as streamingFetch } from 'expo/fetch';
import { createEventParser, type ChatEvent } from '@/lib/chatEvents';
import { clearThreads, type ChatLine } from '@/lib/chatThread';
import { functionsUrl, publishableKey, supabase } from '@/lib/supabase';

export type ChatAsk = {
  mode: 'create' | 'practice';
  message: string;
  threadId?: string | null;
  /** Where the files are, riding on this one message. The function fetches and
   *  reads them. Not kept for the next one: a document re-sent every turn would be
   *  paid for every turn, and by then the answer already says what was in it. */
  attachments?: { name: string; url: string }[];
  context?: {
    lesson_id?: string;
    card_id?: string;
    question?: { text?: string; your_answer?: string; correct_answer?: string };
  };
  /** The same question again, in place of the answer it got. The function drops
   *  that exchange from its record before answering. */
  retry?: boolean;
  /** A button with one meaning was pressed, so the turn need not guess it. */
  intent?: 'draft';
};

/**
 * Something gone wrong that is already written for the person.
 *
 * The screen shows the message of one of these and never of any other error. A
 * transport failure throws its own sentence — "fetch failed: UnexpectedException:
 * The network connection was lost. (at ExpoModulesCore/Promise.swift:56)" — and
 * putting that in a chat bubble tells someone who came to learn Italian that the
 * app is broken in a way they cannot act on. Same reasoning as the gateway status
 * below: the detail goes to the console, the sentence goes on the screen.
 */
export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChatError';
  }
}

/** Raw text chunks, in whatever pieces they arrive in. */
export type ChatSource = (ask: ChatAsk, signal: AbortSignal) => Promise<AsyncIterable<string>>;

/** The real one: the chat function over a streaming connection. */
export const liveSource: ChatSource = async (ask, signal) => {
  // Reads the stored session rather than asking the network, so this does not put a
  // round trip in front of the first token — the old assistant had three of them.
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new ChatError('Sign in to use chat.');

  const response = await streamingFetch(`${functionsUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: publishableKey,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      mode: ask.mode,
      message: ask.message,
      thread_id: ask.threadId ?? null,
      ...(ask.context ? { context: ask.context } : {}),
      ...(ask.attachments?.length
        ? { attachments: ask.attachments.map(({ name, url }) => ({ name, url })) }
        : {}),
      ...(ask.retry ? { retry: true } : {}),
      ...(ask.intent ? { intent: ask.intent } : {}),
    }),
    signal,
  });

  /* The function answers refusals as a one-event stream, so a non-2xx here is a
   * gateway problem rather than something the person did — which is why the
   * message says nothing about what they should fix.
   *
   * The status goes to the console and not to the screen. A number like 404 means
   * something to whoever deployed this and nothing at all to someone who came to
   * learn a language; on the page it reads as the app being broken rather than as
   * a sentence. */
  if (!response.ok || !response.body) {
    console.warn('chat gateway', response.status);
    throw new ChatError('Chat could not be reached. Try again in a moment.');
  }
  return readChunks(response.body);
};

async function* readChunks(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      // `stream: true` so a multi-byte character split across two reads is not
      // turned into a replacement character.
      if (value) yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/** The answer as events. Throws only if the connection could not be made; anything
 *  the server wants to refuse arrives as an `error` event instead. */
export async function* chatEvents(
  ask: ChatAsk,
  options: { source?: ChatSource; signal: AbortSignal },
): AsyncGenerator<ChatEvent> {
  const source = options.source ?? liveSource;
  const parse = createEventParser();
  for await (const chunk of await source(ask, options.signal)) {
    if (options.signal.aborted) return;
    for (const event of parse(chunk)) yield event;
  }
}

/**
 * A source that replays a scripted answer, for the lab and for tests.
 *
 * Chunks are deliberately cut at awkward places by the caller: an answer that only
 * ever arrives on event boundaries would not exercise the parser's buffer.
 */
export function scriptedSource(chunks: string[], gapMs = 40): ChatSource {
  return async (_ask, signal) => (async function* () {
    for (const chunk of chunks) {
      if (signal.aborted) return;
      if (gapMs > 0) await new Promise((resolve) => setTimeout(resolve, gapMs));
      yield chunk;
    }
  })();
}

/**
 * Throw away the conversation on one line.
 *
 * It is kept until this is called, so this has to really remove it: a screen
 * that only emptied itself would open on the same conversation next time. False
 * when it could not be removed, so the screen can say so instead of pretending.
 */
export async function clearConversation(line: ChatLine): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  // Nobody signed in has nothing kept; there is nothing to fail at.
  if (!session?.user.id) return true;
  return clearThreads(supabase, session.user.id, line);
}
