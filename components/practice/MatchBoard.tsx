/**
 * Matching: words down the left, their meanings down the right, a few rows at a time.
 *
 * Tap one, then tap its match — either side first. A right pair leaves and another
 * arrives in its place at once, the same card coming round more than once, until every pair
 * has been made; then the round moves on by itself. There is no button to press and
 * nothing to drag: on a card this size two taps are faster and never miss.
 *
 * The board takes whatever height it is given and shows as many rows as fit without
 * any being cut off — four to six. Rows are a fixed height, so a tile that changes
 * its word does not move the tiles around it. Tiles are short by construction: a card
 * whose term or meaning is too long for one is never put on the board (LIMITS in
 * lib/practiceRound).
 *
 * How pairs arrive, wait and come round again is lib/matchBoard. A pair made without
 * a wrong guess counts as known; a wrong guess counts against both cards it touched.
 */

import { clearPair, isDone, isPair, missPair, rowsFor, startBoard, type Board, type Tile } from '@/lib/matchBoard';
import type { MatchQuestion } from '@/lib/practiceRound';
import { colors, fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

export type MatchResult = { termId: string; correct: boolean };

type Side = 'left' | 'right';

/** Three lines of a meaning and its padding: the least a row can be and still show one whole. */
const ROW_MIN = 74;
const ROW_MAX = 92;
const GAP = 8;
const COLUMN_GAP = 10;
const TILE_INLINE = 11;
/** A meaning is longer than its word, so its column gets the larger share. */
const WORDS_SHARE = 5;
const MEANINGS_SHARE = 6;
const TERM_SIZE = 16;
const TERM_SIZE_MIN = 11;
/** The width of a semibold letter as a share of the font size, taken on the wide side:
 *  a word full of m's and w's must fit too. */
const LETTER_WIDTH = 0.68;
const WIDE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
/** How long a made pair stays, green, before it leaves. */
const LEAVE_MS = 300;
/** How long a wrong pair stays marked before it lets go. */
const WRONG_MS = 550;

export function MatchBoard({ question, onDone }: {
  question: MatchQuestion;
  onDone: (results: MatchResult[]) => void;
}) {
  const [height, setHeight] = useState(0);
  const [width, setWidth] = useState(0);
  const [board, setBoard] = useState<Board | null>(null);
  const [picked, setPicked] = useState<{ side: Side; id: number } | null>(null);
  /** Tiles of pairs just made, on their way out. */
  const [leaving, setLeaving] = useState<number[]>([]);
  const [wrong, setWrong] = useState<{ left: number; right: number } | null>(null);
  const missed = useRef(new Set<number>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const finished = useRef(false);
  const later = (run: () => void, ms: number) => {
    const timer = setTimeout(() => { timers.current.delete(timer); run(); }, ms);
    timers.current.add(timer);
  };
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach(clearTimeout); pending.clear(); };
  }, []);

  // The board is laid out once, when the room it has is known.
  useEffect(() => {
    if (board || height <= 0) return;
    setBoard(startBoard(question.sequence, rowsFor(height, question.pairs.length, ROW_MIN, GAP)));
  }, [board, height, question]);

  useEffect(() => {
    if (!board || finished.current || !isDone(board)) return;
    finished.current = true;
    onDone(question.pairs
      .map((pair, index) => ({ termId: pair.termId, correct: !missed.current.has(index), scored: pair.scored }))
      .filter((result) => result.scored)
      .map(({ termId, correct }) => ({ termId, correct })));
  }, [board, onDone, question]);

  const rows = board?.left.length ?? 0;
  const rowHeight = rows > 0
    ? Math.max(ROW_MIN, Math.min(ROW_MAX, Math.floor((height - GAP * (rows - 1)) / rows)))
    : ROW_MIN;

  // A long word must not be broken across lines: "accommodat / e" is not a word. The
  // word column is narrow, so a term is set as large as its longest word allows.
  const termWidth = Math.max(0, (width - COLUMN_GAP) * (WORDS_SHARE / (WORDS_SHARE + MEANINGS_SHARE)) - 2 * TILE_INLINE - 3);
  const termSize = (text: string) => {
    const longest = Math.max(1, ...text.split(/\s+/).map((word) => Array.from(word).reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0)));
    return termWidth > 0 ? Math.max(TERM_SIZE_MIN, Math.min(TERM_SIZE, Math.floor(termWidth / (longest * LETTER_WIDTH)))) : TERM_SIZE;
  };

  const press = (side: Side, tile: Tile) => {
    if (!board || wrong || leaving.includes(tile.id)) return;
    if (!picked || picked.side === side) {
      setPicked(picked?.side === side && picked.id === tile.id ? null : { side, id: tile.id });
      return;
    }
    const leftId = side === 'left' ? tile.id : picked.id;
    const rightId = side === 'right' ? tile.id : picked.id;
    setPicked(null);
    if (isPair(board, leftId, rightId)) {
      setLeaving((ids) => [...ids, leftId, rightId]);
      later(() => {
        setBoard((current) => (current ? clearPair(current, leftId, rightId) : current));
        setLeaving((ids) => ids.filter((id) => id !== leftId && id !== rightId));
      }, LEAVE_MS);
      return;
    }
    for (const [column, id] of [[board.left, leftId], [board.right, rightId]] as const) {
      const touched = column.find((item) => item?.id === id);
      if (touched) missed.current.add(touched.pair);
    }
    setBoard(missPair(board, leftId, rightId));
    setWrong({ left: leftId, right: rightId });
    later(() => setWrong(null), WRONG_MS);
  };

  const cell = (side: Side, tile: Tile | null, row: number) => {
    if (!tile) return <View key={`${side}-empty-${row}`} style={[styles.tile, styles.empty, { height: rowHeight }]} />;
    const pair = question.pairs[tile.pair];
    const text = side === 'left' ? pair.left : pair.right;
    const done = leaving.includes(tile.id);
    const chosen = picked?.side === side && picked.id === tile.id;
    const mistaken = !!wrong && wrong[side] === tile.id;
    return (
      <Pressable key={tile.id} accessibilityRole="button"
        accessibilityLabel={`${text}${done ? ', matched' : chosen ? ', selected' : ''}`}
        accessibilityState={{ disabled: done, selected: chosen }}
        disabled={done} onPress={() => press(side, tile)}
        style={[styles.tile, { height: rowHeight }, chosen && styles.chosen, mistaken && styles.mistaken, done && styles.done]}>
        <Text numberOfLines={side === 'left' ? 2 : 3} adjustsFontSizeToFit minimumFontScale={0.8}
          style={[side === 'left' ? [styles.term, { fontSize: termSize(text), lineHeight: Math.round(termSize(text) * 1.375) }] : styles.meaning, done && styles.doneText]}>{text}</Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.prompt}>Tap a word, then its meaning</Text>
        {board && <Text accessibilityLabel={`${board.made} of ${board.total} matched`} style={styles.count}>{board.made}/{board.total}</Text>}
      </View>
      {/* Measured, then filled with as many whole rows as fit. It only scrolls on a
          screen too short for four. */}
      <View style={styles.area} onLayout={(event) => { setHeight(event.nativeEvent.layout.height); setWidth(event.nativeEvent.layout.width); }}>
        {board && <ScrollView contentContainerStyle={styles.board} bounces={false} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          <View style={[styles.column, styles.words]}>{board.left.map((tile, row) => cell('left', tile, row))}</View>
          <View style={[styles.column, styles.meanings]}>{board.right.map((tile, row) => cell('right', tile, row))}</View>
        </ScrollView>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  prompt: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 14, color: homeColors.muted },
  count: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.deep, fontVariant: ['tabular-nums'] },
  area: { flex: 1, minHeight: 0 },
  board: { flexDirection: 'row', gap: COLUMN_GAP },
  column: { gap: GAP },
  words: { flex: WORDS_SHARE },
  meanings: { flex: MEANINGS_SHARE },
  tile: {
    justifyContent: 'center', paddingHorizontal: TILE_INLINE, paddingVertical: 8,
    borderRadius: 16, borderWidth: 1.5, borderColor: homeColors.border, backgroundColor: homeColors.white,
  },
  // A row with nothing to take it — the board is running out, or what is waiting is
  // still showing — keeps its place, so nothing around it moves.
  empty: { borderStyle: 'dashed', backgroundColor: homeColors.nav },
  chosen: { borderColor: homeColors.primary, backgroundColor: homeColors.track },
  mistaken: { borderColor: homeColors.quizWrongOutline, backgroundColor: colors.warnL },
  done: { borderColor: colors.green, backgroundColor: colors.greenL },
  term: { fontFamily: fonts.semibold, fontSize: TERM_SIZE, lineHeight: 22, color: homeColors.darkest },
  meaning: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, color: homeColors.darkest },
  doneText: { color: colors.green },
});
