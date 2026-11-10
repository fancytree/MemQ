import { LanguageCardData, normalizeLanguageData } from '@/lib/languageCard';
import { DesignAsset, FittedDesignAsset } from '@/components/DesignAsset';
import { colors, type } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const textFields: Array<{ key: keyof LanguageCardData; label: string; hint: string; multiline?: boolean }> = [
  { key: 'language_code', label: 'Pronunciation language', hint: 'e.g. en-US, es-ES, zh-CN' },
  { key: 'pronunciation', label: 'Pronunciation guide', hint: 'IPA, pinyin, or another reading guide' },
  { key: 'part_of_speech', label: 'Part of speech', hint: 'e.g. noun, verb, phrase' },
  { key: 'forms', label: 'Forms', hint: 'e.g. plural, conjugation, or gender' },
  { key: 'example', label: 'Example sentence', hint: 'A natural sentence using this term', multiline: true },
];

const listFields: Array<{ key: 'synonyms' | 'antonyms' | 'collocations'; label: string; hint: string }> = [
  { key: 'synonyms', label: 'Synonyms', hint: 'Separate with commas' },
  { key: 'antonyms', label: 'Antonyms', hint: 'Separate with commas' },
  { key: 'collocations', label: 'Common combinations', hint: 'Separate with commas' },
];

export function LanguageCardEditor({
  value,
  onChange,
  term,
}: {
  value: LanguageCardData;
  onChange: (value: LanguageCardData) => void;
  term: string;
}) {
  const update = (key: keyof LanguageCardData, text: string) =>
    onChange(normalizeLanguageData({ ...value, [key]: text }));

  return (
    <View style={styles.editor}>
      <Text style={styles.sectionTitle}>Language details</Text>
      <Text style={styles.hint}>Add what is useful for this word, phrase, or grammar pattern.</Text>
      {textFields.map((field) => (
        <View key={field.key} style={styles.inputGroup}>
          <Text style={styles.label}>{field.label}</Text>
          <TextInput
            accessibilityLabel={field.label}
            value={String(value[field.key] || '')}
            onChangeText={(text) => update(field.key, text)}
            placeholder={field.hint}
            placeholderTextColor={colors.muted}
            style={[styles.input, field.multiline && styles.multiline]}
            multiline={field.multiline}
          />
        </View>
      ))}
      {!!term.trim() && (
        <PlayButton text={term} languageCode={value.language_code} label="Play pronunciation" />
      )}
      {listFields.map((field) => (
        <View key={field.key} style={styles.inputGroup}>
          <Text style={styles.label}>{field.label}</Text>
          <LanguageListInput
            value={value[field.key] || []}
            onChange={(text) => update(field.key, text)}
            placeholder={field.hint}
            label={field.label}
          />
        </View>
      ))}
    </View>
  );
}

function LanguageListInput({ value, onChange, placeholder, label }: {
  value: string[];
  onChange: (text: string) => void;
  placeholder: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value.join(', '));
  const [focused, setFocused] = useState(false);
  const joined = value.join(', ');
  useEffect(() => {
    if (!focused) setDraft(joined);
  }, [focused, joined]);
  return (
    <TextInput
      accessibilityLabel={label}
      value={draft}
      onChangeText={(text) => { setDraft(text); onChange(text); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      style={styles.input}
    />
  );
}

export function PlayButton({ text, languageCode, label, iconOnly = false, iconSize = 18 }: {
  text: string;
  languageCode?: string;
  label: string;
  iconOnly?: boolean;
  iconSize?: number;
}) {
  const play = async () => {
    const spoken = text.trim();
    if (!spoken) return;
    try {
      // Load on tap so older development builds without ExpoSpeech can still open the app.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Speech = require('expo-speech') as typeof import('expo-speech');
      await Speech.stop();
      Speech.speak(spoken, {
        ...(languageCode?.trim() ? { language: languageCode.trim() } : {}),
        rate: 0.9,
      });
    } catch {
      Alert.alert('Speech unavailable', 'Install a new iOS development build to enable pronunciation.');
    }
  };

  return (
    <Pressable
      onPress={(event) => { event.stopPropagation(); void play(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={iconOnly ? 0 : 8}
      style={iconOnly ? [styles.playIconButton, iconSize > 18 && styles.playIconButtonLarge] : styles.playButton}
    >
      {iconOnly ? (iconSize === 18 ? <DesignAsset name="termVolume" /> : <FittedDesignAsset name="termVolume" width={iconSize} height={iconSize} />) : <><Feather name="volume-2" size={16} color={colors.accentText} /><Text style={styles.playText}>Listen</Text></>}
    </Pressable>
  );
}

export function LanguageCardDetails({ data, term, showTermPlay = true }: {
  data: LanguageCardData;
  term?: string;
  showTermPlay?: boolean;
}) {
  const rows: Array<[string, string]> = [
    ['Pronunciation', data.pronunciation || ''],
    ['Part of speech', data.part_of_speech || ''],
    ['Forms', data.forms || ''],
    ['Synonyms', data.synonyms?.join(', ') || ''],
    ['Antonyms', data.antonyms?.join(', ') || ''],
    ['Common combinations', data.collocations?.join(', ') || ''],
  ];
  return (
    <View style={styles.details}>
      {showTermPlay && !!term && <PlayButton text={term} languageCode={data.language_code} label={`Play ${term}`} />}
      {rows.filter(([, value]) => !!value).map(([label, value]) => (
        <View key={label} style={styles.detailRow}>
          <Text style={styles.detailLabel}>{label}</Text>
          <Text style={styles.detailText}>{value}</Text>
        </View>
      ))}
      {!!data.example && (
        <View style={styles.exampleBox}>
          <View style={styles.exampleHeading}>
            <Text style={styles.detailLabel}>Example</Text>
            <PlayButton iconOnly iconSize={18} text={data.example} languageCode={data.language_code} label="Play example sentence" />
          </View>
          <Text style={styles.detailText}>{data.example}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  playIconButton: { width: 44, height: 44, borderRadius: 100, backgroundColor: colors.surfaceSubtle, alignItems: 'center', justifyContent: 'center' },
  playIconButtonLarge: { width: 48, height: 48 },
  editor: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  hint: { fontSize: 12, lineHeight: 18, color: colors.muted },
  inputGroup: { gap: 5 },
  label: { fontSize: 12, fontWeight: '600', color: colors.text },
  input: { minHeight: 44, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 14 },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  playButton: { minHeight: 44, minWidth: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingRight: 8 },
  playText: { fontSize: 12, fontWeight: '700', color: colors.accentText },
  details: { gap: 20, marginTop: 20 },
  detailRow: { gap: 8, paddingTop: 16 },
  detailLabel: { ...type.detailLabel, color: colors.text },
  detailText: { ...type.body, color: colors.text },
  exampleBox: { gap: 8, paddingTop: 12 },
  exampleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
});
