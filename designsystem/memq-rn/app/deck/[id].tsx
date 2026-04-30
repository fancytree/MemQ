import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { colors, fonts } from '@/theme';
import { deckDetail, type DeckId, type CardStatus } from '@/data/decks';

const STATUS_COLOR: Record<CardStatus, string> = {
  due:      colors.accent,
  learning: colors.warn,
  mastered: colors.muted,
};
const STATUS_BG: Record<CardStatus, string> = {
  due:      colors.accentL,
  learning: colors.warnL,
  mastered: colors.bg,
};

export default function DeckDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  // Falls back to 'hist' so deep-linking with an unknown id still renders.
  const deckId: DeckId = (id as DeckId) in deckDetail ? (id as DeckId) : 'hist';
  const d = deckDetail[deckId];

  return (
    <EdBase>
      {/* Top nav */}
      <View style={styles.nav}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.navBack}>← Library</Text>
        </Pressable>
        <Text style={styles.navEdit}>Edit</Text>
      </View>

      {/* Title block */}
      <View style={styles.titleBlock}>
        <SectionLabel style={{ marginBottom: 8 }}>Deck</SectionLabel>
        <Text style={styles.title}>{d.title}</Text>
        <Text style={styles.sub}>{d.sub}</Text>

        <View style={styles.masteryLine}>
          <Text style={styles.masteryNum}>{d.pct}%</Text>
          <Text style={styles.masteryUnit}>mastery</Text>
          <Text style={[styles.masteryUnit, { marginLeft: 'auto' }]}>{d.mastered} of {d.cards}</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${d.pct}%` }]} />
        </View>
      </View>

      {/* Stat row */}
      <View style={styles.statsRow}>
        {[
          { v: d.cards,    l: 'cards' },
          { v: d.due,      l: 'due' },
          { v: d.mastered, l: 'mastered' },
        ].map((s, i, arr) => (
          <View
            key={s.l}
            style={[
              styles.statCell,
              i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
            ]}
          >
            <Text style={styles.statVal}>{s.v}</Text>
            <SectionLabel size={9.5} style={{ marginTop: 5 }}>{s.l}</SectionLabel>
          </View>
        ))}
      </View>

      {/* CTA */}
      <View style={styles.ctaWrap}>
        <Pressable onPress={() => router.push('/quiz')} style={styles.cta}>
          <Text style={styles.ctaText}>Review {d.due} due →</Text>
        </Pressable>
      </View>

      {/* Cards list */}
      <View style={styles.section}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
          <SectionLabel>Cards</SectionLabel>
        </View>
        <View style={{ gap: 8 }}>
          {d.list.map((c) => (
            <View key={c.n} style={styles.cardRow}>
              <Text style={styles.cardNum}>{c.n}</Text>
              <Text style={styles.cardQ}>{c.q}</Text>
              <View style={[styles.statusPill, { backgroundColor: STATUS_BG[c.status] }]}>
                <Text style={[styles.statusPillText, { color: STATUS_COLOR[c.status] }]}>
                  {c.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  nav: {
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  navBack: { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },
  navEdit: { fontSize: 12, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

  titleBlock: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: {
    fontFamily: fonts.grotesk,
    fontSize: 22, fontWeight: '800', letterSpacing: -0.7, lineHeight: 26, color: colors.text,
  },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 6, fontFamily: fonts.grotesk },

  masteryLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 18 },
  masteryNum: {
    fontFamily: fonts.grotesk,
    fontSize: 38, fontWeight: '900', letterSpacing: -1.5, lineHeight: 38, color: colors.text,
  },
  masteryUnit: { fontSize: 12, color: colors.muted, fontFamily: fonts.grotesk },

  barTrack: { height: 2, borderRadius: 1, backgroundColor: colors.dim, marginTop: 10, overflow: 'hidden' },
  barFill:  { height: '100%', backgroundColor: colors.accent },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statCell: { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  statVal: {
    fontFamily: fonts.grotesk,
    fontSize: 24, fontWeight: '800', letterSpacing: -0.7, lineHeight: 24, color: colors.text,
  },

  ctaWrap: {
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cta: {
    paddingVertical: 12, borderRadius: 8,
    backgroundColor: colors.accent, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 13.5, fontWeight: '700', fontFamily: fonts.grotesk },

  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },

  cardRow: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  cardNum: { fontSize: 10.5, color: colors.muted, fontWeight: '600', width: 22, fontFamily: fonts.mono },
  cardQ:   { flex: 1, fontSize: 13, color: colors.sub, fontWeight: '500', fontFamily: fonts.grotesk },

  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusPillText: {
    fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase', fontWeight: '600',
    fontFamily: fonts.grotesk,
  },
});
