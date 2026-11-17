import { LanguageCardData, inferLanguageKind, normalizeLanguageData, type LanguageKind } from '@/lib/languageCard';
import { dialog } from '@/lib/dialog';
import { space, radius, fonts, colors, type } from '@/theme';
import { SpeakingGlyph } from '@/components/SpeakingPulse';
import { Field } from '@/components/ui/Field';
import { useSpeech } from '@/lib/speech';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const textFields: Array<{ key: keyof LanguageCardData; label: string; hint: string; multiline?: boolean }> = [
  { key: 'language_code', label: 'Pronunciation language', hint: 'e.g. en-US, es-ES, zh-CN' },
  { key: 'pronunciation', label: 'Pronunciation guide', hint: 'IPA, pinyin, or another reading guide' },
  { key: 'part_of_speech', label: 'Part of speech', hint: 'e.g. noun, verb, phrase' },
  { key: 'forms', label: 'Forms', hint: 'e.g. plural, conjugation, or gender' },
  { key: 'example', label: 'Example sentence', hint: 'A natural sentence using this term', multiline: true },
];

/** What the card teaches. Practice asks a word to be spelled and heard, a phrase to
 *  be used, a grammar pattern to be applied — so it needs to know which this is. */
const kinds: Array<{ key: LanguageKind; label: string }> = [
  { key: 'word', label: 'Word' },
  { key: 'phrase', label: 'Phrase' },
  { key: 'grammar', label: 'Grammar' },
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
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Card type</Text>
        <View accessibilityRole="radiogroup" style={styles.kindRow}>
          {kinds.map((kind) => {
            // Until someone chooses, the card is read for what it looks like.
            const chosen = (value.kind ?? inferLanguageKind(term, value)) === kind.key;
            return (
              <Pressable key={kind.key} accessibilityRole="radio" accessibilityState={{ checked: chosen }}
                onPress={() => onChange(normalizeLanguageData({ ...value, kind: kind.key }))}
                style={[styles.kind, chosen && styles.kindChosen]}>
                <Text style={[styles.kindText, chosen && styles.kindTextChosen]}>{kind.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      {textFields.map((field) => (
        <Field key={field.key} label={field.label} placeholder={field.hint}
          value={String(value[field.key] || '')}
          onChangeText={(text) => update(field.key, text)}
          multiline={field.multiline} />
      ))}
      {!!term.trim() && (
        <PlayButton text={term} languageCode={value.language_code} label="Play pronunciation" />
      )}
      {listFields.map((field) => (
        <LanguageListInput key={field.key}
          value={value[field.key] || []}
          onChange={(text) => update(field.key, text)}
          placeholder={field.hint}
          label={field.label}
        />
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
    <Field
      label={label}
      value={draft}
      onChangeText={(text) => { setDraft(text); onChange(text); }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
    />
  );
}

export function PlayButton({ text, languageCode, label, iconOnly = false, iconSize = 18, centred = false }: {
  text: string;
  languageCode?: string;
  label: string;
  iconOnly?: boolean;
  iconSize?: number;
  /** Stand it in the middle of what it is under, rather than at the start of a
   *  row. It used to carry the "why can't I hear it" note as well; that note now
   *  points at the volume keys on the edge of the screen, so the button only has
   *  to say where it sits. */
  centred?: boolean;
}) {
  const { speak, speaking, unavailable } = useSpeech();
  useEffect(() => {
    if (unavailable) dialog('Speech unavailable', 'Install a new iOS development build to enable pronunciation.');
  }, [unavailable]);

  const button = (
    <Pressable
      onPress={(event) => { event.stopPropagation(); void speak(text, { languageCode }); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: speaking }}
      hitSlop={iconOnly ? 0 : 8}
      style={iconOnly ? [styles.playIconButton, iconSize > 18 && styles.playIconButtonLarge] : [styles.playButton, centred && styles.playButtonCentred]}
    >
      <SpeakingGlyph size={iconOnly ? iconSize : 16} color={colors.sub} active={speaking} />
      {!iconOnly && <Text style={styles.playText}>Listen</Text>}
    </Pressable>
  );
  return button;
}

export function LanguageCardDetails({ data, term, showTermPlay = true, variant = 'detail' }: {
  data: LanguageCardData;
  term?: string;
  showTermPlay?: boolean;
  /** `detail` is a card being read on its own page; `practice` is the same content
   *  inside a question card, where it shares the room with the question. It was
   *  called `flashcard`, which named one question type rather than the place. */
  variant?: 'detail' | 'practice';
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
    <View style={[styles.details, variant === 'practice' && styles.practiceDetails]}>
      {showTermPlay && !!term && <PlayButton text={term} languageCode={data.language_code} label={`Play ${term}`} />}
      {rows.filter(([, value]) => !!value).map(([label, value]) => (
        <View key={label} style={[styles.detailRow, variant === 'practice' && styles.practiceDetailRow]}>
          <Text style={[styles.detailLabel, variant === 'practice' && styles.practiceDetailLabel]}>{label}</Text>
          <Text style={[styles.detailText, variant === 'practice' && styles.practiceDetailText]}>{value}</Text>
        </View>
      ))}
      {!!data.example && (
        <View style={[styles.exampleBox, variant === 'practice' && styles.practiceExample]}>
          <View style={styles.exampleHeading}>
            <Text style={[styles.detailLabel, variant === 'practice' && styles.practiceDetailLabel]}>Example</Text>
            <PlayButton iconOnly iconSize={18} text={data.example} languageCode={data.language_code} label="Play example sentence" />
          </View>
          <Text style={[styles.detailText, variant === 'practice' && styles.practiceDetailText]}>{data.example}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  playIconButton: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' },
  playIconButtonLarge: { width: 48, height: 48 },
  editor: { marginTop: space[3], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.line, gap: space[2] },
  sectionTitle: { ...type.small, color: colors.text },
  hint: { ...type.caption, color: colors.sub },
  inputGroup: { gap: space[1] },
  label: { ...type.caption, color: colors.text },
  kindRow: { flexDirection: 'row', gap: space[2] },
  kind: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.faint, borderRadius: radius.sm },
  kindChosen: { borderColor: colors.action, backgroundColor: colors.tint },
  kindText: { ...type.small, color: colors.text },
  kindTextChosen: { color: colors.sub },
  playButton: { minHeight: 44, minWidth: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space[1], paddingVertical: space[1], paddingRight: space[2] },
  playButtonCentred: { alignSelf: 'center', paddingHorizontal: space[2] },
  playText: { ...type.caption, color: colors.sub },
  details: { gap: space[5], marginTop: space[5] },
  practiceDetails: { gap: space[3], marginTop: space.hair },
  practiceDetailRow: { paddingTop: space[0], gap: space[1] },
  practiceDetailLabel: { ...type.caption, fontFamily: type.caption.fontFamily, color: colors.faint },
  practiceDetailText: { ...type.small, color: colors.text },
  practiceExample: { padding: space[3], borderRadius: radius.md, backgroundColor: colors.panel, gap: space[1] },
  detailRow: { gap: space[2], paddingTop: space[4] },
  detailLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  detailText: { ...type.body, color: colors.text },
  exampleBox: { gap: space[2], paddingTop: space[3] },
  exampleHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3] },
});
