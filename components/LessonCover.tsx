import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CoverChoice, getStoredLessonCover, knowledgeSymbols, resolveLessonCover } from '@/lib/lessonCover';
import { homeColors, lessonCoverPalettes } from '@/theme/colors';
import { fonts } from '@/theme';

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
  const icon = (knowledgeSymbols as readonly string[]).includes(selected.symbol) || selected.symbol === 'globe';
  return <LinearGradient accessible={false} colors={palette.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.cover, { width, height, borderRadius: Math.min(16, height / 4) }]}>
    <View style={styles.glint} />
    {icon ? <Feather name={selected.symbol as React.ComponentProps<typeof Feather>['name']} size={Math.min(26, height * 0.38)} color={homeColors.deep} /> : <Text adjustsFontSizeToFit numberOfLines={1} style={[styles.language, { fontSize: Math.min(20, height * 0.3) }]}>{selected.symbol}</Text>}
  </LinearGradient>;
}
const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  glint: { position: 'absolute', width: 54, height: 54, borderRadius: 27, backgroundColor: homeColors.focus, right: -25, top: -25 },
  language: { fontFamily: fonts.semibold, color: homeColors.deep, maxWidth: '85%' },
});
