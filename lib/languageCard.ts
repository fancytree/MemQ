export interface LanguageCardData {
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
  return {
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
    value.language_code || value.pronunciation || value.part_of_speech ||
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
