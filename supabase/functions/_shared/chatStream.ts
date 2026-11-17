/**
 * What the app receives while an answer is being produced.
 *
 * One answer is not one blob of text. Prose arrives a token at a time, a finished
 * interface arrives whole, and in between the model is reading the person's lessons
 * and the app wants to say so. Three kinds of event rather than one, because prose
 * can be streamed and a component cannot: half a component is not a component, so
 * it is held until its props have been validated and then sent in one piece.
 *
 * Pure on purpose — the encoding is tested directly, without a model or a socket.
 */

export type ChatStatus = 'thinking' | 'reading' | 'drafting';

export type ChatEvent =
  /** Something to show while nothing is being said yet; drives the mascot. */
  | { type: 'status'; status: ChatStatus }
  /** The next piece of prose. */
  | { type: 'text'; delta: string }
  /** A finished interface, props already validated. */
  | { type: 'component'; name: string; props: unknown }
  /** The turn is over. `thread_id` lets a new conversation keep going. */
  | { type: 'done'; thread_id: string | null }
  /** The turn ended badly. Always the last event; the stream then closes. */
  | { type: 'error'; code: ChatErrorCode; message: string };

export type ChatErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'quota'          // this caller has used their allowance
  | 'daily_budget'   // the whole platform has hit the day's ceiling
  | 'upstream'       // the model provider failed
  | 'internal';

/** Server-sent events: one `data:` line per event, blank line to dispatch. The kind
 *  travels inside the JSON rather than as an SSE `event:` name, so a client reads
 *  every event through one handler. */
export function encodeEvent(event: ChatEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store',
  Connection: 'keep-alive',
  // Without this a proxy may hold the stream and buffer away the whole point of it.
  'X-Accel-Buffering': 'no',
} as const;

/** Read a stream of these events back out. Used by the tests, and by any client that
 *  would rather not write a parser; tolerant of keep-alive comments and of an event
 *  split across chunks is the caller's job — this takes a complete body. */
export function decodeEvents(body: string): ChatEvent[] {
  const events: ChatEvent[] = [];
  for (const block of body.split('\n\n')) {
    const line = block.split('\n').find((part) => part.startsWith('data: '));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(6)) as ChatEvent);
    } catch { /* A truncated tail is not an event; skip rather than throw. */ }
  }
  return events;
}

/** An error the caller should see, as a complete one-event stream. Used when the
 *  request is refused before the model is ever reached, so the client has one shape
 *  to handle whether a turn failed early or late. */
export function errorStream(code: ChatErrorCode, message: string): Response {
  return new Response(encodeEvent({ type: 'error', code, message }), { status: 200, headers: SSE_HEADERS });
}
