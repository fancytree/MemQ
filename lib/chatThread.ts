/**
 * A conversation that is still there when you come back.
 *
 * Each chat line has one conversation, and it stays until the person clears it.
 * The server keeps it as rows — what was asked, what was said, and a note for each
 * interface that was shown — so that the model can be told what came before
 * (supabase/functions/_shared/chatHistory.ts). This is the other reader of those
 * rows: the screen, which has to draw the conversation again on the way back in.
 *
 * Two things make that more than reading text back.
 *
 * An interface has to come back as itself. A set of drafts reopened as the
 * sentence "3 draft cards were shown" cannot be ticked, so the row that holds the
 * note also holds what it stood for (`payload`), and that is drawn again.
 *
 * And some of what is on screen never went near the server. "Keep 3 cards" is the
 * app answering a tap with its own next question (ChatShell's `useSay`); what a
 * card went on to do — these drafts were handed over, those cards were saved to
 * that lesson — is state inside a component. Both are written here, by the app,
 * into the same thread. A reopened conversation that offered to keep cards a
 * second time would save them a second time.
 *
 * Written from the app with the person's own session, like saving the cards
 * themselves (lib/chatDrafts.ts): row-level security decides whether it is allowed.
 *
 * Nothing in this file imports the Supabase client, so the part that matters —
 * rows in, turns out — runs in a test with no app around it.
 */

import type { ChatPart, ChatTurn } from '@/lib/chatTurn';

/** How the server opens a note about something the app did. Written the same way
 *  from here, so the model reads one kind of note whoever filed it. */
const NOTE = 'App note, not said by anyone: ';

/** How far back a reopened conversation is drawn. The whole of it stays stored;
 *  this is what is put on screen, and a few dozen exchanges is already more than
 *  anyone scrolls back through in a chat. */
export const RESTORE_ROWS = 80;

export type ChatLine = 'create' | 'practice';

export type StoredRow = { id: string; role: string; content: string; payload?: unknown };

/** What a row that stands for an interface carries. */
export type Kept = {
  component: string;
  props: unknown;
  /** Set on a turn the app added itself: what the tap said. */
  said?: string;
  /** What became of the interface since it was drawn. The component's own business. */
  state?: unknown;
};

function readKept(raw: unknown): Kept | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.component !== 'string' || !value.component) return null;
  return {
    component: value.component,
    props: value.props,
    ...(typeof value.said === 'string' && value.said.trim() ? { said: value.said.trim() } : {}),
    ...(value.state !== undefined && value.state !== null ? { state: value.state } : {}),
  };
}

const closed = (question: string, threadId: string | null): ChatTurn =>
  ({ question, parts: [], status: null, error: null, done: true, threadId, suggestions: [] });

/**
 * The stored rows, oldest first, as the turns the screen draws.
 *
 * A question opens a turn; what was said and what was shown fill it. A row the
 * app filed for a tap opens a turn of its own, with the tap as what was asked.
 *
 * Anything that would draw as nothing is left out: rows from before interfaces
 * were kept are a note with nothing to show, and a question standing over an
 * empty space reads as an answer that went missing. So does the start of an
 * exchange cut in half by the limit on how far back this reads.
 */
export function rowsToTurns(rows: StoredRow[], threadId: string | null): ChatTurn[] {
  const turns: ChatTurn[] = [];
  let current: ChatTurn | null = null;
  const open = (question: string) => { current = closed(question, threadId); turns.push(current); return current; };

  for (const row of rows) {
    if (row.role === 'user') { open(row.content); continue; }
    if (row.role === 'assistant') {
      if (current && row.content.trim()) (current as ChatTurn).parts.push({ kind: 'text', text: row.content });
      continue;
    }
    if (row.role !== 'system') continue;
    const kept = readKept(row.payload);
    if (!kept) continue;
    const part: ChatPart = {
      kind: 'component', id: row.id, name: kept.component, props: kept.props,
      ...(kept.state !== undefined ? { state: kept.state } : {}),
      ...(kept.said ? { local: true } : {}),
    };
    if (kept.said) open(kept.said).parts.push(part);
    else if (current) (current as ChatTurn).parts.push(part);
  }
  return turns.filter((turn) => turn.parts.length > 0);
}

/** An id for a row the app files itself. It names a row, it guards nothing, so
 *  it does not need better randomness than this — and the native module that
 *  would give it is not in every build. */
export function rowId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (slot) => {
    const digit = Math.floor(Math.random() * 16);
    return (slot === 'x' ? digit : (digit & 0x3) | 0x8).toString(16);
  });
}

/** The row for a turn the app added, or for what became of an interface. */
export function keptRow(kept: Kept, note?: string): { content?: string; payload: Kept } {
  return { ...(note ? { content: `${NOTE}${note}` } : {}), payload: kept };
}

/* The slice of the Supabase client used below. It is a builder whose every step
 * returns another builder, which no narrow type describes without restating the
 * library; the calls are few and each is read back defensively. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ThreadStore = { from: (table: string) => any };

/**
 * The conversation on this line, if there is one.
 *
 * The most recent thread, because there is only meant to be one: clearing removes
 * them all, so the newest is the one the person was last in. Null when there is
 * nothing to show, and when it could not be read — an empty screen is the right
 * thing to open on either way, and the next message starts a thread of its own.
 */
export async function loadThread(
  store: ThreadStore, userId: string, line: ChatLine,
): Promise<{ threadId: string; turns: ChatTurn[] } | null> {
  try {
    const thread = await store.from('chat_threads').select('thread_id')
      .eq('user_id', userId).eq('mode', line)
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    const threadId = typeof thread?.data?.thread_id === 'string' ? thread.data.thread_id : null;
    if (thread?.error || !threadId) return null;

    // Newest first so the limit keeps the end of the conversation, then turned
    // round to be read in the order it was said.
    const messages = await store.from('chat_messages').select('id, role, content, payload')
      .eq('thread_id', threadId).eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(RESTORE_ROWS);
    if (messages?.error || !Array.isArray(messages?.data)) return null;

    const rows: StoredRow[] = [];
    for (const raw of [...messages.data].reverse() as Array<Record<string, unknown>>) {
      if (typeof raw.id !== 'string' || typeof raw.role !== 'string' || typeof raw.content !== 'string') continue;
      rows.push({ id: raw.id, role: raw.role, content: raw.content, payload: raw.payload });
    }
    // The thread is carried on even when nothing in it can be drawn: the model
    // still has it, and the next message should be a reply to it.
    return { threadId, turns: rowsToTurns(rows, threadId) };
  } catch {
    return null;
  }
}

/** Throw the conversation on this line away. All of its threads: with one
 *  conversation to a line, an older thread left behind would be the next thing
 *  to open. Their messages go with them. False if it could not be done. */
export async function clearThreads(store: ThreadStore, userId: string, line: ChatLine): Promise<boolean> {
  try {
    const result = await store.from('chat_threads').delete().eq('user_id', userId).eq('mode', line);
    return !result?.error;
  } catch {
    return false;
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The server files a turn after it has finished answering, so for a moment the
 *  screen can be ahead of the table: the thread, or the row for an interface, is
 *  on its way and not there yet. One more try a little later covers that. */
const SECOND_TRY = 2500;

/** File a turn the app added. Never throws: it is the record being kept, and the
 *  screen has already moved on. */
export async function fileTurn(
  store: ThreadStore,
  row: { id: string; threadId: string; userId: string; kept: Kept; note: string },
): Promise<boolean> {
  const write = async () => {
    try {
      const result = await store.from('chat_messages').insert({
        id: row.id, thread_id: row.threadId, user_id: row.userId, role: 'system',
        ...keptRow(row.kept, row.note),
      });
      return !result?.error;
    } catch { return false; }
  };
  if (await write()) return true;
  await pause(SECOND_TRY);
  return write();
}

/** Write down what became of an interface. `note` replaces what the model is told
 *  about it; without one, what the model is told stays as it was. */
export async function refile(
  store: ThreadStore,
  row: { id: string; userId: string; kept: Kept; note?: string },
): Promise<boolean> {
  const write = async () => {
    try {
      const result = await store.from('chat_messages').update(keptRow(row.kept, row.note))
        .eq('id', row.id).eq('user_id', row.userId).select('id');
      return !result?.error && Array.isArray(result?.data) && result.data.length > 0;
    } catch { return false; }
  };
  if (await write()) return true;
  await pause(SECOND_TRY);
  return write();
}
