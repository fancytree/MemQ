/**
 * Drafted cards: what they look like, and what happens when someone keeps them.
 *
 * The model never writes to anyone's lessons. It drafts, the person ticks what they
 * want, and the save happens here, from the app, with their own session — so row
 * level security is what decides whether it is allowed, exactly as it does for the
 * create screen.
 *
 * The props mirror `show_card_drafts` in
 * `supabase/functions/_shared/chatComponents.ts`; the two are written separately
 * for the reason given in `lib/chatEvents.ts`. They are read defensively here all
 * the same: the server validates, but a screen should not crash because a newer
 * server sent a field this build has never seen.
 */

/** How a word sounds, how it changes, what it goes with. Carried as the database
 *  stores it; this side only passes it through and shows a line or two of it. */
export type LanguageDetails = {
  language_code?: string;
  pronunciation?: string;
  part_of_speech?: string;
  forms?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
  collocations?: string[];
  [extra: string]: unknown;
};

export type DraftCard = {
  /** Local to one draft. Not a database id — nothing has been written yet. */
  id: string;
  term: string;
  definition: string;
  explanation?: string | null;
  /** Language cards only. Added by the chat function after the model has spoken,
   *  so the model is never paid to carry it. */
  language_data?: LanguageDetails | null;
};

export type DraftTarget =
  | { kind: 'existing'; lesson_id: string; lesson_name: string; learning_mode?: 'knowledge' | 'language'; why?: string }
  | { kind: 'new'; name: string; description?: string; learning_mode: 'knowledge' | 'language' };

export type CardDrafts = {
  cards: DraftCard[];
  target: DraftTarget;
  preselected?: string[];
};

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** Read what arrived over the wire, or null if it is not a draft this build can
 *  draw. Null is handled by the shell, which says so rather than showing a gap. */
export function readCardDrafts(raw: unknown): CardDrafts | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;

  const cards: DraftCard[] = [];
  if (!Array.isArray(value.cards)) return null;
  for (const entry of value.cards) {
    if (!entry || typeof entry !== 'object') continue;
    const card = entry as Record<string, unknown>;
    const id = text(card.id);
    const term = text(card.term);
    const definition = text(card.definition);
    if (!id || !term || !definition) continue;
    // A duplicate id would make one tick toggle two cards.
    if (cards.some((existing) => existing.id === id)) continue;
    const details = card.language_data && typeof card.language_data === 'object' && !Array.isArray(card.language_data)
      ? card.language_data as LanguageDetails : null;
    cards.push({ id, term, definition, explanation: text(card.explanation), language_data: details });
  }
  if (!cards.length) return null;

  const rawTarget = value.target as Record<string, unknown> | undefined;
  if (!rawTarget || typeof rawTarget !== 'object') return null;
  let target: DraftTarget;
  if (rawTarget.kind === 'existing') {
    const lessonId = text(rawTarget.lesson_id);
    const lessonName = text(rawTarget.lesson_name);
    if (!lessonId || !lessonName) return null;
    target = {
      kind: 'existing', lesson_id: lessonId, lesson_name: lessonName,
      // Only the two the database knows. Anything else is treated as unknown,
      // which means the details are not written — the safe way to be wrong.
      learning_mode: rawTarget.learning_mode === 'language' ? 'language'
        : rawTarget.learning_mode === 'knowledge' ? 'knowledge' : undefined,
      why: text(rawTarget.why) ?? undefined,
    };
  } else if (rawTarget.kind === 'new') {
    const name = text(rawTarget.name);
    if (!name) return null;
    target = {
      kind: 'new',
      name,
      description: text(rawTarget.description) ?? undefined,
      learning_mode: rawTarget.learning_mode === 'language' ? 'language' : 'knowledge',
    };
  } else {
    return null;
  }

  const known = new Set(cards.map((card) => card.id));
  const preselected = Array.isArray(value.preselected)
    ? value.preselected.filter((id): id is string => typeof id === 'string' && known.has(id))
    : undefined;

  return { cards, target, preselected };
}

/** Which cards start ticked. Everything, unless the draft says otherwise — the
 *  common case is keeping the lot, and a list that starts empty makes the person
 *  do the work twice. */
export function initialSelection(drafts: CardDrafts): string[] {
  return drafts.preselected?.length ? [...drafts.preselected] : drafts.cards.map((card) => card.id);
}

/** The narrow slice of the Supabase client this needs, so the save can be tested
 *  without one. */
export type DraftWriter = {
  from: (table: string) => {
    insert: (rows: unknown) => {
      select: (columns: string) => { single: () => Promise<{ data: { id: string } | null; error: { message?: string } | null }> };
    } | Promise<{ error: { message?: string } | null }>;
  };
};

export type SaveResult = { lessonId: string; saved: number };

/**
 * Keep the ticked cards.
 *
 * A new lesson is two writes and they are not atomic: if the cards fail after the
 * lesson is made, the lesson stays, empty. That is the same shape the create screen
 * has, and the recoverable end of the two — an empty lesson is visible and can be
 * filled or deleted, whereas rolling it back would throw away the name the person
 * just agreed to.
 */
export async function saveDrafts(
  client: DraftWriter,
  userId: string,
  cards: DraftCard[],
  target: DraftTarget,
): Promise<SaveResult> {
  if (!cards.length) throw new Error('Nothing is ticked, so there is nothing to keep.');

  let lessonId: string;
  // Language details belong only on a language lesson — the tool layer refuses them
  // anywhere else. For a lesson that already exists the mode comes from the model,
  // which read it with list_lessons; when it did not say, nothing is written, which
  // loses a detail rather than putting one where it does not belong.
  const languageLesson = target.learning_mode === 'language';

  if (target.kind === 'new') {
    const created = await (client.from('lessons').insert({
      user_id: userId,
      name: target.name,
      description: target.description?.trim() || null,
      learning_mode: target.learning_mode,
    }) as { select: (c: string) => { single: () => Promise<{ data: { id: string } | null; error: { message?: string } | null }> } })
      .select('id').single();
    if (created.error || !created.data) {
      throw new Error(created.error?.message || 'Could not make the lesson.');
    }
    lessonId = created.data.id;
  } else {
    lessonId = target.lesson_id;
  }

  const result = await (client.from('terms').insert(cards.map((card) => ({
    lesson_id: lessonId,
    term: card.term,
    definition: card.definition,
    explanation: card.explanation || null,
    language_data: languageLesson ? card.language_data ?? null : null,
  }))) as Promise<{ error: { message?: string } | null }>);

  if (result?.error) throw new Error(result.error.message || 'Could not save the cards.');
  return { lessonId, saved: cards.length };
}
