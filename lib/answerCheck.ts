/**
 * Marking a typed answer.
 *
 * Two different things get typed, and they are marked differently.
 *
 * Spelling — the word itself, in the language being learned: dictation, spelling a
 * word from its meaning. What matters is the letters.
 *   strict   every letter, accents included. Capitals and punctuation are let go.
 *   relaxed  a slip is allowed in proportion to the word (see `allowedSlips`), and so
 *            is a missing accent. It passes as "almost", never as "correct": the
 *            answer is shown back with the slip marked, because a mistake nobody
 *            points out is a mistake practised.
 *
 * Meaning — what something means, in the person's own words.
 *   strict   the card's answer (or one of the alternatives it lists), give or take
 *            capitals, punctuation and a leading "a" / "the" / "to".
 *   relaxed  the right idea. Typos, word order and extra words do not matter. This
 *            file can only compare words, so when the words do not settle it the
 *            verdict says so (`confident: false`) and the caller may ask a judge
 *            that reads for meaning.
 *
 * Nothing here imports anything: it runs in the app and under `node --test`.
 */

export type Grading = 'relaxed' | 'strict';

/** A stretch of an answer, and whether it is right where it stands. */
export type Mark = { text: string; ok: boolean };

export type SpellingVerdict = {
  result: 'correct' | 'almost' | 'wrong';
  /** The spelling the answer was held against: the closest of the accepted ones. */
  target: string;
  /** What was typed; `ok: false` on letters that are wrong or do not belong. */
  typed: Mark[];
  /** The right spelling; `ok: false` on letters that were missed or got wrong. */
  expected: Mark[];
  slips: number;
  /** The letters are right and only accents differ. */
  accentsOnly: boolean;
};

export type MeaningVerdict = {
  result: 'correct' | 'wrong';
  /** False when the words alone could not settle it and reading for meaning might. */
  confident: boolean;
};

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const LETTER = /[\p{L}\p{N}\p{M}]/u;
const SPACE = /\s/u;

const stripAccents = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');

type Unit = { shown: string; key: string };

/**
 * An answer as the units that are compared. Each keeps the text it came from, so
 * the result can be shown as typed. Capitals fold away; punctuation and repeated
 * spaces carry an empty key and take no part in the comparison.
 */
function units(text: string): Unit[] {
  const out: Unit[] = [];
  let previousSpace = true;
  for (const shown of Array.from(text.normalize('NFC').trim())) {
    let key = '';
    if (SPACE.test(shown)) {
      key = previousSpace ? '' : ' ';
      previousSpace = true;
    } else if (LETTER.test(shown)) {
      key = shown.toLocaleLowerCase();
      previousSpace = false;
    } else if (/['’‘ʼ`]/.test(shown)) {
      key = "'";
    } else if (/[-‐‑‒–—]/.test(shown)) {
      key = '-';
    }
    out.push({ shown, key });
  }
  // Apostrophes, hyphens and spaces count only between letters.
  const letterAt = (index: number, step: number) => {
    for (let i = index + step; i >= 0 && i < out.length; i += step) {
      if (out[i].key === '') continue;
      return LETTER.test(out[i].key);
    }
    return false;
  };
  out.forEach((unit, index) => {
    if (unit.key && !LETTER.test(unit.key) && !(letterAt(index, -1) && letterAt(index, 1))) unit.key = '';
  });
  return out;
}

/** How many slips a relaxed mark lets through, by the length of the right answer. */
export function allowedSlips(target: string): number {
  const length = units(target).filter((unit) => unit.key && unit.key !== ' ').length;
  // One wrong character in a short Chinese or Japanese word is a different word.
  if (CJK.test(target)) return length < 8 ? 0 : 1;
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  if (length <= 15) return 2;
  return 3;
}

/** Edit distance with swaps of neighbours counted once, and which units line up. */
function align(a: string[], b: string[]): { slips: number; okA: boolean[]; okB: boolean[] } {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) => {
    const row = new Array<number>(cols).fill(0);
    row[0] = i;
    return row;
  });
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) best = Math.min(best, d[i - 2][j - 2] + 1);
      d[i][j] = best;
    }
  }
  const okA = new Array<boolean>(a.length).fill(false);
  const okB = new Array<boolean>(b.length).fill(false);
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1] && d[i][j] === d[i - 1][j - 1]) {
      okA[i - 1] = true; okB[j - 1] = true; i--; j--;
    } else if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && d[i][j] === d[i - 2][j - 2] + 1) {
      i -= 2; j -= 2;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      i--;
    } else {
      j--;
    }
  }
  return { slips: d[a.length][b.length], okA, okB };
}

/** Neighbouring units that share a verdict, joined, so there is less to draw. */
function marks(all: Unit[], ok: boolean[]): Mark[] {
  const out: Mark[] = [];
  let compared = 0;
  for (const unit of all) {
    // What took no part in the comparison is neither right nor wrong: it goes with its neighbour.
    const fine = unit.key ? ok[compared++] : (out[out.length - 1]?.ok ?? true);
    const last = out[out.length - 1];
    if (last && last.ok === fine) last.text += unit.shown;
    else out.push({ text: unit.shown, ok: fine });
  }
  return out;
}

/** The spellings a card accepts: all of it, each alternative it lists, with and without its asides. */
export function acceptedForms(expected: string): string[] {
  const whole = expected.normalize('NFC').trim();
  const withoutAsides = (text: string) => text.replace(/\s*[(（][^)）]*[)）]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const forms = new Set<string>();
  for (const text of [whole, ...whole.split(/\s*[/;；|]\s*/)]) {
    for (const form of [text.trim(), withoutAsides(text)]) if (form) forms.add(form);
  }
  return Array.from(forms);
}

function compareSpelling(input: string, target: string, grading: Grading): SpellingVerdict {
  const typed = units(input);
  const expected = units(target);
  const a = typed.filter((unit) => unit.key).map((unit) => unit.key);
  const b = expected.filter((unit) => unit.key).map((unit) => unit.key);
  const { slips, okA, okB } = align(a, b);
  const accentsOnly = slips > 0 && a.length === b.length && a.every((key, index) => stripAccents(key) === stripAccents(b[index]));
  const result = slips === 0 ? 'correct'
    : grading === 'relaxed' && a.length > 0 && (accentsOnly || slips <= allowedSlips(target)) ? 'almost'
      : 'wrong';
  return { result, target, typed: marks(typed, okA), expected: marks(expected, okB), slips, accentsOnly };
}

const RANK = { correct: 0, almost: 1, wrong: 2 } as const;

export function checkSpelling(input: string, expected: string, grading: Grading): SpellingVerdict {
  let best: SpellingVerdict | null = null;
  for (const form of acceptedForms(expected)) {
    const verdict = compareSpelling(input, form, grading);
    if (!best || RANK[verdict.result] < RANK[best.result] || (verdict.result === best.result && verdict.slips < best.slips)) best = verdict;
  }
  return best ?? compareSpelling(input, expected, grading);
}

// ── Meaning ─────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'and', 'or', 'by', 'as',
  'is', 'are', 'was', 'were', 'be', 'being', 'been', 'it', 'its', 'this', 'that', 'which',
  'means', 'meaning', 'phrase', 'word', 'informal', 'formal', 'something', 'someone',
]);

const fold = (text: string) =>
  text.normalize('NFC').toLocaleLowerCase().replace(/[^\p{L}\p{N}\p{M}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const withoutLead = (text: string) => text.replace(/^(?:a|an|the|to)\s+/, '');

/** Light enough to make "runs", "running" and "run" one word, and nothing cleverer. */
const stem = (word: string) => (word.length > 4 ? word.replace(/(?:ing|ed|es|ly|s)$/, '') : word);

function keywords(text: string): string[] {
  const folded = fold(text);
  if (CJK.test(folded)) {
    const chars = Array.from(folded.replace(/\s/g, ''));
    if (chars.length < 2) return chars;
    return chars.slice(0, -1).map((char, index) => char + chars[index + 1]);
  }
  return folded.split(' ').filter((word) => word.length > 1 && !STOP_WORDS.has(word)).map(stem);
}

const sameWord = (a: string, b: string) =>
  a === b || (a.length >= 5 && b.length >= 5 && align(Array.from(a), Array.from(b)).slips <= 1);

/** What a card accepts as its meaning: all of it, and each short alternative it lists. */
function acceptedMeanings(expected: string): string[] {
  const forms = new Set<string>(acceptedForms(expected).map(fold));
  // "happy, glad" lists two answers; "a large, slow river" is one. Only short pieces are alternatives.
  const pieces = expected.split(/\s*[,，、]\s*/).map(fold).filter(Boolean);
  if (pieces.length > 1 && pieces.every((piece) => piece.split(' ').length <= 3)) pieces.forEach((piece) => forms.add(piece));
  forms.delete('');
  return Array.from(forms);
}

export function checkMeaning(input: string, expected: string, grading: Grading): MeaningVerdict {
  const said = fold(input);
  const forms = acceptedMeanings(expected);
  if (!said || forms.length === 0) return { result: 'wrong', confident: true };

  const right: MeaningVerdict = { result: 'correct', confident: true };
  const saidBare = withoutLead(said);
  for (const form of forms) {
    const bare = withoutLead(form);
    if (said === form || saidBare === bare) return right;
    // Said the answer and more besides.
    if (bare.length >= (CJK.test(bare) ? 2 : 4) && ` ${said} `.includes(CJK.test(bare) ? bare : ` ${bare} `)) return right;
  }
  if (grading === 'strict') return { result: 'wrong', confident: true };

  for (const form of forms) {
    if (compareSpelling(saidBare, withoutLead(form), 'relaxed').result !== 'wrong') return right;
  }

  const mine = keywords(input);
  if (mine.length === 0) return { result: 'wrong', confident: said.length < 2 };
  for (const form of forms) {
    const theirs = keywords(form);
    if (theirs.length === 0) continue;
    const covered = theirs.filter((word) => mine.some((own) => sameWord(own, word))).length / theirs.length;
    const relevant = mine.filter((own) => theirs.some((word) => sameWord(own, word))).length / mine.length;
    if (covered >= 0.7 && relevant >= 0.5) return right;
  }
  // The words do not match. The meaning still might.
  return { result: 'wrong', confident: false };
}
