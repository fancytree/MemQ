import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { colors, fonts } from '@/theme';
import { deckSummaries, type DeckSummary } from '@/data/decks';

const SUMMARY_STATS: { v: string; l: string }[] = [
  { v: '5',   l: 'decks' },
  { v: '396', l: 'cards' },
  { v: '26',  l: 'due' },
];

export default function LibraryScreen() {
  return (
    <EdBase>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={styles.title}>Library</Text>
        <Text style={styles.linkAccent}>Filter</Text>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchInput}>
          <Text style={styles.searchPlaceholder}>Search decks</Text>
        </View>
      </View>

      {/* Stats summary */}
      <View style={styles.statsRow}>
        {SUMMARY_STATS.map((s, i) => (
          <View
            key={s.l}
            style={[styles.statCell, i < SUMMARY_STATS.length - 1 && styles.statCellBorder]}
          >
            <Text style={styles.statVal}>{s.v}</Text>
            <SectionLabel size={9.5} style={{ marginTop: 5 }}>{s.l}</SectionLabel>
          </View>
        ))}
      </View>

      {/* Deck rows */}
      <View style={styles.section}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
          <SectionLabel>All Decks</SectionLabel>
        </View>
        <View style={{ gap: 8 }}>
          {deckSummaries.map((d) => (
            <DeckRow key={d.id} deck={d} />
          ))}
        </View>
      </View>
    </EdBase>
  );
}

function DeckRow({ deck: d }: { deck: DeckSummary }) {
  return (
    <Pressable onPress={() => router.push(`/deck/${d.id}`)} style={styles.deckCard}>
      <View style={styles.deckTitleRow}>
        <Text style={styles.deckTitle}>{d.title}</Text>
        <Text style={[styles.dueLabel, { color: d.due > 0 ? colors.accent : colors.muted }]}>
          {d.due > 0 ? `${d.due} due` : 'caught up'}
        </Text>
      </View>
      <Text style={styles.deckSub}>{d.sub}</Text>
      <View style={styles.progressRow}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${d.pct}%` }]} />
        </View>
        <Text style={styles.cardsLabel}>{d.cards} cards</Text>
        <Text style={styles.pctLabel}>{d.pct}%</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topbar: {
    paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: {
    fontFamily: fonts.grotesk,
    fontSize: 19, fontWeight: '800', letterSpacing: -0.5, color: colors.text,
  },
  linkAccent: { fontSize: 12, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

  searchWrap: {
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  searchInput: {
    paddingHorizontal: 12, paddingVertical: 9,
    borderWidth: 1, borderColor: colors.border, borderRadius: 8,
    backgroundColor: colors.bg,
  },
  searchPlaceholder: { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },

  statsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surf,
  },
  statCell:       { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  statVal: {
    fontFamily: fonts.grotesk,
    fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.text, lineHeight: 22,
  },

  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },

  deckCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  deckTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  deckTitle: {
    flex: 1,
    fontFamily: fonts.grotesk,
    fontSize: 14, fontWeight: '700', letterSpacing: -0.2, color: colors.text,
  },
  dueLabel: { fontSize: 11, fontWeight: '600', fontFamily: fonts.grotesk },
  deckSub:  { fontSize: 11.5, color: colors.muted, marginTop: 3, fontFamily: fonts.grotesk },

  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  progressTrack: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.dim, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: colors.accent },
  cardsLabel:    { fontSize: 10.5, color: colors.muted, width: 60, textAlign: 'right', fontFamily: fonts.grotesk },
  pctLabel:      { fontSize: 10.5, color: colors.text, fontWeight: '700', width: 30, textAlign: 'right', fontFamily: fonts.grotesk },
});
