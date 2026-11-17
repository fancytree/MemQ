/**
 * What arrives while an answer is being produced, and how to read it off a stream.
 *
 * The shapes here mirror `supabase/functions/_shared/chatStream.ts`. They are
 * written twice on purpose: the app and the edge functions are different TypeScript
 * worlds — `tsconfig.json` excludes `supabase/functions`, and Deno cannot resolve
 * the `@/` alias — so neither can import the other. Keep the two in step by hand,
 * and keep the names identical so a drift is obvious in a diff.
 */

export type ChatStatus = 'thinking' | 'reading' | 'drafting';

export type ChatErrorCode =
  | 'unauthorized'
  | 'bad_request'
  | 'quota'
  | 'daily_budget'
  | 'upstream'
  | 'internal'
  /** Added on this side: the stream ended without saying it was done. */
  | 'disconnected';

export type ChatEvent =
  | { type: 'status'; status: ChatStatus }
  | { type: 'text'; delta: string }
  | { type: 'component'; name: string; props: unknown }
  | { type: 'done'; thread_id: string | null }
  | { type: 'error'; code: ChatErrorCode; message: string };

const STATUSES: ChatStatus[] = ['thinking', 'reading', 'drafting'];

/** Only what this version knows how to draw. An event from a newer server, or a
 *  line that is not an event at all, is dropped rather than rendered as nonsense. */
function readEvent(raw: unknown): ChatEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  switch (value.type) {
    case 'status':
      return STATUSES.includes(value.status as ChatStatus)
        ? { type: 'status', status: value.status as ChatStatus } : null;
    case 'text':
      return typeof value.delta === 'string' ? { type: 'text', delta: value.delta } : null;
    case 'component':
      return typeof value.name === 'string' ? { type: 'component', name: value.name, props: value.props } : null;
    case 'done':
      return { type: 'done', thread_id: typeof value.thread_id === 'string' ? value.thread_id : null };
    case 'error':
      return {
        type: 'error',
        code: typeof value.code === 'string' ? value.code as ChatErrorCode : 'internal',
        message: typeof value.message === 'string' && value.message.trim() ? value.message : 'Something went wrong.',
      };
    default:
      return null;
  }
}

/**
 * A parser that can be fed the stream in whatever pieces it arrives in.
 *
 * Chunks do not land on event boundaries: one event can be split across two reads,
 * and two events can share one read. So the tail is held until its blank line
 * shows up. A JSON string cannot contain a literal blank line — `JSON.stringify`
 * escapes newlines — which is what makes the blank line safe to split on.
 */
export function createEventParser(): (chunk: string) => ChatEvent[] {
  let buffer = '';
  return (chunk: string): ChatEvent[] => {
    // The whole buffer is normalised, not each chunk: a CRLF split across two
    // reads would otherwise become two bare newlines and forge a boundary. Done
    // this way a lone trailing `\r` simply waits for the `\n` that belongs to it.
    buffer = (buffer + chunk).replace(/\r\n/g, '\n');
    const events: ChatEvent[] = [];
    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      for (const line of block.split('\n')) {
        // `data:` with or without the conventional space; anything else (a comment
        // keeping the connection warm, a retry hint) is not an event.
        const trimmed = line.replace(/\r$/, '');
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload) continue;
        try {
          const event = readEvent(JSON.parse(payload));
          if (event) events.push(event);
        } catch {
          // A line that is not JSON is not an event. Dropping it keeps a malformed
          // tail from taking down a turn that was otherwise fine.
        }
      }
      split = buffer.indexOf('\n\n');
    }
    return events;
  };
}
