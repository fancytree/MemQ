/**
 * What today is for.
 *
 * The schedule (lib/scheduler) says when one card comes back. This says, across a
 * person's lessons, what there is to do today and in what order: the reviews whose
 * time has come, and how many cards never seen before today has room for.
 *
 * New cards are rationed. With a deadline the ration is what is left divided by the
 * days there are to learn it in — leaving the last stretch before the day for the
 * reviews that turn a seen card into a known one, since a card first met the night
 * before cannot be spaced at all. Without a deadline it is a steady number a day,
 * so a lesson of two hundred cards does not arrive as two hundred things due.
 */

export type PlanProgress = {
  step_index?: number | null;
  status?: string | null;
  next_review_at?: string | null;
  last_reviewed_at?: string | null;
  created_at?: string | null;
};

export type PlanCard = { id: string; lessonId: string; progress?: PlanProgress | null };
export type PlanLesson = { id: string; deadline?: string | null };

export type LessonPlan = {
  /** Reviews whose time has come, relearning included. */
  dueReviews: number;
  /** Never-seen cards today still has room for. */
  newToday: number;
  /** Never-seen cards in the lesson altogether. */
  newLeft: number;
  /** Whole days until the deadline, when there is one ahead. */
  daysLeft: number | null;
};

export type TodayPlan = {
  byLesson: Map<string, LessonPlan>;
  /** Today's work, most pressing first: due reviews, then today's new cards. */
  queue: string[];
  /** New cards beyond today's ration, for someone who wants to keep going. */
  extraNew: string[];
  /** Cards not yet due, the one practised longest ago first: practice, which does not
   *  move them. Ordering by when they were last seen keeps a second and a third round
   *  of extra practice from being the same eight cards. */
  early: string[];
};

/** New cards a day for a lesson with no deadline. */
export const DEFAULT_NEW_PER_DAY = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

const time = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const at = new Date(value).getTime();
  return Number.isNaN(at) ? null : at;
};

/** Never answered: no row, or a row nothing has been recorded on. */
export const isNewCard = (progress: PlanProgress | null | undefined): boolean =>
  !progress || time(progress.last_reviewed_at) === null;

export const isDueCard = (progress: PlanProgress | null | undefined, now: Date): boolean => {
  if (isNewCard(progress)) return false;
  const next = time(progress!.next_review_at);
  return next === null || next <= now.getTime();
};

/**
 * How many new cards a day a deadline calls for.
 *
 * A quarter of the time left (a day at least, a week at most) is kept back for
 * reviewing; what remains is the days there are to meet new cards in. Cards already
 * met today count toward today's share, so the number does not climb as they are done.
 */
export function newCardsPerDay(newLeft: number, metToday: number, daysLeft: number | null): number {
  if (daysLeft === null) return DEFAULT_NEW_PER_DAY;
  const reserve = daysLeft >= 3 ? Math.min(7, Math.max(1, Math.round(daysLeft * 0.25))) : 0;
  const learningDays = Math.max(1, Math.ceil(daysLeft - reserve));
  return Math.ceil((newLeft + metToday) / learningDays);
}

/**
 * What a deadline asks for: the days left, and the new cards a day that fills.
 *
 * It is the same rationing the plan itself uses (newCardsPerDay), so the number a
 * person is shown while choosing a date is the number they will be given. Days are
 * counted in whole calendar days from today, so a deadline of today is 0 and one of
 * tomorrow is 1 — the same way a person counts them.
 */
export function deadlinePace(deadline: Date, cards: number, now: Date = new Date()): {
  days: number;
  /** Null when there is nothing to pace yet — a lesson with no cards in it. */
  perDay: number | null;
} {
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const to = new Date(deadline); to.setHours(0, 0, 0, 0);
  const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
  return { days, perDay: cards > 0 ? newCardsPerDay(cards, 0, days) : null };
}

/** A deadline as the time left before it, which is what a person reading a list of
 * lessons wants to know — not the date, which they would have to subtract today
 * from. Null when the lesson has no deadline, or one that does not parse.
 *
 * It lives here rather than on a screen because two lists show it: the library's
 * cards and Today's Continue Learning. The library had it to itself, and only
 * under its Deadline filter, so a lesson with a date on it looked exactly like one
 * without until you went looking.
 */
export function deadlineLeft(deadline: string | Date | null | undefined, now: Date = new Date()): {
  text: string;
  /** The date has gone by, so a screen can set it a step further back. */
  past: boolean;
} | null {
  if (!deadline) return null;
  const at = new Date(deadline);
  if (Number.isNaN(at.getTime())) return null;
  at.setHours(0, 0, 0, 0);
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  const days = Math.round((at.getTime() - from.getTime()) / 86400000);
  if (days < 0) return { text: `Ended ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, past: true };
  if (days === 0) return { text: 'Due today', past: false };
  if (days === 1) return { text: 'Due tomorrow', past: false };
  return { text: `${days} days left`, past: false };
}

export function planToday(lessons: PlanLesson[], cards: PlanCard[], now: Date = new Date()): TodayPlan {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime();

  const daysLeftByLesson = new Map<string, number | null>();
  for (const lesson of lessons) {
    const deadline = time(lesson.deadline);
    daysLeftByLesson.set(lesson.id, deadline !== null && deadline > now.getTime() ? (deadline - now.getTime()) / DAY_MS : null);
  }

  type Entry = { id: string; lessonId: string; next: number; last: number; step: number };
  const due: Entry[] = [];
  const early: Entry[] = [];
  const fresh = new Map<string, string[]>();
  const metToday = new Map<string, number>();

  for (const card of cards) {
    if (!daysLeftByLesson.has(card.lessonId)) continue;
    const progress = card.progress;
    if (isNewCard(progress)) {
      const list = fresh.get(card.lessonId) ?? [];
      list.push(card.id);
      fresh.set(card.lessonId, list);
      continue;
    }
    const made = time(progress!.created_at);
    if (made !== null && made >= dayStart) metToday.set(card.lessonId, (metToday.get(card.lessonId) ?? 0) + 1);
    const entry: Entry = {
      id: card.id, lessonId: card.lessonId,
      next: time(progress!.next_review_at) ?? 0,
      last: time(progress!.last_reviewed_at) ?? 0,
      step: typeof progress!.step_index === 'number' ? progress!.step_index : 0,
    };
    (isDueCard(progress, now) ? due : early).push(entry);
  }

  // Nearest deadline first, then the weakest card, then the one that has waited longest.
  const pressure = (lessonId: string) => daysLeftByLesson.get(lessonId) ?? Number.POSITIVE_INFINITY;
  due.sort((a, b) => pressure(a.lessonId) - pressure(b.lessonId) || a.step - b.step || a.next - b.next);
  early.sort((a, b) => a.last - b.last || a.next - b.next);

  const byLesson = new Map<string, LessonPlan>();
  const todayNew: string[] = [];
  const extraNew: string[] = [];
  const ordered = [...lessons].sort((a, b) => pressure(a.id) - pressure(b.id));
  for (const lesson of ordered) {
    const ids = fresh.get(lesson.id) ?? [];
    const daysLeft = daysLeftByLesson.get(lesson.id) ?? null;
    const met = metToday.get(lesson.id) ?? 0;
    const room = Math.min(ids.length, Math.max(0, newCardsPerDay(ids.length, met, daysLeft) - met));
    todayNew.push(...ids.slice(0, room));
    extraNew.push(...ids.slice(room));
    byLesson.set(lesson.id, {
      dueReviews: due.filter((entry) => entry.lessonId === lesson.id).length,
      newToday: room,
      newLeft: ids.length,
      daysLeft: daysLeft === null ? null : Math.ceil(daysLeft),
    });
  }

  return {
    byLesson,
    queue: [...due.map((entry) => entry.id), ...todayNew],
    extraNew,
    early: early.map((entry) => entry.id),
  };
}

/** Questions a card is expected to take in a round, by how far along it is. */
export const expectedSteps = (stepIndex: number | null | undefined): number =>
  !stepIndex || stepIndex <= 0 ? 3 : stepIndex <= 2 ? 2 : 1;

/** Take cards from the front of an ordered list until the round is full. */
export function takeForRound<T extends { id: string }>(
  ordered: T[], stepOf: (item: T) => number | null | undefined, maxSteps = 12, maxCards = 8,
): T[] {
  const picked: T[] = [];
  let steps = 0;
  for (const item of ordered) {
    if (picked.length >= maxCards) break;
    const cost = expectedSteps(stepOf(item));
    if (picked.length > 0 && steps + cost > maxSteps) continue;
    picked.push(item);
    steps += cost;
    if (steps >= maxSteps) break;
  }
  return picked;
}
