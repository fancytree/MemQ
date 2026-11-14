import AsyncStorage from '@react-native-async-storage/async-storage';
import { lessonCoverPalettes } from '@/theme/colors';

export const knowledgeSymbols = ['book-open', 'layers', 'code', 'briefcase', 'star', 'zap'] as const;
export const languageSymbols = ['globe', 'EN', 'IT', 'ES', 'FR', 'DE', '中文', '日本語'] as const;
export type CoverSymbol = typeof knowledgeSymbols[number] | typeof languageSymbols[number];
export type CoverPalette = typeof lessonCoverPalettes[number]['id'];
export type CoverChoice = { palette: CoverPalette; symbol: CoverSymbol };
const key = (id: string) => `@memq/lesson-cover/v1/${id}`;
export const getStoredLessonCover = (id: string) => AsyncStorage.getItem(key(id));
export const setStoredLessonCover = (id: string, value: string) => AsyncStorage.setItem(key(id), value);
export const removeStoredLessonCover = (id: string) => AsyncStorage.removeItem(key(id));
export const encodeLessonCover = (choice: CoverChoice) => `v1:${choice.palette}:${choice.symbol}`;
export function resolveLessonCover(id: string, mode: 'knowledge' | 'language' | undefined, value?: string | null): CoverChoice {
  const [, palette, symbol] = value?.split(':') || [];
  const validPalette = lessonCoverPalettes.find((item) => item.id === palette);
  const symbols: readonly string[] = mode === 'language' ? languageSymbols : knowledgeSymbols;
  let hash = 0;
  for (const char of id) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  return {
    palette: validPalette?.id || lessonCoverPalettes[hash % lessonCoverPalettes.length].id,
    symbol: (symbols.includes(symbol) ? symbol : mode === 'language' ? 'globe' : knowledgeSymbols[(hash >>> 4) % knowledgeSymbols.length]) as CoverSymbol,
  };
}
