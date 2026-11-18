/**
 * Which of the person's lessons a typed name could mean.
 *
 * The box that names a new lesson is also how an old one is found
 * (components/LessonNameField): someone who made cards and then thinks "these
 * belong with my Norse gods" types that, sees the lesson, and picks it — instead
 * of making a second lesson and moving cards by hand afterwards.
 *
 * No imports, so it runs in a test with no app around it.
 */

const fold = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

const WIDE = /[^\u0000-ɏ]/;

/**
 * The pieces of what was typed that are worth matching on.
 *
 * A word of three letters or more: two of English ("of", "in") match everything.
 * Chinese and Japanese are not written with spaces, so a run of it is taken two
 * characters at a time — "语法复习" finds a lesson with "语法" in its name.
 */
function pieces(typed: string): string[] {
  const out: string[] = [];
  for (const word of typed.split(/[\s,.;:，。；：、\-–—/]+/)) {
    if (!WIDE.test(word)) { if (word.length >= 3) out.push(word); continue; }
    for (const run of word.match(/[^\u0000-ɏ]+/g) ?? []) {
      const chars = [...run];
      for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
    }
  }
  return out;
}

/**
 * The lessons to offer for what has been typed, nearest first.
 *
 * Nothing typed offers nothing: a box that answers an empty question with the
 * whole library is a library. Otherwise a lesson with exactly that name comes
 * first, then names that start with it, then names that contain it, then names
 * that share a telling word with it — "Tea basics" finds "Japanese tea", which
 * matters because the box usually opens with a name already in it. Ties keep the
 * order given, which is newest first.
 */
export function matchLessons<T extends { name: string }>(lessons: T[], typed: string, max = 6): T[] {
  const wanted = fold(typed);
  if (!wanted) return [];
  const words = pieces(wanted);
  const ranked: { lesson: T; rank: number; at: number }[] = [];
  lessons.forEach((lesson, at) => {
    const name = fold(lesson.name);
    if (!name) return;
    const rank = name === wanted ? 0
      : name.startsWith(wanted) ? 1
      : name.includes(wanted) ? 2
      : words.some((word) => name.includes(word)) ? 3
      : -1;
    if (rank >= 0) ranked.push({ lesson, rank, at });
  });
  return ranked.sort((a, b) => a.rank - b.rank || a.at - b.at).slice(0, max).map((entry) => entry.lesson);
}

/** Cards that are not in the lesson yet, by term. Adding to a lesson that exists
 *  is where the same card arrives twice. */
export function notHeld<T extends { term: string }>(cards: T[], held: Iterable<string>): T[] {
  const have = new Set([...held].map(fold));
  const out: T[] = [];
  for (const card of cards) {
    const key = fold(card.term);
    if (have.has(key)) continue;
    have.add(key);
    out.push(card);
  }
  return out;
}
