/**
 * What a round asks about a card, and in which form.
 *
 * A card is taken through up to three steps, and how many depends on how well it is
 * already known — the further along, the harder the one question it gets:
 *
 *   new                  look at it  →  recognise it  →  produce it
 *   Learning, Familiar                  recognise it  →  produce it
 *   Good and beyond                                      produce it
 *
 * Each step can be asked in several forms. Which are possible depends on the card:
 * a synonym question needs synonyms, a gap needs an example sentence that contains
 * the word, dictation needs something that can be said aloud. Among the possible
 * forms that the person has switched on, one is drawn, weighted by what suits the
 * card — a grammar pattern is practised by using it, a word by spelling and hearing it.
 *
 * Nothing here touches React or the network: a round can be built under `node --test`.
 */

import { inferLanguageKind, normalizeLanguageData, type LanguageCardData, type LanguageKind } from './languageCard.ts';
import type { PracticeMode } from './practiceModes.ts';
import { chooseSavedQuestion, type SavedPracticeQuestion } from './practiceQuestions.ts';
import { coherentAnswerCandidates, fallbackOptions } from './quizLanguage.ts';

export type RoundTerm = {
  id: string;
  lesson_id: string;
  term: string;
  definition: string | null;
  explanation: string | null;
  /** Non-null marks a card in a language lesson, even when it holds nothing yet. */
  language_data?: unknown;
  practiceQuestions?: SavedPracticeQuestion[];
};

export type StepKind = 'flip' | 'recognize' | 'produce';

type Shared = {
  termId: string;
  topic: string;
  explain?: string;
  languageData?: LanguageCardData;
  termText?: string;
};

export type FlipQuestion = Shared & { mode: 'flip'; q: string; back: string };

export type ChoiceVariant = 'saved' | 'meaning' | 'reverse' | 'synonym' | 'antonym' | 'gap' | 'heard';
export type ChoiceQuestion = Shared & {
  mode: 'mcq';
  variant: ChoiceVariant;
  /** The short name of the form, shown on the card. */
  chip: string;
  /** What the person is asked to do. */
  prompt: string;
  q: string;
  opts: string[];
  correct: number;
  /** The question is heard, not read: `termText` is spoken and `q` is kept back. */
  audio?: boolean;
};

export type RecallVariant = 'saved' | 'meaning' | 'spelling' | 'dictation';
export type RecallQuestion = Shared & {
  mode: 'recall';
  variant: RecallVariant;
  chip: string;
  placeholder: string;
  q: string;
  answer: string;
  /** How the answer is marked: its letters, or its sense. See lib/answerCheck. */
  answerKind: 'spelling' | 'meaning';
  audio?: boolean;
};

export type MatchPair = {
  termId: string;
  left: string;
  right: string;
  /** A card of this round, whose matching is recorded. The rest are there to fill the
   *  board with the lesson's other words, and matching them is practice. */
  scored: boolean;
};
export type MatchQuestion = {
  mode: 'match';
  termId: string;
  topic: string;
  /** The distinct cards on the board. */
  pairs: MatchPair[];
  /** The pairs to be made, in the order they arrive, as indexes into `pairs`. Longer
   *  than `pairs`: each card comes round more than once. */
  sequence: number[];
};

export type BuildQuestion = Shared & {
  mode: 'build';
  q: string;
  /** The words to arrange, shuffled. */
  tiles: string[];
  /** The words in order. */
  answer: string[];
};

export type RoundQuestion = FlipQuestion | ChoiceQuestion | RecallQuestion | MatchQuestion | BuildQuestion;

export type RoundContext = {
  modes: Record<PracticeMode, boolean>;
  topicByLesson: Record<string, string>;
  /** Every usable card, to draw wrong answers from. */
  pool: RoundTerm[];
  random?: () => number;
};

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const GAP = '_____';

/**
 * How much room a text takes on a card. A Chinese, Japanese or Korean character, or
 * any full-width one, is about twice as wide as a Latin letter and counts as two.
 */
export function displayLength(text: string): number {
  let length = 0;
  for (const char of text.normalize('NFC').trim()) {
    length += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff00-\uffef]/u.test(char) ? 2 : 1;
  }
  return length;
}

/**
 * The longest text each part of a question may hold, in `displayLength` units.
 *
 * Everything a person has to pick, pair, arrange or type is held to these. They are
 * hard limits, not hints: text over the limit is never shortened to fit — a clipped
 * option is an option that cannot be read — it is simply not used. A wrong answer
 * that is too long is not offered; a card whose own answer is too long for one form
 * is asked in another (a long definition cannot be an option, but it can be the
 * question whose options are the short terms).
 *
 *   option        one of four choices: two lines of the card
 *   matchTerm     a word tile on a matching board: a word or a short phrase
 *   matchMeaning  a meaning tile: one sense of the card's meaning (`firstSense`),
 *                 in three lines of the wider column
 *   tile          one word of a sentence to build
 *   sentence      the whole sentence to build
 *   typed         a word or phrase to spell or take down by ear
 *   typedMeaning  a meaning to type in one's own words: about a sentence
 */
export const LIMITS = {
  option: 60,
  matchTerm: 20,
  matchMeaning: 52,
  tile: 18,
  sentence: 90,
  typed: 40,
  typedMeaning: 100,
} as const;

const fits = (text: string | null | undefined, limit: number) => {
  const length = displayLength(text ?? '');
  return length > 0 && length <= limit;
};
/** A matching board draws on at most this many different cards… */
const MATCH_CARDS_MAX = 8;
/** …and needs this many, since it shows at least four rows and never the same card twice at once. */
export const MATCH_CARDS_MIN = 4;
/** Cards of the round that must be waiting to be recognised before a board is worth laying out. */
const MATCH_SCORED_MIN = 2;
/** Pairs to make on one board, repeats included. */
export const MATCH_PAIRS_MAX = 12;

const pickIndex = (length: number, random: () => number) =>
  Math.min(length - 1, Math.floor(Math.max(0, random()) * length));

function shuffled<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const fold = (text: string) => text.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();

/** The answer among three others, or null when there are not three that would do. */
function optionsFrom(answer: string, candidates: string[], random: () => number, exclude: string[] = []): { opts: string[]; correct: number } | null {
  const right = answer.trim();
  if (!fits(right, LIMITS.option)) return null;
  const used = new Set([fold(right), ...exclude.map(fold)]);
  const others: string[] = [];
  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!fits(value, LIMITS.option) || used.has(fold(value))) continue;
    used.add(fold(value));
    others.push(value);
  }
  const coherent = coherentAnswerCandidates(right, others);
  if (coherent.length < 3) return null;
  const opts = shuffled([right, ...shuffled(coherent, random).slice(0, 3)], random);
  return { opts, correct: opts.indexOf(right) };
}

const languageOf = (term: RoundTerm): LanguageCardData | undefined =>
  term.language_data ? normalizeLanguageData(term.language_data) : undefined;

/** Word, phrase, grammar — or knowledge, for a card that is not in a language lesson. */
export function cardKind(term: RoundTerm): LanguageKind | 'knowledge' {
  const data = languageOf(term);
  return data ? inferLanguageKind(term.term, data) : 'knowledge';
}

const shared = (term: RoundTerm, context: RoundContext): Shared => ({
  termId: term.id,
  topic: context.topicByLesson[term.lesson_id] || 'Lesson',
  explain: term.explanation?.trim() || undefined,
  languageData: languageOf(term),
  termText: term.term,
});

const sameLesson = (term: RoundTerm, context: RoundContext) =>
  context.pool.filter((other) => other.id !== term.id && other.lesson_id === term.lesson_id);

/** Where the card's own word sits in its example sentence, if it does. */
function findInExample(term: string, example: string): { start: number; end: number } | null {
  const word = term.trim();
  if (!word || !example) return null;
  const haystack = example.toLocaleLowerCase();
  const needle = word.toLocaleLowerCase();
  let from = 0;
  while (from <= haystack.length) {
    const start = haystack.indexOf(needle, from);
    if (start < 0) return null;
    const end = start + needle.length;
    // In a language written with spaces the match must be a whole word, not part of one.
    const whole = CJK.test(word) || (!/[\p{L}\p{N}]/u.test(example[start - 1] ?? '') && !/[\p{L}\p{N}]/u.test(example[end] ?? ''));
    if (whole) return { start, end };
    from = start + 1;
  }
  return null;
}

/** A meaning that names the thing it defines would give the answer away. */
const definitionNamesTerm = (term: RoundTerm) => {
  const word = fold(term.term);
  return word.length >= 3 && fold(term.definition ?? '').includes(word);
};

/** The card's meaning among three other meanings, every one of them short enough to be a choice. */
function meaningOptions(term: RoundTerm, context: RoundContext, random: () => number) {
  const definition = (term.definition ?? '').trim();
  if (!fits(definition, LIMITS.option)) return null;
  return fallbackOptions(definition, term.lesson_id, term.id, context.pool.filter((other) => fits(other.definition, LIMITS.option)), random);
}

/**
 * Questions written for the card, held to the same limits as the ones built here.
 * A choice that is too long is taken out of the pool it is drawn from; a question
 * whose own answer is too long, or that is left with too few choices, is not asked.
 */
function fittingSaved(rows: SavedPracticeQuestion[]): SavedPracticeQuestion[] {
  const out: SavedPracticeQuestion[] = [];
  for (const row of rows) {
    if (typeof row.correct_answer !== 'string') continue;
    if (row.question_type === 'fill_blank') {
      if (fits(row.correct_answer, LIMITS.typedMeaning)) out.push(row);
      continue;
    }
    if (!fits(row.correct_answer, LIMITS.option) || !Array.isArray(row.options)) continue;
    const options = row.options.filter((option) => typeof option !== 'string' || fits(option, LIMITS.option));
    out.push(options.length === row.options.length ? row : { ...row, options });
  }
  return out;
}

// ── The forms ───────────────────────────────────────────────────

function flipQuestion(term: RoundTerm, context: RoundContext): FlipQuestion {
  return { ...shared(term, context), mode: 'flip', q: term.term, back: (term.definition ?? '').trim() };
}

type Builder<T> = (term: RoundTerm, context: RoundContext, random: () => number) => T | null;

const choiceBuilders: Record<ChoiceVariant, Builder<ChoiceQuestion>> = {
  saved(term, context, random) {
    const saved = chooseSavedQuestion(fittingSaved(term.practiceQuestions || []), 'mcq', random);
    if (!saved || saved.mode !== 'mcq') return null;
    const base = shared(term, context);
    return { ...base, ...saved, explain: saved.explain ?? base.explain, mode: 'mcq', variant: 'saved', chip: 'Choose', prompt: 'Choose the answer' };
  },
  meaning(term, context, random) {
    const options = meaningOptions(term, context, random);
    if (!options) return null;
    return { ...shared(term, context), mode: 'mcq', variant: 'meaning', chip: 'Choose', prompt: 'Choose the meaning', q: term.term, opts: options.opts, correct: options.correctIndex };
  },
  reverse(term, context, random) {
    const definition = (term.definition ?? '').trim();
    if (!definition || definitionNamesTerm(term)) return null;
    const options = optionsFrom(term.term, sameLesson(term, context).map((other) => other.term), random);
    if (!options) return null;
    return { ...shared(term, context), mode: 'mcq', variant: 'reverse', chip: 'Choose', prompt: 'Which card is this?', q: definition, ...options };
  },
  synonym: (term, context, random) => relatedChoice(term, context, random, 'synonym'),
  antonym: (term, context, random) => relatedChoice(term, context, random, 'antonym'),
  gap(term, context, random) {
    const data = languageOf(term);
    const example = data?.example?.trim() || '';
    const found = findInExample(term.term, example);
    if (!data || !found) return null;
    // A synonym would fit the gap just as well, so it cannot be offered as a wrong answer.
    const options = optionsFrom(term.term, sameLesson(term, context).map((other) => other.term), random, data.synonyms || []);
    if (!options) return null;
    return {
      ...shared(term, context), mode: 'mcq', variant: 'gap', chip: 'Fill the gap', prompt: 'Choose the word that fits',
      q: `${example.slice(0, found.start)}${GAP}${example.slice(found.end)}`, ...options,
    };
  },
  heard(term, context, random) {
    if (!languageOf(term) || cardKind(term) === 'grammar') return null;
    const options = meaningOptions(term, context, random);
    if (!options) return null;
    return { ...shared(term, context), mode: 'mcq', variant: 'heard', chip: 'Listen', prompt: 'Choose the meaning of what you heard', q: term.term, opts: options.opts, correct: options.correctIndex, audio: true };
  },
};

function relatedChoice(term: RoundTerm, context: RoundContext, random: () => number, relation: 'synonym' | 'antonym'): ChoiceQuestion | null {
  const data = languageOf(term);
  if (!data) return null;
  const synonyms = data.synonyms || [];
  const antonyms = data.antonyms || [];
  const answers = (relation === 'synonym' ? synonyms : antonyms).filter((word) => fold(word) !== fold(term.term));
  if (answers.length === 0) return null;
  const answer = answers[pickIndex(answers.length, random)];
  // The other relation makes the best wrong answer: it is the one a half-memory reaches for.
  const foil = shuffled(relation === 'synonym' ? antonyms : synonyms, random).slice(0, 1);
  const others = sameLesson(term, context).map((other) => other.term);
  const options = optionsFrom(answer, [...foil, ...shuffled(others, random)], random, [term.term, ...answers]);
  if (!options) return null;
  return {
    ...shared(term, context), mode: 'mcq', variant: relation,
    chip: relation === 'synonym' ? 'Synonym' : 'Opposite',
    prompt: relation === 'synonym' ? 'Choose the word closest in meaning' : 'Choose the opposite',
    q: term.term, ...options,
  };
}

const recallBuilders: Record<RecallVariant, Builder<RecallQuestion>> = {
  saved(term, context, random) {
    const saved = chooseSavedQuestion(fittingSaved(term.practiceQuestions || []), 'recall', random);
    if (!saved || saved.mode !== 'recall') return null;
    // In a language lesson a short answer is a word to be spelled; elsewhere it is an idea to be named.
    const spelled = !!languageOf(term) && saved.answer.trim().split(/\s+/).length <= 3 && fits(saved.answer, LIMITS.typed);
    const base = shared(term, context);
    return {
      ...base, ...saved, explain: saved.explain ?? base.explain, mode: 'recall', variant: 'saved', chip: 'Recall',
      placeholder: 'Type your answer', answerKind: spelled ? 'spelling' : 'meaning',
    };
  },
  meaning(term, context) {
    const definition = (term.definition ?? '').trim();
    // Nobody should be asked to type out a paragraph from memory on a phone.
    if (!fits(definition, LIMITS.typedMeaning)) return null;
    return { ...shared(term, context), mode: 'recall', variant: 'meaning', chip: 'Recall', placeholder: 'Type the meaning', q: term.term, answer: definition, answerKind: 'meaning' };
  },
  spelling(term, context) {
    const definition = (term.definition ?? '').trim();
    if (!definition || !fits(term.term, LIMITS.typed) || definitionNamesTerm(term) || cardKind(term) === 'grammar') return null;
    const language = !!languageOf(term);
    return {
      ...shared(term, context), mode: 'recall', variant: 'spelling', chip: language ? 'Spell it' : 'Name it',
      placeholder: language ? 'Type the word' : 'Type the term', q: definition, answer: term.term, answerKind: 'spelling',
    };
  },
  dictation(term, context) {
    if (!languageOf(term) || cardKind(term) === 'grammar' || !fits(term.term, LIMITS.typed)) return null;
    return { ...shared(term, context), mode: 'recall', variant: 'dictation', chip: 'Listen', placeholder: 'Type what you hear', q: term.term, answer: term.term, answerKind: 'spelling', audio: true };
  },
};

function buildQuestion(term: RoundTerm, context: RoundContext, random: () => number): BuildQuestion | null {
  const data = languageOf(term);
  const example = data?.example?.trim() || '';
  if (!data || !example) return null;
  const answer = example.replace(/[.!?。！？]+$/u, '').split(/\s+/).filter(Boolean);
  if (answer.length < 3 || answer.length > 12) return null;
  if (!fits(answer.join(' '), LIMITS.sentence) || answer.some((word) => !fits(word, LIMITS.tile))) return null;
  let tiles = shuffled(answer, random);
  // A shuffle that lands in order is no question; turn it once.
  if (tiles.every((tile, index) => tile === answer[index])) tiles = [...tiles.slice(1), tiles[0]];
  if (tiles.every((tile, index) => tile === answer[index])) return null;
  return { ...shared(term, context), mode: 'build', q: `Build a sentence with “${term.term}”`, tiles, answer };
}

/**
 * Whether a card can sit on a matching board at all. Matching is for vocabulary: a
 * word or a phrase against its meaning. A grammar pattern is practised by using it,
 * and a knowledge card's meaning is a sentence to understand, not a tile to spot.
 */
/**
 * One sense of a meaning: the first.
 *
 * A card's meaning often lists several — "happy; glad; cheerful", "高兴的，快乐的",
 * "1. a bank 2. a bench". A matching tile shows one. Listing them all makes the tile
 * long and adds nothing to telling this word from the five beside it.
 *
 * Senses are divided by semicolons, slashes, line breaks and numbering. A comma
 * divides them only when what it divides are plainly alternatives — single words
 * ("happy, glad"), or phrases that open the same way ("to run, to jog"). "A large,
 * slow river" is one sense with a comma in it.
 */
export function firstSense(definition: string | null | undefined): string {
  const whole = (definition ?? '').normalize('NFC').trim();
  if (!whole) return '';
  const numbered = whole.replace(/^\s*(?:\(?1[.)、]|①)\s*/u, '').split(/\s*(?:\(?2[.)、]|②)\s*/u)[0];
  const sense = numbered.split(/\s*(?:[;；|\n]|\s\/\s)\s*/u).find((piece) => piece.trim()) ?? numbered;
  const pieces = sense.split(/\s*[,，、]\s*/u).map((piece) => piece.trim()).filter(Boolean);
  return (alternatives(pieces) ? pieces[0] : sense).trim();
}

/** Whether comma-separated pieces are alternatives to one another rather than one phrase. */
function alternatives(pieces: string[]): boolean {
  if (pieces.length < 2) return false;
  if (pieces.every((piece) => CJK.test(piece))) return pieces.every((piece) => displayLength(piece) <= 12);
  const words = (piece: string) => piece.split(/\s+/).length;
  if (pieces.every((piece) => words(piece) === 1)) return true;
  const opening = (piece: string) => /^(to|an?|the)\s/i.exec(piece)?.[1].toLowerCase().replace(/^an?$|^the$/, 'article') ?? '';
  return opening(pieces[0]) !== '' && pieces.every((piece) => opening(piece) === opening(pieces[0]) && words(piece) <= 4);
}

export const canMatch = (term: RoundTerm) => {
  const kind = cardKind(term);
  return (kind === 'word' || kind === 'phrase')
    && fits(term.term, LIMITS.matchTerm) && fits(firstSense(term.definition), LIMITS.matchMeaning);
};

/**
 * A matching board: words down one side, meanings down the other, a few rows at a
 * time. A pair that is made leaves and another takes its place, until every pair in
 * the sequence has been made.
 *
 * `waiting` are the round's cards whose recognition step this board stands for; their
 * matching is recorded. The lesson's other words fill the board out to as many as
 * eight different cards, and every card comes round twice (up to twelve pairs in
 * all), so a pair is found again after it has left the screen — which is the part
 * that is remembering rather than elimination.
 *
 * Null when fewer than two cards are waiting or the lesson cannot fill four rows.
 */
export function matchQuestion(waiting: RoundTerm[], context: RoundContext): MatchQuestion | null {
  const random = context.random ?? Math.random;
  const lessonId = waiting[0]?.lesson_id;
  const pairs: MatchPair[] = [];
  const seenId = new Set<string>();
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();
  const add = (term: RoundTerm, scored: boolean) => {
    if (pairs.length >= MATCH_CARDS_MAX || seenId.has(term.id) || term.lesson_id !== lessonId || !canMatch(term)) return;
    const left = term.term.trim();
    const right = firstSense(term.definition);
    // Two cards with the same face would make a pair with two right answers.
    if (seenLeft.has(fold(left)) || seenRight.has(fold(right))) return;
    seenId.add(term.id);
    seenLeft.add(fold(left));
    seenRight.add(fold(right));
    pairs.push({ termId: term.id, left, right, scored });
  };
  waiting.forEach((term) => add(term, true));
  const scored = pairs.length;
  if (scored < MATCH_SCORED_MIN) return null;
  shuffled(context.pool, random).forEach((term) => add(term, false));
  if (pairs.length < MATCH_CARDS_MIN) return null;

  const indexes = pairs.map((_, index) => index);
  const total = Math.min(MATCH_PAIRS_MAX, pairs.length * 2);
  // Everything once, then round again — the round's own cards first, so that when
  // twelve pairs will not hold two of everything it is the fillers that come once.
  const again = [...shuffled(indexes.slice(0, scored), random), ...shuffled(indexes.slice(scored), random)];
  const sequence = [...shuffled(indexes, random), ...again.slice(0, total - pairs.length)];
  return {
    mode: 'match', termId: pairs[0].termId,
    topic: context.topicByLesson[lessonId] || 'Lesson', pairs, sequence,
  };
}

// ── Choosing among them ─────────────────────────────────────────

type Kind = LanguageKind | 'knowledge';

/** How much each form suits each kind of card. Zero means never. */
const CHOICE_WEIGHTS: Record<ChoiceVariant, { mode: PracticeMode; weight: Record<Kind, number> }> = {
  saved:   { mode: 'mcq',    weight: { word: 3, phrase: 3, grammar: 4, knowledge: 4 } },
  meaning: { mode: 'mcq',    weight: { word: 2, phrase: 2, grammar: 1, knowledge: 2 } },
  reverse: { mode: 'mcq',    weight: { word: 1, phrase: 1, grammar: 0, knowledge: 2 } },
  synonym: { mode: 'mcq',    weight: { word: 3, phrase: 2, grammar: 0, knowledge: 0 } },
  antonym: { mode: 'mcq',    weight: { word: 3, phrase: 2, grammar: 0, knowledge: 0 } },
  gap:     { mode: 'mcq',    weight: { word: 3, phrase: 3, grammar: 4, knowledge: 0 } },
  heard:   { mode: 'listen', weight: { word: 2, phrase: 2, grammar: 0, knowledge: 0 } },
};

const RECALL_WEIGHTS: Record<RecallVariant, { mode: PracticeMode; weight: Record<Kind, number> }> = {
  saved:     { mode: 'recall', weight: { word: 2, phrase: 2, grammar: 3, knowledge: 3 } },
  meaning:   { mode: 'recall', weight: { word: 1, phrase: 1, grammar: 1, knowledge: 3 } },
  spelling:  { mode: 'recall', weight: { word: 3, phrase: 2, grammar: 0, knowledge: 1 } },
  dictation: { mode: 'listen', weight: { word: 3, phrase: 2, grammar: 0, knowledge: 0 } },
};

const BUILD_WEIGHT: Record<Kind, number> = { word: 1, phrase: 3, grammar: 4, knowledge: 0 };
/** Matching, when enough cards are waiting to be recognised, is usually the better use of them. */
const MATCH_WEIGHT = 6;

type Candidate = { variant: string; weight: number; make: () => RoundQuestion | null };

function candidatesFor(term: RoundTerm, step: StepKind, context: RoundContext, partners: RoundTerm[]): Candidate[] {
  const random = context.random ?? Math.random;
  const kind = cardKind(term);
  const { modes } = context;
  const out: Candidate[] = [];
  if (step === 'flip') {
    if (modes.flip) out.push({ variant: 'flip', weight: 1, make: () => flipQuestion(term, context) });
    return out;
  }
  if (step === 'recognize') {
    for (const variant of Object.keys(CHOICE_WEIGHTS) as ChoiceVariant[]) {
      const { mode, weight } = CHOICE_WEIGHTS[variant];
      if (modes[mode] && weight[kind] > 0) out.push({ variant, weight: weight[kind], make: () => choiceBuilders[variant](term, context, random) });
    }
    if (modes.match && canMatch(term)) {
      // Only cards from the same lesson: across lessons the pairs give themselves away by subject.
      const others = partners.filter((other) => other.id !== term.id && other.lesson_id === term.lesson_id && canMatch(other));
      if (others.length >= MATCH_SCORED_MIN - 1) out.push({ variant: 'match', weight: MATCH_WEIGHT, make: () => matchQuestion([term, ...others], context) });
    }
    return out;
  }
  for (const variant of Object.keys(RECALL_WEIGHTS) as RecallVariant[]) {
    const { mode, weight } = RECALL_WEIGHTS[variant];
    if (modes[mode] && weight[kind] > 0) out.push({ variant, weight: weight[kind], make: () => recallBuilders[variant](term, context, random) });
  }
  if (modes.build && BUILD_WEIGHT[kind] > 0) out.push({ variant: 'build', weight: BUILD_WEIGHT[kind], make: () => buildQuestion(term, context, random) });
  return out;
}

/**
 * A question for this card at this step, or null when no form of it can be asked.
 *
 * `partners` are the other cards waiting at the same step: with enough of them, a
 * recognition step can be asked of several cards at once as a matching question.
 * `avoid` is the form this card was last asked in, so a second go is not a repeat.
 */
export function questionFor(
  term: RoundTerm, step: StepKind, context: RoundContext, partners: RoundTerm[] = [], avoid?: string,
): { question: RoundQuestion; variant: string } | null {
  const random = context.random ?? Math.random;
  const open = candidatesFor(term, step, context, partners)
    .map((candidate) => (candidate.variant === avoid ? { ...candidate, weight: candidate.weight * 0.15 } : candidate));
  while (open.length > 0) {
    const total = open.reduce((sum, candidate) => sum + candidate.weight, 0);
    let roll = Math.max(0, random()) * total;
    let index = 0;
    for (; index < open.length - 1; index++) {
      roll -= open[index].weight;
      if (roll < 0) break;
    }
    const [candidate] = open.splice(index, 1);
    const question = candidate.make();
    if (question) return { question, variant: candidate.variant };
  }
  return null;
}

/** The steps a card is taken through this round, by the stage it is at. */
export function plannedSteps(stepIndex: number | null | undefined): StepKind[] {
  if (!stepIndex || stepIndex <= 0) return ['flip', 'recognize', 'produce'];
  if (stepIndex <= 2) return ['recognize', 'produce'];
  return ['produce'];
}

/**
 * The planned steps that can actually be asked of this card. A step with no form —
 * everything that would ask it is switched off, or the card lacks what it needs — is
 * left out. If that leaves nothing, the card is asked the hardest thing that is
 * possible, so no card in a round goes unasked.
 */
export function askableSteps(term: RoundTerm, stepIndex: number | null | undefined, context: RoundContext, roundTerms: RoundTerm[]): StepKind[] {
  const canAsk = (step: StepKind) => questionFor(term, step, context, roundTerms) !== null;
  const steps = plannedSteps(stepIndex).filter(canAsk);
  if (steps.length > 0) return steps;
  const fallback = (['produce', 'recognize', 'flip'] as StepKind[]).find(canAsk);
  return fallback ? [fallback] : [];
}
