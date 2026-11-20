/**
 * The state of a matching board, and the moves that change it.
 *
 * The board shows a few rows: words down the left, their meanings down the right, in
 * an unrelated order. A pair that is made leaves; pairs still to come arrive in the
 * rows left empty. It ends when nothing is left to arrive and nothing is on the board.
 *
 * Three rules shape it:
 *
 * 1. A pair that is made is replaced at once: the next pair waiting takes the two
 *    rows it left, so the board stays full for as long as there is anything to come.
 * 2. A card is never on the board twice at once. Its second coming waits until the
 *    first has been matched and gone, and a row whose only candidates are already
 *    showing stays empty until one of them is.
 * 3. A wrong match sends both cards it touched round once more, at the back of the
 *    queue. Once: a board that grew with every slip would never end.
 * 4. A pair just made does not come straight back. Its second coming would land in
 *    the very rows it left, the same word and meaning in the same places, asking for
 *    the same two taps again. Another waiting pair takes those rows instead; if it is
 *    the only one left, its rows stay empty while anything else is on the board, and
 *    on an otherwise empty board it arrives somewhere other than where it was. The
 *    same holds later: a card coming round again is not put back in the two rows it
 *    was made from when any other place, or any other waiting pair, will do.
 *
 * Plain functions over plain data, so the moves can be tested without a screen.
 */

export type Tile = {
  /** Index into the question's pairs. */
  pair: number;
  /** Unique to this appearance of the card, so its second coming is a different tile. */
  id: number;
};

export type Board = {
  left: (Tile | null)[];
  right: (Tile | null)[];
  /** Pairs still to arrive, soonest first. */
  queue: number[];
  made: number;
  /** Pairs to make altogether; grows when a miss sends a card round again. */
  total: number;
  nextId: number;
  /** How many times each pair has been sent round again for a miss. */
  again: Record<number, number>;
  /** The pair made last (rule 4). */
  recent?: number;
  /** Where each pair sat when it was last made, so a second coming lands elsewhere. */
  lastAt?: Record<number, { left: number; right: number }>;
};

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const emptyRows = (column: (Tile | null)[]) =>
  column.map((tile, row) => (tile ? -1 : row)).filter((row) => row >= 0);

/** Bring waiting pairs into the empty rows. */
export function fill(board: Board, random: () => number = Math.random): Board {
  const freeLeft = emptyRows(board.left);
  const freeRight = emptyRows(board.right);
  if (freeLeft.length === 0) return board;

  const onBoard = new Set(board.left.filter((tile): tile is Tile => !!tile).map((tile) => tile.pair));
  const recent = board.recent;
  const queue = [...board.queue];
  const arriving: number[] = [];
  while (arriving.length < freeLeft.length) {
    /* Who gets the row, in the order they are asked for:
     *
     *  1. anything waiting that is not already on the board and is not the pair
     *     just made — the ordinary case, and the only one most boards ever need;
     *  2. the pair just made, coming round again;
     *  3. a pair that is already showing, which puts the same word on the board
     *     twice.
     *
     * The last two look odd, and they are still better than the row they fill: a
     * board with a hole in it reads as a game that is over, or broken, while the
     * cards beside the hole are still waiting to be matched. A repeat is plainly
     * a repeat, and it goes as soon as it is matched. */
    let next = queue.findIndex((pair) => !onBoard.has(pair) && pair !== recent);
    if (next < 0) next = queue.findIndex((pair) => !onBoard.has(pair));
    if (next < 0) next = queue.findIndex((pair) => pair !== recent);
    if (next < 0 && queue.length > 0) next = 0;
    if (next < 0) break;
    onBoard.add(queue[next]);
    arriving.push(queue[next]);
    queue.splice(next, 1);
  }
  if (arriving.length === 0) return board;

  const left = [...board.left];
  const right = [...board.right];
  // Each side is shuffled on its own, so where a word sits says nothing about where
  // its meaning is.
  const leftRows = shuffled(freeLeft, random);
  const rightRows = shuffled(freeRight, random);
  // A card coming round again goes somewhere other than where it was last made.
  const lastAt = board.lastAt ?? {};
  const away = (rows: number[], side: 'left' | 'right') => {
    arriving.forEach((pair, index) => {
      const was = lastAt[pair]?.[side];
      if (was === undefined || rows[index] !== was) return;
      // Trade rows with another arrival, as long as that does not put the other back where it was.
      const swap = rows.findIndex((row, other) => other !== index && row !== was && lastAt[arriving[other]]?.[side] !== was);
      const fallback = swap >= 0 ? swap : rows.findIndex((row) => row !== was);
      if (fallback >= 0) [rows[index], rows[fallback]] = [rows[fallback], rows[index]];
    });
  };
  away(leftRows, 'left');
  // The meanings are then placed so that no card is back in both of its old rows:
  // the order that does least of that, searched over the few arrivals there are.
  const cost = (rows: number[]) => arriving.reduce((sum, pair, index) => {
    const was = lastAt[pair];
    if (!was || rows[index] !== was.right) return sum;
    return sum + (leftRows[index] === was.left ? 10 : 1);
  }, 0);
  let best = rightRows.slice(0, arriving.length);
  let bestCost = cost(best);
  const search = (chosen: number[], left: number[]) => {
    if (bestCost === 0) return;
    if (chosen.length === arriving.length) {
      const c = cost(chosen);
      if (c < bestCost) { best = chosen; bestCost = c; }
      return;
    }
    left.forEach((row, i) => search([...chosen, row], left.filter((_, j) => j !== i)));
  };
  if (bestCost > 0 && arriving.length <= 6) search([], rightRows);
  rightRows.splice(0, arriving.length, ...best);
  let nextId = board.nextId;
  arriving.forEach((pair, index) => {
    left[leftRows[index]] = { pair, id: nextId++ };
    right[rightRows[index]] = { pair, id: nextId++ };
  });
  return { ...board, left, right, queue, nextId };
}

/** A board of `rows` rows at the start of a sequence of pairs. */
export function startBoard(sequence: number[], rows: number, random: () => number = Math.random): Board {
  const empty = Array.from({ length: Math.max(1, rows) }, () => null);
  return fill({ left: empty, right: [...empty], queue: [...sequence], made: 0, total: sequence.length, nextId: 1, again: {} }, random);
}

/** Whether these two tiles are a pair. */
export function isPair(board: Board, leftId: number, rightId: number): boolean {
  const left = board.left.find((tile) => tile?.id === leftId);
  const right = board.right.find((tile) => tile?.id === rightId);
  return !!left && !!right && left.pair === right.pair;
}

/** A pair has been made: its tiles leave, and the next pair waiting takes their rows. */
export function clearPair(board: Board, leftId: number, rightId: number, random: () => number = Math.random): Board {
  if (!isPair(board, leftId, rightId)) return board;
  const leftRow = board.left.findIndex((tile) => tile?.id === leftId);
  const rightRow = board.right.findIndex((tile) => tile?.id === rightId);
  const cleared: Board = {
    ...board,
    left: board.left.map((tile) => (tile?.id === leftId ? null : tile)),
    right: board.right.map((tile) => (tile?.id === rightId ? null : tile)),
    made: board.made + 1,
    recent: board.left[leftRow]!.pair,
    lastAt: { ...board.lastAt, [board.left[leftRow]!.pair]: { left: leftRow, right: rightRow } },
  };
  return fill(cleared, random);
}

/** A wrong match: each card it touched comes round once more. */
export function missPair(board: Board, leftId: number, rightId: number): Board {
  const touched = [
    board.left.find((tile) => tile?.id === leftId)?.pair,
    board.right.find((tile) => tile?.id === rightId)?.pair,
  ].filter((pair): pair is number => typeof pair === 'number');
  const queue = [...board.queue];
  const again = { ...board.again };
  let total = board.total;
  for (const pair of new Set(touched)) {
    if ((again[pair] ?? 0) >= 1) continue;
    again[pair] = 1;
    queue.push(pair);
    total += 1;
  }
  return { ...board, queue, again, total };
}

export const isDone = (board: Board): boolean =>
  board.queue.length === 0 && board.left.every((tile) => !tile);

/** How many rows fit a height without any being cut off: four to six, never more than there are cards. */
export function rowsFor(height: number, cards: number, rowMin: number, gap: number): number {
  const fitting = Math.floor((height + gap) / (rowMin + gap));
  return Math.max(1, Math.min(cards, Math.max(4, Math.min(6, fitting))));
}
