/**
 * The interfaces a chat answer may use, as a closed set.
 *
 * The product gives the model a few finished interfaces and it picks one and fills
 * it in. It never writes an interface. So each one here is a props contract, not
 * generated markup: the rendered result is always inside the design system, bad
 * data fails zod instead of rendering a broken card, and the same contract can be
 * drawn once in React Native and once on the web without sharing a line of
 * rendering code.
 *
 * Mechanically these are tools that run on the client. The model calls one, the
 * edge function executes nothing and forwards the props as a `component` event, and
 * the app renders the matching component. That reuses the tool-calling path that is
 * already there — no second protocol, no parsing of prose.
 *
 * Every component costs prompt prefix on every turn, so the set is deliberately
 * small. Before adding one, ask whether it earns those tokens.
 */

import { z } from 'npm:zod@^4.3.6';

/** A card as it exists before anything is saved. `id` is local to one draft and is
 *  what a selection refers to; it is not a database id, because nothing is in the
 *  database yet. Shaped so it could become a stored row later without a redesign
 *  (see spec §14.1(c)). */
const draftCard = z.object({
  id: z.string().trim().min(1).max(64),
  term: z.string().trim().min(1).max(300),
  definition: z.string().trim().min(1).max(4000),
  explanation: z.string().trim().max(4000).nullable().optional(),
  /** Pronunciation, forms, example and the rest, for a language card.
   *
   * The model never fills this in and is not told about it: `draft_lesson` keeps
   * the details on the server and the chat function puts them back by id before
   * this is validated (see `withDetails`). Describing it to the model would only
   * tempt it into echoing a long object at the chat model's output price. */
  language_data: z.record(z.string(), z.unknown()).nullable().optional(),
}).strict();

/** Where a draft wants to land: an existing lesson, or a new one with its fields
 *  already filled in so the person is editing a suggestion, not an empty box. */
const draftTarget = z.union([
  z.object({
    kind: z.literal('existing'),
    lesson_id: z.uuid(),
    lesson_name: z.string().trim().min(1).max(160),
    /** From list_lessons. The app needs it to know whether language details may be
     *  saved on these cards, and asking the model is cheaper than another query. */
    learning_mode: z.enum(['knowledge', 'language']).optional(),
    why: z.string().trim().max(240).optional().describe('One short line on why this lesson fits.'),
  }).strict(),
  z.object({
    kind: z.literal('new'),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2000).optional(),
    learning_mode: z.enum(['knowledge', 'language']),
  }).strict(),
]);

export const CHAT_COMPONENTS = {
  show_card_drafts: {
    title: 'Show card drafts to choose from',
    description: 'Show drafted cards so the person can tick the ones they want and confirm where they go. Nothing is saved until they confirm. Offer an existing lesson when one fits and a prefilled new lesson only when none does. Use this instead of listing drafted cards as prose.',
    props: z.object({
      cards: z.array(draftCard).min(1).max(50),
      target: draftTarget,
      /** Ticked on arrival. Everything, unless some cards are weaker than others. */
      preselected: z.array(z.string()).max(50).optional(),
    }).strict(),
  },
  show_study_overview: {
    title: 'Show what is due',
    description: 'Show what is due today across lessons, with the estimate and the day’s goal. Use this instead of reciting the numbers as prose.',
    props: z.object({
      due_total: z.number().int().min(0).max(100_000),
      estimated_minutes: z.number().int().min(0).max(10_000),
      lessons: z.array(z.object({
        lesson_id: z.uuid(),
        name: z.string().trim().min(1).max(160),
        due: z.number().int().min(0).max(100_000),
      }).strict()).max(20),
      streak_days: z.number().int().min(0).max(100_000).optional(),
      goal_done: z.number().int().min(0).max(100_000).optional(),
      goal_target: z.number().int().min(0).max(100_000).optional(),
    }).strict(),
  },
  show_struggling_cards: {
    title: 'Show the cards that keep being missed',
    description: 'Show the cards this person keeps getting wrong, worst first. Use this instead of listing them as prose.',
    props: z.object({
      cards: z.array(z.object({
        card_id: z.uuid(),
        term: z.string().trim().min(1).max(300),
        lesson_name: z.string().trim().min(1).max(160).optional(),
        misses: z.number().int().min(0).max(10_000),
      }).strict()).min(1).max(20),
    }).strict(),
  },
  show_card_explainer: {
    title: 'Explain one card',
    description: 'Explain one card: the answer that was expected, why the given answer was not it, and the same idea said a different way. Use this after a missed question instead of a wall of prose.',
    props: z.object({
      term: z.string().trim().min(1).max(300),
      answer: z.string().trim().min(1).max(1000).describe('What was expected.'),
      why_not: z.string().trim().max(600).optional().describe('Why the given answer was not it. Omit when there was no answer to compare.'),
      another_way: z.string().trim().max(600).optional().describe('The same idea said differently.'),
      card_id: z.uuid().optional(),
    }).strict(),
  },
  start_practice: {
    title: 'Offer to start practising',
    description: 'Offer a button that starts a practice round. Use it when the person is ready to practise rather than describing how to get there. Give lesson_id to practise one lesson, or omit it for everything due today.',
    props: z.object({
      lesson_id: z.uuid().optional(),
      label: z.string().trim().min(1).max(40).optional().describe('What the button says, in the person’s language. Defaults to the app’s own wording.'),
    }).strict(),
  },
} as const;

export type ChatComponentName = keyof typeof CHAT_COMPONENTS;

export const CHAT_COMPONENT_NAMES = Object.keys(CHAT_COMPONENTS) as ChatComponentName[];

export function isChatComponent(name: string): name is ChatComponentName {
  return Object.prototype.hasOwnProperty.call(CHAT_COMPONENTS, name);
}

/** Validate what the model sent for a component. Returns the parsed props, or an
 *  error string to hand back to the model so it can correct itself — a component is
 *  never rendered from unchecked data. */
export function parseComponentProps(name: ChatComponentName, props: unknown):
  { ok: true; props: unknown } | { ok: false; error: string } {
  const parsed = CHAT_COMPONENTS[name].props.safeParse(props);
  if (parsed.success) return { ok: true, props: parsed.data };
  const first = parsed.error.issues[0];
  const where = first?.path?.length ? first.path.join('.') + ': ' : '';
  return { ok: false, error: `${name} props are invalid — ${where}${first?.message ?? 'unknown error'}` };
}
