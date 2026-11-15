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
  const scripts = new Set([answer, ...options].map(dominantScript).filter((script): script is string => script !== null));
  return scripts.size <= 1;
}

/** Keep a single writing system when the answer itself has no identifiable script. */
export function coherentAnswerCandidates(answer: string, candidates: string[]): string[] {
  const compatible = candidates.filter((value) => compatibleAnswerScripts(answer, [value]));
  if (dominantScript(answer)) return compatible;
  const counts = new Map<string, number>();
  for (const value of compatible) {
    const script = dominantScript(value);
    if (script) counts.set(script, (counts.get(script) || 0) + 1);
  }
  const chosen = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
  return chosen ? compatible.filter((value) => !dominantScript(value) || dominantScript(value) === chosen) : compatible;
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
  // When the answer is a shared acronym or number, choose one script for the
  // distractors instead of accepting an arbitrary mixture of languages.
  const coherent = coherentAnswerCandidates(answer, alternatives);
  if (coherent.length < 3) return null;
  const shuffle = (items: string[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.min(i, Math.floor(Math.max(0, random()) * (i + 1)));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const opts = shuffle([answer, ...shuffle(coherent).slice(0, 3)]);
  return { opts, correctIndex: opts.indexOf(answer) };
}
