// A conservative writing-system check, not a language detector. Shared
// technical abbreviations do not establish the language of an option.
function dominantScript(text: string): string | null {
  const content = text.replace(/(?<![A-Za-z])[A-Z]{2,5}(?![A-Za-z])/g, '');
  const groups: Array<[string, RegExp]> = [
    ['cjk', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu],
    ['hangul', /\p{Script=Hangul}/gu], ['arabic', /\p{Script=Arabic}/gu],
    ['cyrillic', /\p{Script=Cyrillic}/gu], ['greek', /\p{Script=Greek}/gu],
    ['devanagari', /\p{Script=Devanagari}/gu], ['latin', /\p{Script=Latin}/gu],
  ];
  const counts = groups.map(([name, pattern]) => ({ name, count: (content.match(pattern) || []).length })).sort((a, b) => b.count - a.count);
  return counts[0].count ? counts[0].name : null;
}

/** Validate newly generated MCQ pools before they reach the database. */
export function validMcqPool(options: unknown, answer: unknown): boolean {
  if (!Array.isArray(options) || options.length < 5 || options.length > 6 || typeof answer !== 'string' || !answer.trim()) return false;
  if (options.some(option => typeof option !== 'string' || !option.trim() || option.trim().length > 100)) return false;
  const normalized = options.map(option => option.trim());
  if (new Set(normalized.map(option => option.toLocaleLowerCase())).size !== normalized.length) return false;
  const scripts = new Set([answer, ...normalized].map(dominantScript).filter((script): script is string => script !== null));
  if (scripts.size > 1) return false;
  return normalized.includes(answer.trim());
}

/** The current interface uses English true/false labels. */
export function validTrueFalse(options: unknown, answer: unknown, question: unknown): boolean {
  if (!Array.isArray(options) || options.length !== 2 || options[0] !== 'True' || options[1] !== 'False' ||
      (answer !== 'True' && answer !== 'False') || typeof question !== 'string') return false;
  const script = dominantScript(question);
  return !script || script === 'latin';
}
