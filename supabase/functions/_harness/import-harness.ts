/**
 * Does the import prompt work on a model that has never heard of this app?
 *
 *   deno run --allow-all --node-modules-dir=none --env-file=.env \
 *     supabase/functions/_harness/import-harness.ts [--runs N] [--only str] [--verbose]
 *
 * The prompt in lib/cardImport.ts is taken to somebody else's AI, and what comes
 * back is pasted into the app. Whether that works is not something a unit test
 * can say: it depends on what a real model does with the instructions. So this
 * plays the part of the person — pastes the prompt as a message, with no system
 * prompt and nothing else to go on — and reads what comes back with the same
 * parser the app uses.
 *
 * The prompt is a conversation now, not a one-shot request, so each case is one:
 * what was said before the prompt was pasted (if anything), what the person
 * answers when the AI asks, and sometimes what they ask for afterwards. Two
 * things are judged. The first reply: did it find out what was wanted — ask, or
 * offer to use the conversation — instead of writing cards about nothing? And the
 * end: did cards arrive, in the right language, of the right kind, with a full
 * set of questions each?
 *
 * Run on the cheapest model we use, on the reasoning that whatever the person
 * has is at least that good.
 */

import { buildPrompt, parseImport, type ImportResult, type LearningMode, type PromptOptions } from '../../../lib/cardImport.ts';

const args = new Map<string, string>();
for (let i = 0; i < Deno.args.length; i++) {
  if (Deno.args[i].startsWith('--')) args.set(Deno.args[i].slice(2), Deno.args[i + 1]?.startsWith('--') ? '' : Deno.args[i + 1] ?? '');
}
const RUNS = Number(args.get('runs') || 3);
const ONLY = args.get('only');
const VERBOSE = args.has('verbose');
const MODEL = args.get('model') || 'gpt-6-luna';
const key = Deno.env.get('OPENAI_API_KEY');
if (!key) { console.error('OPENAI_API_KEY is not set.'); Deno.exit(2); }

type Message = { role: 'user' | 'assistant'; content: string };

const NOTES = 'My notes: Spaced repetition is a study method in which material is reviewed at growing intervals. It relies on the spacing effect, first described by Hermann Ebbinghaus in 1885, who also charted the forgetting curve: memory of new material falls quickly at first and then levels off. The Leitner system, from 1972, applies this with boxes of flashcards: a card answered correctly moves to a box reviewed less often, and one answered wrongly goes back to the first box. Active recall, retrieving an answer from memory rather than rereading it, is what makes each review count.';

/** A conversation the person was already having when they pasted the prompt in. */
const EARLIER: Message[] = [
  { role: 'user', content: 'How did the Romans build roads that lasted so long?' },
  { role: 'assistant', content: 'In layers. They dug a trench and filled it from the bottom up: the statumen, a bed of large flat stones; the rudus, rubble bound with lime; the nucleus, a finer concrete of gravel and sand; and on top the summum dorsum, fitted paving stones. The surface was cambered, higher in the middle, so rain ran off into ditches at the sides. Surveyors called agrimensores laid the line out with a groma, a cross-shaped sighting tool.' },
  { role: 'user', content: 'And who paid for them?' },
  { role: 'assistant', content: 'Mostly the state and the army. Major roads, the viae publicae, were built at public expense, often by legionaries between campaigns. Officials called curatores viarum were responsible for upkeep, and towns along a road were expected to maintain their own stretch. Milestones, the miliaria, marked each Roman mile and usually named the emperor who had paid.' },
];

type Case = {
  name: string;
  before?: Message[];
  prompt?: PromptOptions;
  /** What the person says each time the AI replies without cards, in order. */
  answers: string[];
  /** Asked once the cards have arrived. */
  then?: string;
  /** What the first reply should have done. */
  first: 'asks' | 'offers' | 'makes';
  /** Words the offer has to contain, to show it read the conversation. */
  about?: RegExp;
  mode: LearningMode;
  writtenIn: 'cjk' | 'latin';
  /** Found in at least three cards, when the cards had to come from somewhere. */
  drawnFrom?: RegExp;
  minCards?: number;
  /** Cards the lesson already has: none of them may come back. */
  notAgain?: string[];
};

const NORSE = ['Odin', 'Thor', 'Loki', 'Freyja', 'Tyr', 'Baldr'];
const ITALIAN = ['il conto', 'grazie', 'per favore', 'buongiorno'];
const GRAMMAR = ['〜わけではない', '〜に違いない', '〜ざるを得ない'];

const CASES: Case[] = [
  {
    name: 'pasted alone: it asks, then makes them',
    answers: ['The basics of photosynthesis, for a high-school exam. About 8 cards.'],
    first: 'asks', mode: 'knowledge', writtenIn: 'latin',
  },
  {
    name: 'pasted alone, and the person answers in Chinese',
    answers: ['我想学日语的日常问候语，我是初学者，8张左右就够了。'],
    first: 'asks', mode: 'language', writtenIn: 'cjk',
  },
  {
    name: 'with something clear to start from, it starts',
    prompt: { topic: 'The causes of the French Revolution, for a history exam. 8 cards.' },
    answers: ['Just go.'],
    first: 'makes', mode: 'knowledge', writtenIn: 'latin',
  },
  {
    name: 'with something vague to start from, it asks',
    prompt: { topic: 'history' },
    answers: ['The Roman Republic. I know almost nothing about it. 8 cards.'],
    first: 'asks', mode: 'knowledge', writtenIn: 'latin',
  },
  {
    name: 'in a conversation they already had, it offers to use it',
    before: EARLIER,
    answers: ['Yes, from this conversation. Just go.'],
    first: 'offers', about: /road|roman/i,
    mode: 'knowledge', writtenIn: 'latin',
    drawnFrom: /statumen|rudus|nucleus|summum dorsum|groma|agrimensor|curator|miliari|milestone|camber|viae publicae/i,
  },
  {
    name: 'with notes, it works from the notes',
    prompt: { topic: NOTES },
    answers: ['Just go.'],
    first: 'makes', mode: 'knowledge', writtenIn: 'latin',
    drawnFrom: /Ebbinghaus|Leitner|forgetting curve|active recall|spacing effect/i,
    minCards: 4,
  },
  {
    name: 'a change afterwards brings the whole set back',
    prompt: { topic: 'The planets of the solar system. 6 cards. Just go.' },
    answers: ['Just go.'],
    then: 'Add two more, about dwarf planets.',
    first: 'makes', mode: 'knowledge', writtenIn: 'latin', minCards: 8,
  },
  {
    name: 'for a language lesson that exists, they are language cards',
    prompt: { lessonMode: 'language', lesson: { name: 'Italian for travel', terms: ITALIAN } },
    answers: ['Italian phrases for ordering food in a restaurant. I am a beginner. 8 cards.'],
    first: 'asks', mode: 'language', writtenIn: 'latin', notAgain: ITALIAN,
  },
  {
    name: 'adding to a lesson, it asks what to add and repeats nothing',
    prompt: { lessonMode: 'knowledge', lesson: { name: 'Norse gods', terms: NORSE } },
    answers: ['Whatever is missing: more gods and the creatures. 8 cards.'],
    first: 'asks', mode: 'knowledge', writtenIn: 'latin', notAgain: NORSE,
  },
  {
    name: 'adding to a lesson with something in mind, it starts',
    prompt: { lessonMode: 'knowledge', lesson: { name: 'Norse gods', terms: NORSE }, topic: 'The most important gods and goddesses I do not have yet. 6 cards. Just go.' },
    answers: ['Just go.'],
    first: 'makes', mode: 'knowledge', writtenIn: 'latin', notAgain: NORSE,
  },
  {
    name: 'adding to a lesson kept in Chinese, the new cards match it',
    prompt: { lessonMode: 'language', lesson: { name: '日语 N2 语法', terms: GRAMMAR } },
    answers: ['再加 6 个 N2 语法，释义用中文。'],
    first: 'asks', mode: 'language', writtenIn: 'cjk', notAgain: GRAMMAR,
  },
];

async function ask(messages: Message[]): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    // No system prompt and no JSON mode: the person's chat app has neither.
    body: JSON.stringify({ model: MODEL, ...(MODEL === 'gpt-6-luna' ? { reasoning_effort: 'none' } : {}), messages }),
  });
  if (!response.ok) throw new Error(`provider said ${response.status}`);
  return (await response.json()).choices?.[0]?.message?.content ?? '';
}

const hasCards = (read: ImportResult) => read.format === 'json' && read.cards.length > 0;
const isCjk = (text: string) => (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length > text.length * 0.3;

/** Play one conversation through. Returns why it went wrong, or null. */
async function play(test: Case): Promise<{ wrong: string | null; turns: number; cards: number; complete: number }> {
  const messages: Message[] = [...(test.before ?? []), { role: 'user', content: buildPrompt(test.prompt) }];
  let reply = await ask(messages);
  let read = parseImport(reply);
  const firstHad = hasCards(read);
  const firstReply = reply;

  let turns = 1;
  for (const answer of test.answers) {
    if (hasCards(read)) break;
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: answer });
    reply = await ask(messages);
    read = parseImport(reply);
    turns += 1;
  }
  if (hasCards(read) && test.then) {
    messages.push({ role: 'assistant', content: reply }, { role: 'user', content: test.then });
    reply = await ask(messages);
    read = parseImport(reply);
    turns += 1;
  }
  if (VERBOSE) {
    console.log(`       . first: ${firstReply.replace(/\s+/g, ' ').slice(0, 200)}`);
    if (hasCards(read)) console.log(`         then ${read.cards.length} cards: ${read.cards.slice(0, 6).map((c) => c.term).join(' | ')}`);
  }

  const complete = read.cards.filter((card) => card.questions.length >= 2).length;
  const out = (wrong: string | null) => ({ wrong, turns, cards: read.cards.length, complete });

  // The first reply: finding out, or starting, as the case calls for.
  if (test.first === 'makes' && !firstHad) return out(`asked when it could have started: "${firstReply.replace(/\s+/g, ' ').slice(0, 120)}"`);
  if (test.first !== 'makes' && firstHad) return out('wrote cards before it knew what was wanted');
  if (test.first !== 'makes' && !/[?？]/.test(firstReply)) return out(`did not ask anything: "${firstReply.replace(/\s+/g, ' ').slice(0, 120)}"`);
  if (test.first === 'offers' && test.about && !test.about.test(firstReply)) return out(`did not mention the conversation: "${firstReply.replace(/\s+/g, ' ').slice(0, 120)}"`);

  // The end: cards, readable, the right kind, in their language.
  if (!hasCards(read)) return out(`no cards after ${turns} turns: ${read.problems[0] ?? read.format}`);
  if (read.cards.length < (test.minCards ?? 4)) return out(`only ${read.cards.length} cards`);
  if (complete < read.cards.length * 0.9) return out(`only ${complete}/${read.cards.length} with a full question set: ${read.cards.flatMap((c) => c.notes).slice(0, 2).join('; ')}`);
  if (read.lesson.learning_mode !== test.mode) return out(`lesson kind ${read.lesson.learning_mode}, wanted ${test.mode}`);
  if (!read.lesson.name) return out('the lesson has no name');
  const spoken = read.cards.filter((card) => isCjk(card.definition) === (test.writtenIn === 'cjk')).length;
  if (spoken < read.cards.length * 0.9) return out(`definitions not in the person's language (${spoken}/${read.cards.length})`);
  if (test.mode === 'language' && read.cards.filter((card) => card.language_data).length < read.cards.length * 0.9) return out('language cards without language details');
  if (test.notAgain) {
    const fold = (term: string) => term.replace(/[〜~\s]/g, '').toLowerCase();
    const have = new Set(test.notAgain.map(fold));
    const again = read.cards.filter((card) => have.has(fold(card.term))).map((card) => card.term);
    if (again.length) return out(`made cards the lesson already has: ${again.join(', ')}`);
  }
  if (test.drawnFrom) {
    const from = read.cards.filter((card) => test.drawnFrom!.test(`${card.term} ${card.definition} ${card.explanation ?? ''}`)).length;
    if (from < 3) return out(`only ${from} cards drawn from what was given`);
  }
  return out(null);
}

let failures = 0;
const chosen = CASES.filter((test) => !ONLY || test.name.includes(ONLY));
console.log(`${chosen.length} conversations x ${RUNS} runs, model ${MODEL}\n`);
for (const test of chosen) {
  const runs = await Promise.all(Array.from({ length: RUNS }, async () => {
    try { return await play(test); }
    catch (error) { return { wrong: `threw: ${error instanceof Error ? error.message : error}`, turns: 0, cards: 0, complete: 0 }; }
  }));
  const passed = runs.filter((run) => !run.wrong).length;
  if (passed < RUNS) failures += 1;
  const sum = (pick: (run: typeof runs[number]) => number) => runs.reduce((total, run) => total + pick(run), 0);
  console.log(`${passed === RUNS ? 'ok  ' : 'FAIL'} ${passed}/${RUNS}  ${test.name}`);
  console.log(`       turns ${(sum((r) => r.turns) / RUNS).toFixed(1)}   cards ${sum((r) => r.cards)}   with a full question set ${sum((r) => r.complete)}/${sum((r) => r.cards)}`);
  for (const run of runs) if (run.wrong) console.log(`       x ${run.wrong}`);
}
console.log(`\n${chosen.length - failures}/${chosen.length} conversations clean.`);
Deno.exit(failures ? 1 : 0);
