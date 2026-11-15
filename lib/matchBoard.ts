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
  const queue = [...board.queue];
  const arriving: number[] = [];
  while (arriving.length < freeLeft.length) {
    const next = queue.findIndex((pair) => !onBoard.has(pair));
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
  return fill({
    ...board,
    left: board.left.map((tile) => (tile?.id === leftId ? null : tile)),
    right: board.right.map((tile) => (tile?.id === rightId ? null : tile)),
    made: board.made + 1,
  }, random);
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
