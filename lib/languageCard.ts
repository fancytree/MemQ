/** What a language card teaches. It decides which kinds of practice make sense for it:
 *  a word can be spelled and heard, a grammar pattern is practised by using it. */
export type LanguageKind = 'word' | 'phrase' | 'grammar';
export const LANGUAGE_KINDS: LanguageKind[] = ['word', 'phrase', 'grammar'];

export interface LanguageCardData {
  /** Set by whoever made the card; when absent it is worked out from the card (inferLanguageKind). */
  kind?: LanguageKind;
  language_code?: string;
  pronunciation?: string;
  part_of_speech?: string;
  forms?: string;
  example?: string;
  synonyms?: string[];
  antonyms?: string[];
  collocations?: string[];
}

const stringValue = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map(stringValue).filter(Boolean)
    : typeof value === 'string'
      ? value.split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean)
      : [];

export function normalizeLanguageData(value: unknown): LanguageCardData {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const kind = LANGUAGE_KINDS.find((item) => item === raw.kind);
  return {
    ...(kind ? { kind } : {}),
    language_code: stringValue(raw.language_code),
    pronunciation: stringValue(raw.pronunciation),
    part_of_speech: stringValue(raw.part_of_speech),
    forms: stringValue(raw.forms),
    example: stringValue(raw.example),
    synonyms: stringList(raw.synonyms),
    antonyms: stringList(raw.antonyms),
    collocations: stringList(raw.collocations),
  };
}

export function hasLanguageData(value: LanguageCardData): boolean {
  return Boolean(
    value.kind || value.language_code || value.pronunciation || value.part_of_speech ||
    value.forms || value.example || value.synonyms?.length ||
    value.antonyms?.length || value.collocations?.length
  );
}

export function languageDataFromLegacyExplanation(explanation?: string | null): LanguageCardData {
  if (!explanation) return {};
  const clean = explanation.replace(/\\n/g, '\n');
  const field = (label: string) => {
    const match = clean.match(new RegExp(`^\\s*(?:\\*\\*)?${label}\\s*:\\s*(?:\\*\\*)?\\s*([^\\n]+)$`, 'im'));
    return match?.[1]?.replace(/\*\*/g, '').trim() || '';
  };
  return normalizeLanguageData({
    pronunciation: field('IPA'),
    part_of_speech: field('POS'),
    example: field('Example'),
    synonyms: field('Synonyms'),
    antonyms: field('Antonyms'),
  });
}

/**
 * Word, phrase or grammar pattern. A card that says which is believed; one that does
 * not is read for the signs: a part of speech that names grammar, the placeholders
 * and tildes a pattern is written with, or simply more than one word.
 */
export function inferLanguageKind(term: string, data?: LanguageCardData | null): LanguageKind {
  if (data?.kind) return data.kind;
  const text = term.trim();
  const partOfSpeech = (data?.part_of_speech || '').toLocaleLowerCase();
  if (/grammar|pattern|structure|construction|particle|conjugation|tense|语法|語法|句型|文法|句式/.test(partOfSpeech)) return 'grammar';
  if (/[~〜～…+＋]|\.{3}|\b(?:sb|sth|smb|smth)\b|\b[ABXYNV]\b.*\b[ABXYNV]\b/.test(text)) return 'grammar';
  if (/phrase|idiom|expression|collocation|短语|词组|成语|熟語|慣用/.test(partOfSpeech)) return 'phrase';
  if (/\s/.test(text)) return 'phrase';
  return 'word';
}
