import { Icon, type IconName } from '@/components/ui/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CoverChoice, getStoredLessonCover, resolveLessonCover } from '@/lib/lessonCover';
import { colors, lessonCoverPalettes } from '@/theme/colors';
import { fonts } from '@/theme';

/** A cover's symbol, as the icon it is drawn with. A language lesson whose symbol
 *  is a pair of letters ("EN", "中文") has no entry and is drawn as type instead. */
const COVER_GLYPH = {
  'book-open': 'book', layers: 'layers', code: 'code',
  briefcase: 'briefcase', star: 'star', zap: 'zap', globe: 'globe',
  music: 'music', flask: 'flask', palette: 'palette', heart: 'heart',
  leaf: 'leaf', calculator: 'calculator', clock: 'clock', sparkle: 'sparkle',
} as const satisfies Record<string, IconName>;

type Props = { id: string; mode?: 'knowledge' | 'language'; coverStyle?: string | null; width: number; height: number; choice?: CoverChoice };
export function LessonCover({ id, mode, coverStyle, width, height, choice }: Props) {
  const [local, setLocal] = useState<string | null>(null);
  useFocusEffect(useCallback(() => {
    let active = true;
    if (!choice && !coverStyle) void getStoredLessonCover(id).then((value) => { if (active) setLocal(value); }).catch(() => {});
    return () => { active = false; };
  }, [id, coverStyle, choice]));
  const selected = choice || resolveLessonCover(id, mode, coverStyle || local);
  const palette = lessonCoverPalettes.find((item) => item.id === selected.palette) || lessonCoverPalettes[0];
  // The symbol is stored on the lesson (`v1:palette:symbol`), so its spelling is
  // the one that was saved and cannot be renamed; this is where it becomes an icon.
  const glyph = COVER_GLYPH[selected.symbol as keyof typeof COVER_GLYPH];
  return <LinearGradient accessible={false} colors={palette.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cover, { width, height, borderRadius: Math.min(16, height / 4) }]}>
    {glyph ? <Icon name={glyph} size={Math.min(26, height * 0.38)} color={colors.sub} /> : <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.language, { fontSize: Math.min(20, height * 0.3) }]}>{selected.symbol}</Text>}
  </LinearGradient>;
}
const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  language: { fontFamily: fonts.semibold, color: colors.sub, maxWidth: '85%' },
});
