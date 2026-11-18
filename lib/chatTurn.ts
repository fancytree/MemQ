/**
 * One turn of chat, as state.
 *
 * An answer is not a string. It is prose and finished interfaces in the order they
 * arrived — a line, a card of drafts, maybe another line — so the turn holds a list
 * of parts rather than text, and the view walks it.
 *
 * Written as a reducer with no React in it, because the awkward parts are all about
 * ordering: tokens have to join the part they belong to instead of each becoming
 * one, an interface has to close the prose before it, and a stream that stops
 * without saying it was done has to end up somewhere other than "still thinking".
 * Those are worth testing without a screen.
 */

import type { ChatErrorCode, ChatEvent, ChatStatus } from '@/lib/chatEvents';

export type ChatPart =
  | { kind: 'text'; text: string }
  | {
    kind: 'component'; name: string; props: unknown;
    /** The stored row this interface is kept in (lib/chatThread.ts). Missing for
     *  one that is not kept: the lab, or an answer from a server too old to say. */
    id?: string;
    /** What became of it since it was drawn, as the component itself wrote it down. */
    state?: unknown;
    /** True for one the app put up itself in answer to a tap, with no model call. */
    local?: boolean;
  };

export type ChatTurn = {
  /** What the person said, kept beside the answer so the view can draw the pair. */
  question: string;
  /** The answer so far, in arrival order. */
  parts: ChatPart[];
  /** What to show while nothing is being said. Cleared the moment prose starts. */
  status: ChatStatus | null;
  error: { code: ChatErrorCode; message: string } | null;
  /** True once the turn is closed, by `done` or by an error. */
  done: boolean;
  /** Carried back so the next turn continues the same conversation. */
  threadId: string | null;
  /** What the model thinks this person might say next, given what it just said.
   *  Empty when it offered nothing, which is when the screen falls back to the
   *  moves that are always available. */
  suggestions: string[];
};

export function startTurn(question: string, threadId: string | null = null): ChatTurn {
  return { question, parts: [], status: null, error: null, done: false, threadId, suggestions: [] };
}

export function applyEvent(turn: ChatTurn, event: ChatEvent): ChatTurn {
  // A closed turn takes nothing more. A late event after an error would otherwise
  // reopen a turn the person has already been told failed.
  if (turn.done) return turn;

  switch (event.type) {
    case 'status':
      return { ...turn, status: event.status };

    case 'text': {
      if (!event.delta) return turn;
      const last = turn.parts[turn.parts.length - 1];
      // Tokens join the prose they belong to. One part per token would make the
      // view redraw a thousand bubbles for one paragraph.
      const parts: ChatPart[] = last?.kind === 'text'
        ? [...turn.parts.slice(0, -1), { kind: 'text', text: last.text + event.delta }]
        : [...turn.parts, { kind: 'text', text: event.delta }];
      // Prose has started, so there is nothing to say about waiting any more.
      return { ...turn, parts, status: null };
    }

    case 'component':
      // An interface closes whatever prose came before it: a later line starts its
      // own part rather than appending to the text above the card.
      return {
        ...turn, status: null,
        parts: [...turn.parts, {
          kind: 'component', name: event.name, props: event.props,
          ...(event.id ? { id: event.id } : {}),
        }],
      };

    case 'suggest':
      // Kept off `parts`: these are not something the answer contains, they are
      // what to offer once it is over, and they are drawn somewhere else.
      return { ...turn, suggestions: event.suggestions };

    case 'done':
      return { ...turn, done: true, status: null, threadId: event.thread_id ?? turn.threadId };

    case 'error':
      return { ...turn, done: true, status: null, error: { code: event.code, message: event.message } };
  }
}

export function applyEvents(turn: ChatTurn, events: ChatEvent[]): ChatTurn {
  return events.reduce(applyEvent, turn);
}

/**
 * A stream that stopped without saying it was done.
 *
 * Dropped connections happen, and the turn must not be left showing a thinking
 * face for ever. Prose that already arrived is kept — a cut-off answer is still
 * worth reading — and the turn is closed with something the person can act on.
 */
export function endWithoutDone(turn: ChatTurn): ChatTurn {
  if (turn.done) return turn;
  return {
    ...turn,
    done: true,
    status: null,
    error: { code: 'disconnected', message: 'The answer stopped early. Check your connection and ask again.' },
  };
}

/** Whether anything has been produced yet, for deciding what the view shows while
 *  waiting: a status line on its own, or an answer in progress. */
export function isEmpty(turn: ChatTurn): boolean {
  return turn.parts.length === 0;
}

/** The prose of the answer, for the one place that needs it as text: what gets
 *  saved as the assistant's message. Components are not prose and are left out. */
export function proseOf(turn: ChatTurn): string {
  return turn.parts.filter((part): part is { kind: 'text'; text: string } => part.kind === 'text')
    .map((part) => part.text).join('');
}
