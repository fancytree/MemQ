/**
 * Cards made by somebody else's model, brought in.
 *
 * The app can write cards and practice questions itself, and each time it does it
 * pays for a model. This is the other way in, which costs nothing and has no
 * limit: the person asks whatever AI they already use — with a prompt this file
 * writes for them — and pastes back what it gives them. That model does all of
 * the work, the questions included; this only checks what comes back and saves it.
 *
 * It is the same contract the MCP endpoint offers a connected AI
 * (supabase/functions/_shared/memqTools.ts, `create_lesson_with_practice`): the
 * same field names, the same rules for a question, and the same database
 * functions at the end. The difference is only how the material travels — through
 * the clipboard instead of a tool call — so nothing here is a second format to
 * keep in step with the first.
 *
 * What a model hands back is never quite what it was asked for. It wraps the JSON
 * in a sentence and a code fence, uses curly quotes, leaves a trailing comma,
 * writes four options where five were asked for, or forgets the format entirely
 * and produces a table. So reading is forgiving and saving is not: anything that
 * can be understood is understood, every card is checked against the same rules
 * the server applies, and what does not pass is said plainly, card by card, before
 * anything is written.
 *
 * A card whose questions do not pass is still a card. It is kept without them —
 * it can be practised as a flashcard and typed from memory straight away — rather
 * than thrown out with them.
 *
 * No imports, so the whole of it runs in a test with no app around it.
 */

export type LearningMode = 'knowledge' | 'language';

export type ImportedQuestion = {
  question_type: 'mcq' | 'true_false' | 'fill_blank';
  question_text: string;
  correct_answer: string;
  /** Null for recall. */
  options: string[] | null;
  explanation?: string;
};

export type ImportedCard = {
  /** Local to one import; what a tick refers to. */
  id: string;
  term: string;
  definition: string;
  explanation?: string;
  /** Language lessons only. Carried as given; the database owns the shape. */
  language_data?: Record<string, unknown>;
  /** Empty when none were given, or when what was given did not pass. A card
   *  either has a full set — at least one choice and one recall — or none. */
  questions: ImportedQuestion[];
  /** What was wrong with this card, in words for the person. Not fatal: the card
   *  is still importable, usually without its questions. */
  notes: string[];
};

export type ImportResult = {
  cards: ImportedCard[];
  /** What the model proposed calling it, if it said. */
  lesson: { name?: string; description?: string; learning_mode?: LearningMode };
  /** Things that could not be read at all, for the person. */
  problems: string[];
  /** How it was read, for the screen to say and the tests to check. */
  format: 'json' | 'table' | 'lines' | 'none';
};

/* ── The rules ─────────────────────────────────────────────────────────────────
 * The first group is the server's (memqTools.ts and the SQL behind it): past
 * these a write is refused. The second is the screen's (lib/practiceRound.ts,
 * `LIMITS`): past these a question is saved and then never shown, because an
 * option that runs to three lines makes the card unusable on a phone. Holding to
 * the tighter one here means what is imported is what gets asked. */

export const IMPORT_LIMITS = {
  term: 300,
  definition: 4000,
  explanation: 4000,
  questionText: 240,
  answer: 1000,
  questionExplanation: 1200,
  /** The server's ceiling on one option, in characters. */
  optionChars: 100,
  /** The screen's, in display units (a CJK character counts as two). */
  optionDisplay: 60,
  optionsMin: 5,
  optionsMax: 6,
  questionsMin: 2,
  questionsMax: 10,
  /** One call to the database takes this many cards, and this many questions. */
  batchCards: 50,
  batchQuestions: 100,
  /** One import. Enough for a chapter; past it something has gone wrong. */
  cards: 200,
} as const;

/** How wide text is on screen. The same measure practice uses. */
export function displayLength(text: string): number {
  let length = 0;
  for (const char of text.normalize('NFC').trim()) {
    length += /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}　-〿＀-￯]/u.test(char) ? 2 : 1;
  }
  return length;
}

/** Which writing system a piece of text is mostly in. Not a language detector:
 *  it only has to notice an answer in one script among options in another. */
function script(text: string): string | null {
  // A shared acronym does not make an answer English.
  const content = text.replace(/(?<![A-Za-z])[A-Z]{2,5}(?![A-Za-z])/g, '');
  const groups: Array<[string, RegExp]> = [
    ['cjk', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu],
    ['hangul', /\p{Script=Hangul}/gu], ['arabic', /\p{Script=Arabic}/gu],
    ['cyrillic', /\p{Script=Cyrillic}/gu], ['greek', /\p{Script=Greek}/gu],
    ['devanagari', /\p{Script=Devanagari}/gu], ['latin', /\p{Script=Latin}/gu],
  ];
  const counts = groups
    .map(([name, pattern]) => ({ name, count: (content.match(pattern) || []).length }))
    .sort((a, b) => b.count - a.count);
  return counts[0].count ? counts[0].name : null;
}

/* ── The prompt ────────────────────────────────────────────────────────────────
 *
 * Not "make me cards about X". The person's own AI knows things this app never
 * will: what they were just talking about, what is in the file they attached,
 * how much they already know. So the prompt hands it the job of finding out what
 * is wanted before it writes anything, and it works three ways from one text:
 *
 *   - pasted into a conversation they have already had, it turns what was
 *     discussed into cards;
 *   - pasted with notes or a file, it works from those;
 *   - pasted on its own, it asks — and asks a little more if the answer leaves
 *     something open, the way a tutor would.
 *
 * Only then does it write, and what it writes is the one part with no freedom in
 * it: a JSON object in the shape below, in a code block, or the same thing as a
 * file where the chat app can make files.
 */

export type PromptOptions = {
  /** Something to start from, if they said. The AI may still ask about it. */
  topic?: string;
  /**
   * Set when the cards are going into a lesson that already exists: that lesson
   * is one kind or the other, and cards of the wrong kind would be refused.
   * Left out, the AI decides from what the person is learning.
   */
  lessonMode?: LearningMode;
  /**
   * The lesson the cards are being added to, when there is one. Adding is a
   * different job from starting: the AI is told what the lesson is called and
   * what it already holds, so it writes what is missing, in the same language
   * and manner, instead of a fresh set that repeats half of it.
   */
  lesson?: { name: string; terms: string[] };
};

/** How much of a lesson is written into the prompt. Enough to see what it is
 *  about and not repeat it; a lesson of a thousand cards is not pasted whole. */
export const PROMPT_HELD_MAX = 150;
const HELD_TERM_MAX = 60;

/** How many cards one reply is asked for when the person does not say. A reply
 *  has a length limit, and a set this size with its questions fits inside it
 *  with room to spare; more than the maximum is what "continue" is for. */
export const PROMPT_CARDS_DEFAULT = 12;
export const PROMPT_CARDS_MAX = 20;

const EXAMPLE = {
  lesson: { name: 'How cells make energy', description: 'The parts of the cell that turn food into ATP.', learning_mode: 'knowledge' },
  cards: [{
    term: 'Mitochondria',
    definition: 'The part of a cell that turns nutrients into usable energy (ATP).',
    explanation: 'Often called the powerhouse of the cell.',
    questions: [
      {
        question_type: 'mcq', question_text: 'Which part of the cell produces most of its ATP?',
        options: ['Mitochondria', 'Ribosome', 'Golgi apparatus', 'Nucleus', 'Lysosome'], correct_answer: 'Mitochondria',
        explanation: 'ATP is made in the mitochondria; ribosomes build proteins.',
      },
      { question_type: 'fill_blank', question_text: 'What is the powerhouse of the cell called?', correct_answer: 'Mitochondria' },
    ],
  }],
};

const LANGUAGE_CARD = {
  term: 'il conto',
  definition: 'the bill',
  explanation: 'What you ask for when you want to pay.',
  language_data: {
    pronunciation: 'il ˈkonto',
    part_of_speech: 'noun',
    forms: 'plural: i conti',
    example: 'Il conto, per favore.',
    synonyms: ['la ricevuta', 'lo scontrino'],
    antonyms: ['il preventivo'],
    collocations: ['chiedere il conto', 'pagare il conto'],
  },
};

/**
 * The prompt the person takes to their own AI.
 *
 * Written for a model that has never heard of this app, so it carries the whole
 * contract. The limits are stated as numbers because "keep it short" is not
 * something a model can check its work against, and "at most 50 characters" is.
 */
export function buildPrompt(options: PromptOptions = {}): string {
  const topic = options.topic?.trim();
  const fixed = options.lessonMode;
  const lesson = options.lesson?.name.trim() ? options.lesson : undefined;
  const held = (lesson?.terms ?? []).map((term) => term.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const shown = held.slice(0, PROMPT_HELD_MAX).map((term) => (term.length > HELD_TERM_MAX ? `${term.slice(0, HELD_TERM_MAX)}…` : term));
  const more = held.length - shown.length;

  const kind = fixed === 'language'
    ? ['These cards are going into a language lesson, so every card is a word, phrase or grammar pattern, and "learning_mode" is "language".']
    : fixed === 'knowledge'
      ? ['These cards are going into a lesson about a subject, not a language lesson, so "learning_mode" is "knowledge" and no card has "language_data".']
      : ['Decide which kind of lesson this is and say so in "learning_mode": "language" if I am learning to speak or read a language (cards are words, phrases or grammar patterns), otherwise "knowledge" (cards are ideas, people, events, rules, formulas).'];

  return [
    lesson
      ? `I use a flashcard app called MemQ. I have a lesson there called "${lesson.name.trim()}" and I want to add cards to it. Help me make them. Work with me in this conversation, in three steps.`
      : 'I use a flashcard app called MemQ. Help me make study cards I can import into it. Work with me in this conversation, in three steps.',
    'Talk to me in the language I use, not the language of these instructions. The cards are in my language too.',
    '',
    lesson
      ? 'STEP 1. Find out what I want to add. Do not write any cards until you know.'
      : 'STEP 1. Find out what I want to learn. Do not write any cards until you know.',
    ...(lesson ? (shown.length ? [
      `The lesson already has ${held.length === 1 ? 'this card' : `these ${held.length} cards`}. Do not make any of them again, and write the new ones in the same language and the same manner:`,
      `${shown.join('; ')}${more > 0 ? `; and ${more} more` : ''}`,
      '',
    ] : ['The lesson has no cards yet.', '']) : []),
    ...(topic ? [lesson ? 'What I have in mind to add:' : 'What I have in mind:', topic, ''] : []),
    '- If we were already talking before this message, offer to make the cards from what we discussed, and say in one line what they would cover.',
    '- If I gave you notes, a document or a word list — typed here or attached as a file — work from that and only from that.',
    topic
      ? '- If what I have in mind is clear enough to start, start. If something that matters is open, ask.'
      : lesson
        ? '- Otherwise, ask me what I want to add. You may suggest, in one line, what the lesson is still missing.'
        : '- Otherwise, ask me what I want to learn.',
    '- You may ask up to three short questions in one message, only if the answers would change the cards: for example how much I already know, what it is for (an exam, a trip, my work), or how many cards. Never ask about the format.',
    '- When you ask, say in the same message that I can also paste the material or attach a file — a PDF, a document, slides, a photo of a page, a word list — if it is already written down somewhere.',
    '- If I say "just go", stop asking and use your judgment.',
    '',
    `STEP 2. Make the cards. About ${PROMPT_CARDS_DEFAULT}${lesson ? ' new ones' : ''} unless I asked for a number. Use only what is true, and nothing the material does not support.`,
    ...kind,
    '- "term": the name of one idea, or one word or phrase. At most 80 characters.',
    '- "definition": what it is, or what it means, in one or two plain sentences in my language.',
    '- "explanation": optional. One sentence that helps it stick.',
    ...(fixed === 'knowledge' ? [] : [
      '- Language cards only: add "language_data". The app has a screen for each of these and shows what is there, so fill in everything the word actually has:',
      '  - "pronunciation": IPA, pinyin or another reading guide.',
      '  - "part_of_speech": noun, verb, adjective, a particle, whatever it is.',
      '  - "forms": the forms worth knowing, in one line — a plural, a gender, an irregular past, a measure word. Leave it out for a word that has none.',
      '  - "example": one natural sentence in the language being learned, with the word in it, short enough to say out loud.',
      '  - "synonyms", "antonyms", "collocations": two to four each, as arrays, in the language being learned. Collocations are the words it is normally used with. Leave out any of the three the word has none of; do not pad them.',
      `  Like this: ${JSON.stringify(LANGUAGE_CARD)}`,
    ]),
    'Every card needs practice questions, in "questions":',
    '- At least one multiple-choice question ("question_type": "mcq") with exactly 5 options: the correct answer and 4 wrong ones that someone could plausibly pick. "correct_answer" must be copied exactly from one of the options.',
    '- At least one recall question ("question_type": "fill_blank") with no options, whose "correct_answer" is short enough to type from memory.',
    '- You may add a true/false question ("question_type": "true_false") only if the question is in English, with "options": ["True", "False"] and "correct_answer": "True" or "False".',
    'Hard limits. Check your work against them:',
    '- Every option: at most 50 characters (25 if it is Chinese, Japanese or Korean). Short phrases, not sentences.',
    '- All options of one question in the same language, and similar in length and kind, so the right one does not stand out.',
    '- A recall answer: at most 40 characters.',
    '- "question_text": at most 200 characters. Do not put the answer in the question.',
    '',
    'STEP 3. Give me the cards in a form I can import.',
    'Reply with one JSON object in a code block, in exactly this shape, and nothing before it:',
    '',
    '```json',
    JSON.stringify(EXAMPLE, null, 2),
    '```',
    '',
    ...(lesson ? [`In "lesson", "name" is "${lesson.name.trim()}". Only the new cards go in "cards".`] : []),
    'After the code block, add one line telling me to copy the whole reply and paste it into MemQ. If you are able to create files, also give me the same JSON as a file called memq-cards.json.',
    `If I want more than ${PROMPT_CARDS_MAX} cards, give me the first ${PROMPT_CARDS_MAX} and tell me to say "continue" for the next part, in the same format.`,
    'If I ask for changes afterwards (harder, fewer, add something), give me the whole JSON again, not just what changed.',
  ].join('\n');
}

/* ── Reading what came back ──────────────────────────────────────────────────── */

const text = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

/** The JSON inside a reply: past the sentence before it, out of its code fence. */
function findJson(source: string): unknown {
  const candidates: string[] = [];
  for (const fence of source.matchAll(/```[a-zA-Z0-9]*\s*\n?([\s\S]*?)```/g)) candidates.push(fence[1]);
  candidates.push(source);

  for (const candidate of candidates) {
    const starts = [candidate.indexOf('{'), candidate.indexOf('[')].filter((at) => at >= 0);
    if (!starts.length) continue;
    const from = Math.min(...starts);
    const open = candidate[from];
    const to = candidate.lastIndexOf(open === '{' ? '}' : ']');
    if (to <= from) continue;
    const body = candidate.slice(from, to + 1);
    // As it is first; then with the two things models most often get wrong.
    for (const attempt of [body, straightenJson(body)]) {
      try { return JSON.parse(attempt); } catch { /* try the next reading */ }
    }
  }
  return undefined;
}

/**
 * Curly quotes where JSON wants straight ones, and a comma before a closing
 * bracket.
 *
 * Only ever a second attempt, on text that would not parse as it stood — never
 * done up front. A model writes curly quotes *inside* its strings all the time
 * ("How do you say “the bill”?"), and straightening those turns a valid reply
 * into a broken one: that was every language lesson, when this ran first.
 */
function straightenJson(body: string): string {
  return body
    .replace(/[“”„‟]/g, '"')
    .replace(/,\s*([}\]])/g, '$1');
}

/** One line of comma- or tab-separated values, quotes honoured. */
function splitRow(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && !cell.trim()) { quoted = true; cell = ''; }
    else if (char === delimiter) { cells.push(cell); cell = ''; }
    else cell += char;
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

/** Rows that span lines because a quoted cell contains a line break. */
function logicalLines(source: string): string[] {
  const lines: string[] = [];
  let current = '';
  let quotes = 0;
  for (const line of source.split(/\r?\n/)) {
    current = current ? `${current}\n${line}` : line;
    quotes += (line.match(/"/g) || []).length;
    if (quotes % 2 === 0) { lines.push(current); current = ''; quotes = 0; }
  }
  if (current) lines.push(current);
  return lines;
}

const HEADERS: Record<string, 'term' | 'definition' | 'explanation' | 'pronunciation' | 'example'> = {
  term: 'term', word: 'term', front: 'term', phrase: 'term', concept: 'term', question: 'term', 词: 'term', 术语: 'term', 单词: 'term', 正面: 'term',
  definition: 'definition', meaning: 'definition', back: 'definition', answer: 'definition', translation: 'definition', 释义: 'definition', 定义: 'definition', 意思: 'definition', 背面: 'definition',
  explanation: 'explanation', note: 'explanation', notes: 'explanation', hint: 'explanation', 解释: 'explanation', 说明: 'explanation', 备注: 'explanation',
  pronunciation: 'pronunciation', reading: 'pronunciation', ipa: 'pronunciation', pinyin: 'pronunciation', 读音: 'pronunciation', 发音: 'pronunciation',
  example: 'example', sentence: 'example', 例句: 'example',
};

type Row = { term: string; definition: string; explanation?: string; pronunciation?: string; example?: string };

/**
 * A table: a spreadsheet saved as CSV or pasted straight from one (tabs), or the
 * markdown table a model falls back to when it forgets the format.
 *
 * With a header row the columns are taken by name, in any order. Without one the
 * first two are the term and what it means, which is what a two-column list is.
 */
function readTable(source: string): Row[] | null {
  const lines = logicalLines(source).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  let rows: string[][];
  const pipes = lines.filter((line) => line.startsWith('|') || (line.match(/\|/g) || []).length >= 2);
  if (pipes.length >= 2 && pipes.length >= lines.length * 0.6) {
    rows = pipes
      .filter((line) => !/^\|?[\s:|-]+\|?$/.test(line))
      .map((line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()));
  } else {
    const delimiter = lines[0].includes('\t') ? '\t' : lines[0].includes(',') ? ',' : lines[0].includes(';') ? ';' : null;
    if (!delimiter) return null;
    rows = lines.map((line) => splitRow(line, delimiter));
    // A table has the same number of columns most of the way down. Prose with
    // commas in it does not.
    const width = rows[0].length;
    if (width < 2 || rows.filter((row) => row.length === width).length < rows.length * 0.7) return null;
  }
  if (rows.length < 2) return null;

  const named = rows[0].map((cell) => HEADERS[cell.toLowerCase().replace(/[^\p{L}]/gu, '')]);
  const hasHeader = named.includes('term') && named.includes('definition');
  const columns = hasHeader ? named : (['term', 'definition', 'explanation'] as const).slice(0, rows[0].length);
  const body = hasHeader ? rows.slice(1) : rows;

  const out: Row[] = [];
  for (const cells of body) {
    const row: Partial<Row> = {};
    columns.forEach((name, at) => { if (name && cells[at]) row[name] = cells[at]; });
    if (row.term && row.definition) out.push(row as Row);
  }
  return out.length ? out : null;
}

/**
 * "term - what it means", one to a line: what is left when there is no format.
 *
 * The AI is now told to ask before it writes, so the thing most likely to be
 * pasted by mistake is its questions — and a numbered list of questions looks
 * exactly like this ("1. Level: how much do you already know?"). A line that
 * asks something is not a card, and a reply that is mostly asking is not a set
 * of cards at all.
 */
function readLines(source: string): Row[] | null {
  const out: Row[] = [];
  let asking = 0;
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*/g, '').trim();
    if (/[?？]\s*$/.test(line)) { asking += 1; continue; }
    const cut = /^(.{1,120}?)\s*(?:\s[-–—]\s|:\s|：|\s=\s)\s*(.+)$/.exec(line);
    if (cut && cut[1].trim() && cut[2].trim()) out.push({ term: cut[1].trim(), definition: cut[2].trim() });
  }
  if (asking >= out.length) return null;
  // One matching line in a paragraph is a sentence with a colon in it, not a list.
  return out.length >= 2 ? out : null;
}

/** Whether a reply reads as the AI asking something rather than answering. */
function isAsking(source: string): boolean {
  return (source.match(/[?？]/g) || []).length >= 1 && source.length < 4000;
}

/* ── Checking ────────────────────────────────────────────────────────────────── */

/** One question, checked. Returns the question as it will be saved, or why not. */
export function checkQuestion(raw: unknown): { question: ImportedQuestion } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'a question is not in the expected shape' };
  const value = raw as Record<string, unknown>;
  const kind = text(value.question_type ?? value.type).toLowerCase().replace(/[\s-]/g, '_');
  const type = kind === 'multiple_choice' || kind === 'choice' ? 'mcq'
    : kind === 'recall' || kind === 'fill_in_the_blank' || kind === 'typed' ? 'fill_blank'
    : kind === 'truefalse' || kind === 'true/false' ? 'true_false'
    : kind;
  if (type !== 'mcq' && type !== 'true_false' && type !== 'fill_blank') return { error: `a question has an unknown type (${kind || 'none'})` };

  const question_text = text(value.question_text ?? value.question);
  const correct_answer = text(value.correct_answer ?? value.answer);
  if (!question_text) return { error: 'a question has no text' };
  if (question_text.length > IMPORT_LIMITS.questionText) return { error: 'a question is longer than 240 characters' };
  if (!correct_answer) return { error: 'a question has no answer' };
  if (correct_answer.length > IMPORT_LIMITS.answer) return { error: 'an answer is too long' };
  const explanation = text(value.explanation).slice(0, IMPORT_LIMITS.questionExplanation) || undefined;
  const base = { question_text, correct_answer, ...(explanation ? { explanation } : {}) };

  if (type === 'fill_blank') return { question: { ...base, question_type: 'fill_blank', options: null } };

  const given = Array.isArray(value.options) ? value.options.map(text).filter(Boolean) : [];

  if (type === 'true_false') {
    // The app's own labels are English, so the question has to be too.
    const answer = /^true$/i.test(correct_answer) ? 'True' : /^false$/i.test(correct_answer) ? 'False' : null;
    const asked = script(question_text);
    if (!answer) return { error: 'a true/false question is answered with something else' };
    if (asked && asked !== 'latin') return { error: 'a true/false question is not in English' };
    return { question: { ...base, correct_answer: answer, question_type: 'true_false', options: ['True', 'False'] } };
  }

  // Multiple choice. The answer has to be one of the options exactly, because
  // that is how the app knows which one is right.
  const seen = new Set<string>();
  const distinct = given.filter((option) => {
    const key = option.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const right = distinct.find((option) => option === correct_answer)
    ?? distinct.find((option) => option.toLocaleLowerCase() === correct_answer.toLocaleLowerCase());
  if (!right) return { error: `the answer to "${question_text.slice(0, 40)}" is not among its options` };

  const fits = (option: string) =>
    option.length <= IMPORT_LIMITS.optionChars && displayLength(option) <= IMPORT_LIMITS.optionDisplay;
  if (!fits(right)) return { error: `the answer to "${question_text.slice(0, 40)}" is too long to show as an option` };
  // An over-long wrong option is dropped rather than the whole question, as long
  // as enough are left to choose between.
  const answerScript = script(right);
  const others = distinct.filter((option) => option !== right && fits(option)
    && (!answerScript || !script(option) || script(option) === answerScript));
  if (others.length < IMPORT_LIMITS.optionsMin - 1) {
    return { error: `"${question_text.slice(0, 40)}" needs 5 short options in one language` };
  }
  const options = [right, ...others.slice(0, IMPORT_LIMITS.optionsMax - 1)];
  return { question: { ...base, correct_answer: right, question_type: 'mcq', options } };
}

function checkCard(raw: unknown, at: number): ImportedCard | { skip: string } {
  if (!raw || typeof raw !== 'object') return { skip: `Card ${at + 1} is not in the expected shape.` };
  const value = raw as Record<string, unknown>;
  const term = text(value.term ?? value.front ?? value.word);
  const definition = text(value.definition ?? value.back ?? value.meaning);
  if (!term || !definition) return { skip: `Card ${at + 1} has no ${term ? 'definition' : 'term'}.` };
  if (term.length > IMPORT_LIMITS.term) return { skip: `Card ${at + 1} has a term longer than 300 characters.` };

  const notes: string[] = [];
  const explanation = text(value.explanation).slice(0, IMPORT_LIMITS.explanation) || undefined;
  const details = value.language_data && typeof value.language_data === 'object' && !Array.isArray(value.language_data)
    ? value.language_data as Record<string, unknown> : undefined;

  const questions: ImportedQuestion[] = [];
  const given = Array.isArray(value.questions) ? value.questions : [];
  for (const one of given.slice(0, IMPORT_LIMITS.questionsMax)) {
    const checked = checkQuestion(one);
    if ('question' in checked) questions.push(checked.question);
    else notes.push(checked.error);
  }
  // A set is one choice and one recall at least: that is what the database takes
  // (mcp_add_cards_with_practice), and half a set is not saved as a set.
  const complete = questions.some((q) => q.question_type === 'mcq') && questions.some((q) => q.question_type === 'fill_blank');
  if (given.length && !complete) notes.push('its practice questions were left out');

  return {
    id: `c${at + 1}`,
    term,
    definition: definition.slice(0, IMPORT_LIMITS.definition),
    ...(explanation ? { explanation } : {}),
    ...(details ? { language_data: details } : {}),
    questions: complete ? questions : [],
    notes,
  };
}

function fromRow(row: Row, at: number): ImportedCard {
  const details = row.pronunciation || row.example
    ? { ...(row.pronunciation ? { pronunciation: row.pronunciation } : {}), ...(row.example ? { example: row.example } : {}) }
    : undefined;
  return {
    id: `c${at + 1}`,
    term: row.term.slice(0, IMPORT_LIMITS.term),
    definition: row.definition.slice(0, IMPORT_LIMITS.definition),
    ...(row.explanation ? { explanation: row.explanation.slice(0, IMPORT_LIMITS.explanation) } : {}),
    ...(details ? { language_data: details } : {}),
    questions: [],
    notes: [],
  };
}

/**
 * Read whatever was pasted or picked.
 *
 * JSON first, because that is what the prompt asks for and the only form that
 * carries questions. Then a table, then lines. Never throws: something that
 * cannot be read comes back as no cards and a sentence saying so.
 */
export function parseImport(input: string): ImportResult {
  const source = (input ?? '').replace(/^\ufeff/, '').trim();
  const empty: ImportResult = { cards: [], lesson: {}, problems: [], format: 'none' };
  if (!source) return { ...empty, problems: ['There is nothing here yet. Paste what your AI gave you.'] };

  const json = findJson(source);
  if (json !== undefined) {
    const root = (json && typeof json === 'object' && !Array.isArray(json) ? json : {}) as Record<string, unknown>;
    const list = Array.isArray(json) ? json : Array.isArray(root.cards) ? root.cards : Array.isArray(root.terms) ? root.terms : null;
    if (list) {
      const problems: string[] = [];
      const cards: ImportedCard[] = [];
      const seen = new Set<string>();
      list.forEach((raw, at) => {
        const checked = checkCard(raw, at);
        if ('skip' in checked) { problems.push(checked.skip); return; }
        // The same term twice in one reply is the model repeating itself.
        const key = checked.term.toLocaleLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        cards.push({ ...checked, id: `c${cards.length + 1}` });
      });
      if (cards.length > IMPORT_LIMITS.cards) {
        problems.push(`Only the first ${IMPORT_LIMITS.cards} cards are brought in at once.`);
      }
      const about = (root.lesson && typeof root.lesson === 'object' ? root.lesson : root) as Record<string, unknown>;
      const mode = about.learning_mode === 'language' ? 'language' : about.learning_mode === 'knowledge' ? 'knowledge' : undefined;
      return {
        cards: cards.slice(0, IMPORT_LIMITS.cards),
        lesson: {
          ...(text(about.name) ? { name: text(about.name).slice(0, 160) } : {}),
          ...(text(about.description) ? { description: text(about.description).slice(0, 2000) } : {}),
          ...(mode ? { learning_mode: mode } : {}),
        },
        problems: cards.length || problems.length ? problems : ['No cards were found in that.'],
        format: 'json',
      };
    }
  }

  const rows = readTable(source);
  const lines = rows ? null : readLines(source);
  const found = rows ?? lines;
  if (found) {
    const seen = new Set<string>();
    const cards = found
      .filter((row) => {
        const key = row.term.toLocaleLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, IMPORT_LIMITS.cards)
      .map(fromRow);
    return {
      cards, lesson: {}, format: rows ? 'table' : 'lines',
      problems: found.length > IMPORT_LIMITS.cards ? [`Only the first ${IMPORT_LIMITS.cards} cards are brought in at once.`] : [],
    };
  }

  // The most likely reason there are no cards: the AI asked a question first, as
  // it was told to, and that is the reply that got copied.
  return {
    ...empty,
    problems: [isAsking(source)
      ? 'There are no cards in that yet. Your AI is asking you something: answer it there, then paste the reply that has the cards.'
      : 'That could not be read as cards. Paste the whole reply, including the part in the code block.'],
  };
}

/* ── Saving ──────────────────────────────────────────────────────────────────── */

/** A card as the database functions take it: the MCP contract, field for field. */
export type CardPayload = {
  term: string;
  definition: string;
  explanation?: string;
  language_data?: Record<string, unknown>;
  questions?: ImportedQuestion[];
};

export function toPayload(card: ImportedCard, mode: LearningMode, withQuestions: boolean): CardPayload {
  return {
    term: card.term,
    definition: card.definition,
    ...(card.explanation ? { explanation: card.explanation } : {}),
    // The database refuses language details on a lesson that is not a language one.
    ...(mode === 'language' && card.language_data ? { language_data: card.language_data } : {}),
    ...(withQuestions ? { questions: card.questions } : {}),
  };
}

/** Cards with a set of questions, in groups one call will take: the database
 *  accepts fifty cards and a hundred questions at a time. */
export function batches(cards: ImportedCard[]): ImportedCard[][] {
  const out: ImportedCard[][] = [];
  let current: ImportedCard[] = [];
  let questions = 0;
  for (const card of cards) {
    const size = card.questions.length;
    if (current.length && (current.length >= IMPORT_LIMITS.batchCards || questions + size > IMPORT_LIMITS.batchQuestions)) {
      out.push(current);
      current = [];
      questions = 0;
    }
    current.push(card);
    questions += size;
  }
  if (current.length) out.push(current);
  return out;
}

export type ImportTarget =
  | { kind: 'new'; name: string; description?: string; learning_mode: LearningMode }
  | { kind: 'existing'; lesson_id: string; learning_mode: LearningMode };

export type ImportOutcome = { lessonId: string; cards: number; questions: number };

/** The slice of the Supabase client this needs: its remote procedures, and one
 *  plain insert for cards that come without questions. */
export type ImportClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  from: (table: string) => { insert: (rows: unknown) => PromiseLike<{ error: { message?: string } | null }> };
};

const failed = 'Those could not be saved just now. Nothing was lost: try again in a moment.';

/**
 * Save what was ticked.
 *
 * Through the same database functions the MCP endpoint uses, as the person
 * themselves, so row-level security is what decides it is theirs. Each call is
 * one transaction: a group of cards and their questions go in together or not at
 * all. An import larger than one call is several, and if a later one fails the
 * earlier ones stay — what was saved is reported, so trying again does not
 * silently double it.
 */
export async function saveImport(client: ImportClient, cards: ImportedCard[], target: ImportTarget): Promise<ImportOutcome> {
  if (!cards.length) throw new Error('Nothing is ticked, so there is nothing to save.');
  const mode = target.learning_mode;
  const practised = cards.filter((card) => card.questions.length);
  const plain = cards.filter((card) => !card.questions.length);

  let lessonId = target.kind === 'existing' ? target.lesson_id : null;
  let saved = 0;
  let questions = 0;
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await client.rpc(name, args);
    if (error || !data || typeof data !== 'object') {
      throw new Error(saved ? `${saved} cards were saved and the rest were not. Open the lesson before trying again.` : failed);
    }
    return data as Record<string, unknown>;
  };

  const groups = batches(practised);
  // A new lesson is made by the first write, whichever kind that is, so there is
  // never an empty lesson left behind by a write that then failed.
  if (!lessonId) {
    const about = target as Extract<ImportTarget, { kind: 'new' }>;
    const base = { p_name: about.name, p_description: about.description || null, p_learning_mode: mode, p_deadline: null, p_cover_style: null };
    if (groups.length) {
      const first = groups.shift()!;
      const made = await call('mcp_create_lesson_with_practice', { ...base, p_cards: first.map((card) => toPayload(card, mode, true)) });
      lessonId = String(made.lesson_id ?? made.id ?? '');
      saved += first.length;
      questions += first.reduce((sum, card) => sum + card.questions.length, 0);
    } else {
      const first = plain.splice(0, 100);
      const made = await call('mcp_create_lesson', { ...base, p_cards: first.map((card) => toPayload(card, mode, false)) });
      lessonId = String(made.id ?? made.lesson_id ?? '');
      saved += first.length;
    }
    if (!lessonId) throw new Error(failed);
  }

  for (const group of groups) {
    await call('mcp_add_cards_with_practice', { p_lesson_id: lessonId, p_cards: group.map((card) => toPayload(card, mode, true)) });
    saved += group.length;
    questions += group.reduce((sum, card) => sum + card.questions.length, 0);
  }
  // Cards with no questions are rows and nothing more, written the way the MCP
  // `add_cards` tool and the chat's own "keep these" write them.
  while (plain.length) {
    const group = plain.splice(0, 100);
    const { error } = await client.from('terms').insert(group.map((card) => {
      const row = toPayload(card, mode, false);
      return {
        lesson_id: lessonId, term: row.term, definition: row.definition,
        explanation: row.explanation ?? null, language_data: row.language_data ?? null,
      };
    }));
    if (error) {
      throw new Error(saved ? `${saved} cards were saved and the rest were not. Open the lesson before trying again.` : failed);
    }
    saved += group.length;
  }
  return { lessonId, cards: saved, questions };
}

/**
 * How many cards a piece of text holds, if it is a reply to the prompt above.
 *
 * For the box on the create screen. Someone coming back from their AI with a
 * reply on the clipboard sees that box first — "What do you want to learn?" —
 * and pastes into it, which is a reasonable thing to do and used to be the wrong
 * one: the reply was handed to our own model as a passage to take cards from,
 * spending one of the month's generations and throwing away every question the
 * other model had written. So the box asks this before it asks a model anything.
 *
 * Only the format the prompt asks for counts. A table or a list of "term: what it
 * means" could just as well be notes someone wants cards made *from*, and taking
 * those away from Generate would be guessing.
 */
export function cardReplyCount(text: string): number {
  // Cheap first: this runs on every keystroke in a box that is usually a few words.
  // Curly quotes count: text that has been through a notes app or a keyboard with
  // smart punctuation arrives with them, and the reader copes with those.
  if (!text || text.length < 40 || !/["\u201c\u201d](?:cards|term|terms)["\u201c\u201d]\s*:/.test(text)) return 0;
  const read = parseImport(text);
  return read.format === 'json' ? read.cards.length : 0;
}

/* ── On the create screens ─────────────────────────────────────────────────────
 * A reply pasted into the box there is not sent anywhere. Its cards are listed
 * under the box and saved with the lesson — so these are what those screens
 * need: the list after a paste, and the way from the rows they save to the
 * shape `saveImport` takes. */

/** A card as a create screen holds it when it is saved. */
export type SavedRow = {
  term: string;
  definition: string;
  explanation?: string | null;
  language_data?: object | null;
  /** Only on a card that came with its own. */
  questions?: ImportedQuestion[];
};

export function asImported(rows: SavedRow[]): ImportedCard[] {
  return rows.map((row, index) => ({
    id: `s${index}`,
    term: row.term,
    definition: row.definition,
    ...(row.explanation ? { explanation: row.explanation } : {}),
    ...(row.language_data ? { language_data: row.language_data as Record<string, unknown> } : {}),
    questions: row.questions ?? [],
    notes: [],
  }));
}

/**
 * The cards on a create screen after a reply was pasted: what was there, then
 * what the reply adds. A term already listed is not listed twice — pasting the
 * same reply again, or a "continue" that repeats the last card, adds nothing.
 * Cards already listed keep their ids, so removing one never removes another.
 */
export function addPasted(listed: ImportedCard[], reply: ImportResult): ImportedCard[] {
  const have = new Set(listed.map((card) => card.term.trim().toLowerCase()));
  let next = listed.reduce((most, card) => Math.max(most, Number(card.id.slice(1)) || 0), 0) + 1;
  const out = [...listed];
  for (const card of reply.cards) {
    const key = card.term.trim().toLowerCase();
    if (have.has(key)) continue;
    have.add(key);
    out.push({ ...card, id: `p${next++}` });
  }
  return out;
}
