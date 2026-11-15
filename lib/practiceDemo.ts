/**
 * A round's worth of cards that needs no account and no network.
 *
 * Development builds only: `/quiz?entry=demo` practises these instead of the signed-in
 * person's lessons, so every kind of question can be looked at and tried without
 * first arranging real cards at the right stages. Nothing answered here is saved —
 * there is no one to save it for.
 */

import type { PlanProgress } from '@/lib/studyPlan';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const word = (id: string, term: string, definition: string, language_data: Record<string, unknown>) =>
  ({ id, lesson_id: 'demo-language', term, definition, explanation: null as string | null, language_data: { language_code: 'en-US', ...language_data } });
const fact = (id: string, term: string, definition: string, explanation: string) =>
  ({ id, lesson_id: 'demo-knowledge', term, definition, explanation, language_data: null });

/** Seen before and due again, at the given stage. */
const due = (term_id: string, step_index: number): PlanProgress & { term_id: string } =>
  ({ term_id, step_index, status: null, next_review_at: ago(0.5), last_reviewed_at: ago(4), created_at: ago(9) });

export function practiceDemo() {
  return {
    lessons: [
      { id: 'demo-language', name: 'Everyday English', learning_mode: 'language' as const, deadline: new Date(Date.now() + 10 * DAY).toISOString() },
      { id: 'demo-knowledge', name: 'How the brain learns', learning_mode: 'knowledge' as const, deadline: null },
    ],
    terms: [
      word('w1', 'reluctant', 'unwilling to do something', { part_of_speech: 'adjective', synonyms: ['hesitant', 'unwilling'], antonyms: ['eager'], example: 'She was reluctant to leave the party early.' }),
      word('w2', 'necessary', 'needed in order to do something', { part_of_speech: 'adjective', synonyms: ['essential'], antonyms: ['optional'], example: 'It is necessary to book a table in advance.' }),
      word('w3', 'give up', 'to stop trying to do something', { kind: 'phrase', part_of_speech: 'phrasal verb', example: 'Do not give up before you have really tried.' }),
      word('w4', 'used to + verb', 'a past habit that is no longer true', { kind: 'grammar', example: 'I used to walk to school every day.' }),
      word('w5', 'accommodate', 'to provide a place to stay; to have room for something', { part_of_speech: 'verb', example: 'The hotel can accommodate two hundred guests.' }),
      word('w6', 'café', 'a small restaurant; a coffee shop', { part_of_speech: 'noun', example: 'We met at a café near the station.' }),
      // Never met, so not part of the first round: they fill out the matching board.
      word('w7', 'borrow', 'to take something and return it later', { part_of_speech: 'verb' }),
      word('w8', 'crowded', 'full of people', { part_of_speech: 'adjective' }),
      word('w9', 'look after', 'to take care of someone or something', { kind: 'phrase' }),
      word('w10', 'journey', 'a long trip', { part_of_speech: 'noun' }),
      fact('k1', 'Spacing effect', 'Spaced study is remembered longer than cramming', 'Each return to a memory that has begun to fade strengthens it more than re-reading it while it is fresh.'),
      fact('k2', 'Retrieval practice', 'Recalling a memory strengthens it more than rereading', 'This is why a question teaches more than a highlight.'),
      fact('k3', 'Forgetting curve', 'Memory falls steeply at first, then levels off', 'Described by Hermann Ebbinghaus in 1885.'),
      fact('k4', 'Interleaving', 'Mixing different topics within one study session makes each of them easier to tell apart from the others later on', 'It feels harder than studying one topic at a time, and works better.'),
    ],
    // Two brand-new words, the rest spread across the stages so each kind of step turns up.
    // Interleaving's meaning is deliberately too long to be an option or a matching tile.
    progress: [due('w3', 1), due('w4', 2), due('w5', 3), due('w6', 4), due('k1', 1), due('k2', 1), due('k3', 2), due('k4', 4)],
  };
}
