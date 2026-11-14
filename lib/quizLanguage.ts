/** Script is only a conservative compatibility check, not a language detector. */
export function dominantScript(text: string): string | null {
  // Technical acronyms can legitimately appear in answers in any language.
  text = text.replace(/(?<![A-Za-z])[A-Z]{2,5}(?![A-Za-z])/g, '');
  const groups: Array<[string, RegExp]> = [
    ['cjk', /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu],
    ['hangul', /\p{Script=Hangul}/gu], ['arabic', /\p{Script=Arabic}/gu],
    ['cyrillic', /\p{Script=Cyrillic}/gu], ['greek', /\p{Script=Greek}/gu],
    ['devanagari', /\p{Script=Devanagari}/gu], ['latin', /\p{Script=Latin}/gu],
  ];
  const counts = groups.map(([name, pattern]) => ({ name, count: (text.match(pattern) || []).length })).sort((a, b) => b.count - a.count);
  return counts[0].count ? counts[0].name : null;
}

export function compatibleAnswerScripts(answer: string, options: string[]): boolean {
  const script = dominantScript(answer);
  return !script || options.every((option) => {
    const candidate = dominantScript(option);
    return !candidate || candidate === script;
  });
}

export function fallbackOptions(correct: string, lessonId: string, selfId: string, terms: Array<{id: string; lesson_id: string; definition: string | null}>, random = Math.random): {opts: string[]; correctIndex: number} | null {
  const answer = correct.trim();
  if (!answer) return null;
  const used = new Set([answer.toLocaleLowerCase()]);
  const alternatives: string[] = [];
  for (const term of terms) {
    const value = term.definition?.trim() || '';
    if (term.id === selfId || term.lesson_id !== lessonId || !value || used.has(value.toLocaleLowerCase()) || !compatibleAnswerScripts(answer, [value])) continue;
    used.add(value.toLocaleLowerCase());
    alternatives.push(value);
  }
  if (alternatives.length < 3) return null;
  const shuffle = (items: string[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const opts = shuffle([answer, ...shuffle(alternatives).slice(0, 3)]);
  return { opts, correctIndex: opts.indexOf(answer) };
}
