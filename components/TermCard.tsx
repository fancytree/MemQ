import { Card } from '@/components/ui/Card';
import { space } from '@/theme';
import { PlayButton } from '@/components/LanguageCardFields';
import { hasLanguageData, languageDataFromLegacyExplanation, normalizeLanguageData } from '@/lib/languageCard';
import { colors, componentTokens, radius, type } from '@/theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { chartColors } from '@/theme/colors';
import { fonts } from '@/theme/typography';

type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';
interface Term { id: string; term: string; definition: string; explanation: string | null; language_data?: unknown }
interface TermCardProps { term: Term; status: LearningStage; isLanguage?: boolean; onOpen: () => void }

/** The list is a read/open surface. Editing and deletion live exclusively in the expanded card. */
export default function TermCard({ term, status, isLanguage = false, onOpen }: TermCardProps) {
  const legacy = languageDataFromLegacyExplanation(term.explanation);
  const showNote = !!term.explanation?.trim() && (!isLanguage || !hasLanguageData(legacy));
  return (
    <Card faceStyle={styles.card}>
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
      <StageTag stage={status} />
    </Pressable>
    {isLanguage && <View style={styles.play}>
      <PlayButton iconOnly text={term.term} languageCode={normalizeLanguageData(term.language_data).language_code} label={`Play ${term.term}`} />
    </View>}
    </Card>
  );
}
const STAGE_ORDER: LearningStage[] = ['New', 'Learning', 'Familiar', 'Good', 'Strong', 'Mastered'];

/** Which stage a card is at, told by colour: the tag deepens a step for each stage,
 * white for a card not yet started to solid purple for one mastered, so a list can
 * be scanned for the weak ones without reading a word. */
function StageTag({ stage }: { stage: LearningStage }) {
  const at = Math.max(0, STAGE_ORDER.indexOf(stage));
  return (
    <View style={[styles.badge, { backgroundColor: STAGE_TINTS[at] }, stage === 'New' && styles.badgeNew]}>
      <Text style={[styles.level, at >= 4 && styles.levelDone]}>{stage}</Text>
    </View>
  );
}

/** The tag's ground, a step deeper for each stage: white for a card not yet
 * started, up through the lilacs, to the deep purple of Mastered. */
const STAGE_TINTS = [colors.surf, colors.tint, chartColors.faint, colors.chartSoft, colors.action, colors.sub];

const styles = StyleSheet.create({
  card: { gap: space[1] },
  body: { gap: space[1] },
  play: { position: 'absolute', top: 16, right: 16 },
  languageEntry: { paddingRight: 52 },
  pressed: { backgroundColor: colors.panel },
  entry: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: space[2] },
  meaning: { flex: 1, gap: space[1] },
  term: { ...type.body, fontFamily: fonts.semibold, color: colors.text },
  definition: { ...type.small, color: colors.text },
  note: { ...type.small, color: colors.sub },
  badge: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space[2], paddingVertical: space[1] },
  level: { ...type.caption, fontFamily: fonts.semibold, color: colors.sub },
  levelDone: { color: colors.surf },
  badgeNew: { borderWidth: 1, borderColor: colors.line },
});
