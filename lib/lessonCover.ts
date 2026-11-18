import AsyncStorage from '@react-native-async-storage/async-storage';
import { lessonCoverPalettes } from '@/theme/colors';

/**
 * What a lesson can be about, as a symbol.
 *
 * The first six are also the pool a lesson is given one from when nobody has
 * chosen; the rest are offered in the picker only. Adding a name to the pool
 * would change the hash's answer for every lesson that has never been given a
 * cover, which is a shelf of covers quietly repainting itself on update.
 *
 * The spelling here is what gets written into `lessons.cover_style`, so a name
 * can be added but not renamed. components/LessonCover turns it into an icon.
 */
export const knowledgeSymbols = [
  'book-open', 'layers', 'code', 'briefcase', 'star', 'zap',
  'music', 'flask', 'palette', 'heart', 'leaf', 'calculator', 'clock', 'sparkle',
] as const;
/** How many of the above are also handed out automatically. */
export const DEALT_SYMBOLS = 6;
export const languageSymbols = ['globe', 'EN', 'IT', 'ES', 'FR', 'DE', '中文', '日本語'] as const;
/** The same, for colours: the first six of lessonCoverPalettes. */
export const DEALT_PALETTES = 6;
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
  // Over the first few only, so that a colour or a symbol added later cannot
  // change what an untouched lesson has been showing all along.
  return {
    palette: validPalette?.id || lessonCoverPalettes[hash % DEALT_PALETTES].id,
    symbol: (symbols.includes(symbol) ? symbol : mode === 'language' ? 'globe' : knowledgeSymbols[(hash >>> 4) % DEALT_SYMBOLS]) as CoverSymbol,
  };
}
