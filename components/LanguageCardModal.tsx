import { Icon } from '@/components/ui/Icon';
import { layout } from '@/theme/spacing';
import { RoundAction } from '@/components/ui/RoundButtons';
import { Sheet } from '@/components/ui/Sheet';
import { DialogHost } from '@/lib/dialog';
import { fonts } from '@/theme/typography';
import { LanguageCardDetails, PlayButton } from '@/components/LanguageCardFields';
import { hasLanguageData, languageDataFromLegacyExplanation, normalizeLanguageData } from '@/lib/languageCard';
import { space, radius, colors, type } from '@/theme';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface LanguageTerm {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
  language_data?: unknown;
}

export function LanguageCardModal({ term, onClose, isLanguage = true, onEdit, onDelete }: {
  term: LanguageTerm | null;
  onClose: () => void;
  isLanguage?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  // It used to fade a backdrop in and spring the card up and out at the same time,
  // which is how a card opens — and no other sheet in the app arrived that way. A
  // sheet that comes in differently from the five beside it reads as a different
  // kind of thing, so this one slides like the rest and the hand-run animation is
  // gone. What is left is the one bit of sequencing it needed: what happens after
  // it has closed.
  const close = (afterClose?: () => void) => { onClose(); afterClose?.(); };

  const legacyData = languageDataFromLegacyExplanation(term?.explanation);
  const data = term?.language_data ? normalizeLanguageData(term.language_data) : legacyData;
  const showExplanation = !!term?.explanation?.trim() && (!isLanguage || !hasLanguageData(legacyData));

  return (
    <Sheet visible={!!term} onClose={() => close()} closeLabel="Close card"
      eyebrow={isLanguage ? 'LANGUAGE CARD' : 'CARD DETAILS'}
      action={onDelete ? <RoundAction icon="delete" onPress={onDelete} label="Delete card" size={20} color={colors.red} /> : undefined}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.term}>{term?.term}</Text>
        {isLanguage && !!term && <View style={styles.pronunciationRow}>
          {!!data.pronunciation && <Text style={styles.pronunciation}>{data.pronunciation}</Text>}
          <PlayButton iconOnly iconSize={24} text={term.term} languageCode={data.language_code} label={`Play ${term.term}`} />
        </View>}
        <View style={styles.definitionBox}>
          <Text style={styles.sectionLabel}>Definition</Text>
          <Text style={styles.definition}>{term?.definition}</Text>
        </View>
        {showExplanation && (
          <View style={styles.noteBox}>
            <Text style={styles.sectionLabel}>Usage note</Text>
            <Text style={styles.note}>{term?.explanation}</Text>
          </View>
        )}
        {isLanguage && !!term && <LanguageCardDetails data={{ ...data, pronunciation: '' }} term={term.term} showTermPlay={false} />}
        {!isLanguage && !!onEdit && <View style={styles.actions}>
          {!isLanguage && !!onEdit && <Pressable accessibilityRole="button" accessibilityLabel="Edit card" onPress={() => close(onEdit)} style={styles.action}>
            <Icon name="edit" size={18} color={colors.text} /><Text style={styles.actionLabel}>Edit</Text>
          </Pressable>}
        </View>}
      </ScrollView>
      {/* A dialog raised from in here has to come up from inside this sheet. */}
      <DialogHost />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space[3], borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space[4], marginTop: space[6] },
  action: { flex: 1, minHeight: 44, flexDirection: 'row', gap: space[2], alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.panel },
  actionLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.text },
  // The sheet pads its head; the body keeps the same margin so the term lines up
  // under the eyebrow that named it.
  scrollContent: { paddingHorizontal: layout.screenInline, paddingBottom: space[5] },
  term: { ...type.title, fontFamily: fonts.bold, color: colors.text, marginTop: space[3] },
  pronunciationRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space[3], marginTop: space.hair },
  pronunciation: { ...type.body, color: colors.sub, flexShrink: 1 },
  definitionBox: { backgroundColor: colors.tint, borderRadius: radius.md, padding: space[4], marginTop: space[5] },
  sectionLabel: { ...type.small, fontFamily: fonts.semibold, color: colors.text, marginBottom: space[2] },
  definition: { ...type.body, color: colors.text },
  noteBox: { marginTop: space[4], paddingLeft: space[3], borderLeftWidth: 2, borderLeftColor: colors.line },
  note: { ...type.body, color: colors.text },
});
