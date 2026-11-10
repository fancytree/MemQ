import { PlayButton } from '@/components/LanguageCardFields';
import { hasLanguageData, languageDataFromLegacyExplanation, normalizeLanguageData } from '@/lib/languageCard';
import { colors, componentTokens, radius, type } from '@/theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
interface Term { id: string; term: string; definition: string; explanation: string | null; language_data?: unknown }
interface TermCardProps { term: Term; status: LearningStage; isLanguage?: boolean; onOpen: () => void }

/** The list is a read/open surface. Editing and deletion live exclusively in the expanded card. */
export default function TermCard({ term, status, isLanguage = false, onOpen }: TermCardProps) {
  const legacy = languageDataFromLegacyExplanation(term.explanation);
  const showNote = !!term.explanation?.trim() && (!isLanguage || !hasLanguageData(legacy));
  return (
    <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${term.term} details. ${term.definition}. ${status}${showNote ? `. ${term.explanation}` : ''}`}
      accessibilityHint={isLanguage ? "Opens the full card with pronunciation details and a delete action" : "Opens the full card with edit and delete actions"} onPress={onOpen}
      style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
      <View style={[styles.entry, isLanguage && styles.languageEntry]}>
        <View style={styles.meaning}>
          <Text style={styles.term}>{term.term}</Text>
          <Text style={styles.definition}>{term.definition}</Text>
        </View>
      </View>
      {showNote && <Text style={styles.note}>{term.explanation}</Text>}
      <View style={styles.badge}><Text style={styles.level}>{status}</Text></View>
    </Pressable>
    {isLanguage && <View style={styles.play}>
      <PlayButton iconOnly text={term.term} languageCode={normalizeLanguageData(term.language_data).language_code} label={`Play ${term.term}`} />
    </View>}
    </View>
  );
}
const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: componentTokens.lessonDetail.controlRadius, padding: componentTokens.lessonDetail.termPadding, gap: 6, backgroundColor: colors.bg },
  body: { gap: 6 },
  play: { position: 'absolute', top: 16, right: 16 },
  languageEntry: { paddingRight: 52 },
  pressed: { backgroundColor: colors.surfaceSubtle },
  entry: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8 },
  meaning: { flex: 1, gap: 4 },
  term: { ...type.termTitle, color: colors.text },
  definition: { ...type.bodyReading, color: colors.text },
  note: { ...type.bodySmall, color: colors.supporting },
  badge: { alignSelf: 'flex-start', backgroundColor: colors.surfaceSubtle, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  level: { ...type.meta, color: colors.supporting },
});
