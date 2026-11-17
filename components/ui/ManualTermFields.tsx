import { LanguageCardEditor } from '@/components/LanguageCardFields';
import type { LanguageCardData } from '@/lib/languageCard';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { space } from '@/theme';
import { StyleSheet, View } from 'react-native';

type Props = {
  term: string; definition: string; explanation: string; languageData: LanguageCardData;
  isLanguage: boolean; isGenerating: boolean; onGenerate: () => void;
  onTermChange: (value: string) => void; onDefinitionChange: (value: string) => void;
  onExplanationChange: (value: string) => void; onLanguageChange: (value: LanguageCardData) => void;
};

export function ManualTermFields({ term, definition, explanation, languageData, isLanguage, isGenerating, onGenerate, onTermChange, onDefinitionChange, onExplanationChange, onLanguageChange }: Props) {
  return <View style={styles.fields}>
    <Field label="Term" placeholder="e.g. Renaissance" value={term} onChangeText={onTermChange}
      labelAction={term.trim().length > 0 && (
        <Button variant="ghost" size="sm" label={isGenerating ? 'Generating...' : 'Generate'}
          disabled={isGenerating} onPress={onGenerate} />
      )} />
    <Field label="Definition" multiline placeholder="e.g. Period of cultural revival in Europe"
      value={definition} onChangeText={onDefinitionChange} />
    <Field label={isLanguage ? 'Usage note (optional)' : 'Explanation (optional)'} multiline
      placeholder="Add context, examples, or usage notes" value={explanation} onChangeText={onExplanationChange} />
    {isLanguage && <LanguageCardEditor value={languageData} term={term} onChange={onLanguageChange} />}
  </View>;
}
const styles = StyleSheet.create({
  fields: { gap: space[5] },
});
