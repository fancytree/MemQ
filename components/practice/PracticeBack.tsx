/**
 * What every practice card shows once it is turned over.
 *
 * Six question types and two kinds of card — a language card and a knowledge one —
 * and the back is one thing in all of them: the answer, what is said about it, and,
 * for a language card, the fields that belong to a word. Only the content changes.
 *
 * The flashcard's back and the explanation behind a question used to compose this
 * themselves, which is how they drifted: the same three blocks, in the same order,
 * but written out twice. Written once, they cannot drift again — and a question
 * type added later gets the layout rather than having to copy it.
 *
 * `answerLabel` is the only thing a question type chooses, because it is the only
 * thing that differs: turning a flashcard over shows a Meaning, answering a
 * question shows the Correct answer. Language and knowledge differ only by whether
 * there is anything in `languageData`.
 */

import { Answer, AnswerNote } from '@/components/practice/Answer';
import { LanguageCardDetails } from '@/components/LanguageCardFields';
import type { LanguageCardData } from '@/lib/languageCard';

export function PracticeBack({ answerLabel, answer, meaning, explain, languageData }: {
  /** `Meaning` when a card was turned over, `Correct answer` when one was answered. */
  answerLabel: string;
  answer: string;
  /** What the card means, when the answer is not already that — the word typed from
   *  hearing it, the spelling, the word chosen from four. The back of a card is the
   *  same card whichever face was asked, so the meaning belongs here too. */
  meaning?: string;
  explain?: string;
  languageData?: LanguageCardData;
}) {
  const note = explain?.trim();
  const sense = meaning?.trim();
  return (
    <>
      <Answer label={answerLabel}>{answer}</Answer>
      {!!sense && <AnswerNote label="Meaning">{sense}</AnswerNote>}
      {!!note && <AnswerNote label="Explanation">{note}</AnswerNote>}
      {languageData && <LanguageCardDetails data={languageData} variant="practice" />}
    </>
  );
}
