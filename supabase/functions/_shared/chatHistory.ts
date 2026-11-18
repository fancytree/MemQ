/**
 * What the model is told about the conversation so far, and what is kept of it.
 *
 * Three things were wrong with the record, and each one made the next turn worse
 * in a way that looked like the model being forgetful.
 *
 * It lost every interface. Only prose was saved, so after a set of drafts the
 * history read "Here are some cards on Norse gods." and nothing else. "Five more",
 * "harder ones", "not those" were then questions about something the model had
 * never seen. An interface is now remembered as a note — what was shown, in a
 * sentence — in a `system` row of its own. Not folded into the assistant's words:
 * a model that reads its own past messages ending in "(drafted 8 cards…)" learns
 * that drafting is something you type.
 *
 * It kept what the person threw away. "Ask again" took the answer off the screen
 * and left it in the thread, so the model read the question twice and the answer
 * that had been rejected. A retry now removes that exchange and whatever followed.
 *
 * And it had no limit on one message. Twenty rows is the window, but a single
 * pasted page rode along in full for all twenty turns after it.
 *
 * A conversation now stays until the person clears it, so the record has a second
 * reader: the screen, which draws it again on the way back in. For that a note is
 * not enough — "3 draft cards were shown" cannot be ticked — so the row that holds
 * a note also holds the interface it stands for, as `payload`. The model is never
 * given it: `historyInput` reads `content` and nothing else.
 */

export type HistoryRow = { id: string; role: string; content: string };

/** How many rows are read back. Ten exchanges: enough to hold a thread together. */
export const HISTORY_LIMIT = 20;

/** What one past message may cost on every later turn. The start of a long paste
 *  is enough to know what was being talked about; the answer to it carries the
 *  rest. */
export const ROW_MAX = 1200;

const NOTE = 'App note, not said by anyone: ';

/**
 * Drop the exchange being asked again, and everything after it.
 *
 * Found by what was asked, newest first, rather than by counting turns: the app's
 * count of turns includes ones the server never recorded (a request that did not
 * arrive, a turn that only happened on screen), and a count that is off by one
 * deletes an exchange the person still has in front of them. A match on the text
 * can only ever remove from the question itself onwards. No match removes nothing.
 *
 * `rows` is newest first, as read.
 */
export function rewind(rows: HistoryRow[], question: string): { kept: HistoryRow[]; dropped: string[] } {
  const at = rows.findIndex((row) => row.role === 'user' && row.content === question);
  if (at < 0) return { kept: rows, dropped: [] };
  return { kept: rows.slice(at + 1), dropped: rows.slice(0, at + 1).map((row) => row.id) };
}

/** The rows, oldest first, as model input. `rows` is newest first, as read. */
export function historyInput(rows: HistoryRow[]): Array<Record<string, unknown>> {
  return [...rows].reverse().map((row) => {
    const content = row.content.length > ROW_MAX ? `${row.content.slice(0, ROW_MAX)}…` : row.content;
    if (row.role === 'assistant') return { role: 'assistant', content };
    // What the app put on screen, said by the app. Above the person's messages in
    // authority and clearly not one of them.
    if (row.role === 'system') return { role: 'developer', content };
    return { role: 'user', content };
  });
}

export type Drawn = { id: string; component: string; props: unknown };
export type TurnRow = { role: string; content: string; id?: string; payload?: { component: string; props: unknown } };

/** What one finished turn adds to the record: the question, the prose if there
 *  was any, and a note for each interface that was shown — with the interface
 *  itself beside the note, under the id the app already knows it by. */
export function turnRows(question: string, answer: string, notes: string[], shown: Drawn[] = []): TurnRow[] {
  const rows: TurnRow[] = [{ role: 'user', content: question }];
  if (answer.trim()) rows.push({ role: 'assistant', content: answer.trim() });
  notes.forEach((note, at) => {
    const drawn = shown[at];
    rows.push({
      role: 'system', content: `${NOTE}${note}`,
      ...(drawn ? { id: drawn.id, payload: { component: drawn.component, props: drawn.props } } : {}),
    });
  });
  return rows;
}
