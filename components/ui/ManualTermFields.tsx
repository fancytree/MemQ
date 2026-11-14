import { LanguageCardEditor } from '@/components/LanguageCardFields';
import type { LanguageCardData } from '@/lib/languageCard';
import { colors, fonts } from '@/theme';
import { homeColors } from '@/theme/colors';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

type Props = {
  term: string; definition: string; explanation: string; languageData: LanguageCardData;
  isLanguage: boolean; isGenerating: boolean; onGenerate: () => void;
  onTermChange: (value: string) => void; onDefinitionChange: (value: string) => void;
  onExplanationChange: (value: string) => void; onLanguageChange: (value: LanguageCardData) => void;
};

export function ManualTermFields({ term, definition, explanation, languageData, isLanguage, isGenerating, onGenerate, onTermChange, onDefinitionChange, onExplanationChange, onLanguageChange }: Props) {
  return <View style={styles.fields}>
    <View style={styles.group}>
      <View style={styles.labelRow}><Text style={styles.label}>Term</Text>{term.trim().length > 0 && <Pressable accessibilityRole="button" onPress={onGenerate} disabled={isGenerating} hitSlop={8} style={styles.generate}><Text style={styles.generateText}>{isGenerating ? 'Generating...' : 'Generate'}</Text></Pressable>}</View>
      <TextInput accessibilityLabel="Term" style={styles.input} placeholder="e.g. Renaissance" placeholderTextColor={homeColors.placeholder} value={term} onChangeText={onTermChange} />
    </View>
    <View style={styles.group}>
      <Text style={styles.label}>Definition</Text>
      <TextInput accessibilityLabel="Definition" style={[styles.input, styles.multiline]} placeholder="e.g. Period of cultural revival in Europe" placeholderTextColor={homeColors.placeholder} multiline textAlignVertical="top" value={definition} onChangeText={onDefinitionChange} />
    </View>
    <View style={styles.group}>
      <Text style={styles.label}>{isLanguage ? 'Usage note (optional)' : 'Explanation (optional)'}</Text>
      <TextInput accessibilityLabel={isLanguage ? 'Usage note (optional)' : 'Explanation (optional)'} style={[styles.input, styles.multiline]} placeholder="Add context, examples, or usage notes" placeholderTextColor={homeColors.placeholder} multiline textAlignVertical="top" value={explanation} onChangeText={onExplanationChange} />
    </View>
    {isLanguage && <LanguageCardEditor value={languageData} term={term} onChange={onLanguageChange} />}
  </View>;
}
const styles = StyleSheet.create({
  fields: { gap: 20 },
  group: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: homeColors.darkest },
  generate: { minHeight: 28, justifyContent: 'center' },
  generateText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary },
  input: { minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: homeColors.nav, paddingHorizontal: 16, paddingVertical: 14, fontFamily: fonts.regular, fontSize: 16, lineHeight: 23, color: homeColors.darkest },
  multiline: { minHeight: 96 },
});
