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
import { compatibleAnswerScripts, fallbackOptions } from './quizLanguage.ts';

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

export type MatchPair = { termId: string; left: string; right: string };
export type MatchQuestion = {
  mode: 'match';
  termId: string;
  topic: string;
  pairs: MatchPair[];
  /** The order the right-hand column is shown in, as indexes into `pairs`. */
  rightOrder: number[];
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
/** Longest meaning that still reads in a matching tile. */
const MATCH_MEANING_LIMIT = 140;
const MATCH_TERM_LIMIT = 60;
export const MATCH_SIZE = 4;
const MATCH_MINIMUM = 3;

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
  if (!right) return null;
  const used = new Set([fold(right), ...exclude.map(fold)]);
  const others: string[] = [];
  for (const candidate of candidates) {
    const value = candidate.trim();
    if (!value || used.has(fold(value)) || !compatibleAnswerScripts(right, [value])) continue;
    used.add(fold(value));
    others.push(value);
  }
  if (others.length < 3) return null;
  const opts = shuffled([right, ...shuffled(others, random).slice(0, 3)], random);
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

// ── The forms ───────────────────────────────────────────────────

function flipQuestion(term: RoundTerm, context: RoundContext): FlipQuestion {
  return { ...shared(term, context), mode: 'flip', q: term.term, back: (term.definition ?? '').trim() };
}

type Builder<T> = (term: RoundTerm, context: RoundContext, random: () => number) => T | null;

const choiceBuilders: Record<ChoiceVariant, Builder<ChoiceQuestion>> = {
  saved(term, context, random) {
    const saved = chooseSavedQuestion(term.practiceQuestions || [], 'mcq', random);
    if (!saved || saved.mode !== 'mcq') return null;
    return { ...shared(term, context), ...saved, mode: 'mcq', variant: 'saved', chip: 'Choose', prompt: 'Choose the answer' };
  },
  meaning(term, context, random) {
    const options = fallbackOptions((term.definition ?? '').trim(), term.lesson_id, term.id, context.pool, random);
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
    const options = fallbackOptions((term.definition ?? '').trim(), term.lesson_id, term.id, context.pool, random);
    if (!options) return null;
    return { ...shared(term, context), mode: 'mcq', variant: 'heard', chip: 'Listen', prompt: 'Choose what you heard means', q: term.term, opts: options.opts, correct: options.correctIndex, audio: true };
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
    const saved = chooseSavedQuestion(term.practiceQuestions || [], 'recall', random);
    if (!saved || saved.mode !== 'recall') return null;
    // In a language lesson a short answer is a word to be spelled; elsewhere it is an idea to be named.
    const spelled = !!languageOf(term) && saved.answer.trim().split(/\s+/).length <= 3;
    return {
      ...shared(term, context), ...saved, mode: 'recall', variant: 'saved', chip: 'Recall',
      placeholder: 'Type your answer', answerKind: spelled ? 'spelling' : 'meaning',
    };
  },
  meaning(term, context) {
    const definition = (term.definition ?? '').trim();
    if (!definition) return null;
    return { ...shared(term, context), mode: 'recall', variant: 'meaning', chip: 'Recall', placeholder: 'Type the meaning', q: term.term, answer: definition, answerKind: 'meaning' };
  },
  spelling(term, context) {
    const definition = (term.definition ?? '').trim();
    if (!definition || definitionNamesTerm(term) || cardKind(term) === 'grammar') return null;
    const language = !!languageOf(term);
    return {
      ...shared(term, context), mode: 'recall', variant: 'spelling', chip: language ? 'Spell it' : 'Name it',
      placeholder: language ? 'Type the word' : 'Type the term', q: definition, answer: term.term, answerKind: 'spelling',
    };
  },
  dictation(term, context) {
    if (!languageOf(term) || cardKind(term) === 'grammar' || !term.term.trim()) return null;
    return { ...shared(term, context), mode: 'recall', variant: 'dictation', chip: 'Listen', placeholder: 'Type what you hear', q: term.term, answer: term.term, answerKind: 'spelling', audio: true };
  },
};

function buildQuestion(term: RoundTerm, context: RoundContext, random: () => number): BuildQuestion | null {
  const data = languageOf(term);
  const example = data?.example?.trim() || '';
  if (!data || !example) return null;
  const answer = example.replace(/[.!?。！？]+$/u, '').split(/\s+/).filter(Boolean);
  if (answer.length < 3 || answer.length > 12) return null;
  let tiles = shuffled(answer, random);
  // A shuffle that lands in order is no question; turn it once.
  if (tiles.every((tile, index) => tile === answer[index])) tiles = [...tiles.slice(1), tiles[0]];
  if (tiles.every((tile, index) => tile === answer[index])) return null;
  return { ...shared(term, context), mode: 'build', q: `Build a sentence with “${term.term}”`, tiles, answer };
}

/** Whether a card can sit in a matching question at all. */
export const canMatch = (term: RoundTerm) => {
  const definition = (term.definition ?? '').trim();
  return !!definition && definition.length <= MATCH_MEANING_LIMIT && term.term.trim().length <= MATCH_TERM_LIMIT;
};

/** Several cards and their meanings to pair up. Null with fewer than three distinct pairs. */
export function matchQuestion(terms: RoundTerm[], context: RoundContext): MatchQuestion | null {
  const random = context.random ?? Math.random;
  const pairs: MatchPair[] = [];
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();
  for (const term of terms) {
    if (pairs.length >= MATCH_SIZE) break;
    if (!canMatch(term)) continue;
    const left = term.term.trim();
    const right = (term.definition ?? '').trim();
    // Two cards with the same face would make a pair with two right answers.
    if (seenLeft.has(fold(left)) || seenRight.has(fold(right))) continue;
    seenLeft.add(fold(left));
    seenRight.add(fold(right));
    pairs.push({ termId: term.id, left, right });
  }
  if (pairs.length < MATCH_MINIMUM) return null;
  let rightOrder = shuffled(pairs.map((_, index) => index), random);
  if (rightOrder.every((value, index) => value === index)) rightOrder = [...rightOrder.slice(1), rightOrder[0]];
  return {
    mode: 'match', termId: pairs[0].termId,
    topic: context.topicByLesson[terms[0].lesson_id] || 'Lesson', pairs, rightOrder,
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
      const others = partners.filter((other) => other.id !== term.id && canMatch(other));
      if (others.length >= MATCH_MINIMUM - 1) out.push({ variant: 'match', weight: MATCH_WEIGHT, make: () => matchQuestion([term, ...others], context) });
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
