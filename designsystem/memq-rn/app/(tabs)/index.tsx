import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { Icon } from '@/components/Icon';
import { colors, fonts } from '@/theme';
import { dueToday } from '@/data/decks';

/**
 * Today / Home — daily-focus surface.
 *
 * Editorial vocabulary:
 *  - Big numeric in the hero ("19" cards due) — type before chrome.
 *  - 32% goal bar — hairline, 2px tall.
 *  - "Up Next" queue rendered as standalone cards (not divider list).
 *  - Empty CTA at the bottom uses a dashed border to feel quiet.
 */
export default function TodayScreen() {
  return (
    <EdBase>
      {/* Header */}
      <View style={[styles.row, styles.headerRow]}>
        <View style={{ flex: 1 }}>
          <SectionLabel>Tuesday · April 29</SectionLabel>
          <Text style={styles.greet}>Good morning, Alex</Text>
        </View>
        <View style={styles.streakBlock}>
          <Text style={styles.streakNum}>47</Text>
          <SectionLabel size={9} style={{ marginTop: 4 }}>Day Streak</SectionLabel>
        </View>
      </View>

      {/* Hero — focus queue */}
      <View style={styles.hero}>
        <SectionLabel style={{ marginBottom: 8 }}>Focus Queue</SectionLabel>
        <View style={styles.heroLine}>
          <Text style={styles.heroNum}>19</Text>
          <Text style={styles.heroSub}>cards due today</Text>
          <Text style={[styles.heroSub, { marginLeft: 'auto' }]}>~12 min</Text>
        </View>

        {/* Goal bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: '32%' }]} />
        </View>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>6 of 19 reviewed</Text>
          <Text style={styles.barLabel}>Daily goal: 19</Text>
        </View>

        <Pressable onPress={() => router.push('/quiz')} style={styles.cta}>
          <Text style={styles.ctaText}>Start review →</Text>
        </Pressable>
      </View>

      {/* Up Next — card stream */}
      <View style={styles.section}>
        <View style={[styles.sectionHead, styles.row]}>
          <SectionLabel>Up Next</SectionLabel>
          <Text style={styles.sectionMeta}>by topic</Text>
        </View>
        <View style={{ gap: 8 }}>
          {dueToday.map((d) => (
            <Pressable key={d.id} onPress={() => router.push('/quiz')} style={styles.queueCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <SectionLabel size={9.5} style={{ marginBottom: 3 }}>{d.topic}</SectionLabel>
                <Text style={styles.queueTitle} numberOfLines={1}>{d.card}</Text>
              </View>
              <Text style={styles.queueDue}>{d.count} due</Text>
              <Icon name="chevronRight" color={colors.dim} size={14} />
            </Pressable>
          ))}
        </View>
      </View>

      {/* Two-up stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCell, styles.statCellBorder]}>
          <SectionLabel style={{ marginBottom: 6 }}>Reviewed</SectionLabel>
          <Text style={styles.statVal}>128</Text>
          <Text style={styles.statSub}>this week</Text>
        </View>
        <View style={styles.statCell}>
          <SectionLabel style={{ marginBottom: 6 }}>Accuracy</SectionLabel>
          <Text style={styles.statVal}>84%</Text>
          <Text style={styles.statSub}>7-day avg</Text>
        </View>
      </View>

      {/* Empty CTA */}
      <View style={{ padding: 16, paddingTop: 16, paddingBottom: 24 }}>
        <Pressable onPress={() => router.push('/create')} style={styles.makeNew}>
          <View>
            <Text style={styles.makeNewTitle}>Make a new set</Text>
            <Text style={styles.makeNewSub}>Generate cards from a question or doc</Text>
          </View>
          <Text style={styles.makeNewPlus}>+</Text>
        </Pressable>
      </View>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  headerRow: {
    paddingHorizontal: 18, paddingTop: 20, paddingBottom: 14,
    alignItems: 'flex-start', gap: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  greet: {
    fontFamily: fonts.grotesk,
    fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginTop: 2, color: colors.text,
  },
  streakBlock: { alignItems: 'flex-end' },
  streakNum: {
    fontFamily: fonts.grotesk,
    fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: colors.accent, lineHeight: 22,
  },

  hero: {
    paddingHorizontal: 20, paddingTop: 22, paddingBottom: 18,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  heroLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  heroNum: {
    fontFamily: fonts.grotesk,
    fontSize: 52, fontWeight: '900', letterSpacing: -2, color: colors.text, lineHeight: 52,
  },
  heroSub: { fontFamily: fonts.grotesk, fontSize: 13, color: colors.muted },

  barTrack: { height: 2, borderRadius: 1, backgroundColor: colors.dim, marginTop: 14, overflow: 'hidden' },
  barFill:  { height: '100%', backgroundColor: colors.accent },
  barRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  barLabel: { fontSize: 10, color: colors.muted, fontFamily: fonts.grotesk },

  cta: {
    marginTop: 16, paddingVertical: 13, borderRadius: 8,
    backgroundColor: colors.accent, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: fonts.grotesk },

  section: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sectionHead: { paddingHorizontal: 4, paddingBottom: 10, alignItems: 'center' },
  sectionMeta: { fontSize: 11, color: colors.muted, fontFamily: fonts.grotesk },

  queueCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  queueTitle: { fontSize: 13, fontWeight: '500', color: colors.sub, fontFamily: fonts.grotesk },
  queueDue:   { fontSize: 11, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statCell:       { flex: 1, paddingHorizontal: 18, paddingVertical: 16 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  statVal: {
    fontFamily: fonts.grotesk,
    fontSize: 28, fontWeight: '800', letterSpacing: -0.8, color: colors.text, lineHeight: 28,
  },
  statSub: { fontSize: 11, color: colors.muted, marginTop: 4, fontFamily: fonts.grotesk },

  makeNew: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dim, borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  makeNewTitle: { fontSize: 13, fontWeight: '600', color: colors.text, fontFamily: fonts.grotesk },
  makeNewSub:   { fontSize: 11, color: colors.muted, marginTop: 2, fontFamily: fonts.grotesk },
  makeNewPlus:  { fontSize: 18, color: colors.muted, fontFamily: fonts.grotesk },
});
