import { View, Text, StyleSheet } from 'react-native';
import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { Divider } from '@/components/Divider';
import { colors, fonts } from '@/theme';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;
const DAY_ACTIVE = [true, true, true, true, false, false, false] as const;

interface QuadStat {
  label: string;
  val: string;
  sub: string;
}

const STATS_TOP: QuadStat[] = [
  { label: 'Accuracy',     val: '84%', sub: 'avg across all decks' },
  { label: 'Certificates', val: '3',   sub: 'completed' },
];
const STATS_BOTTOM: QuadStat[] = [
  { label: 'Global rank', val: '#12', sub: 'this week' },
  { label: 'Focus queue', val: '5',   sub: 'cards due today' },
];

interface MasteredItem {
  topic: string;
  pct: number;
}
const RECENTLY_MASTERED: MasteredItem[] = [
  { topic: 'Treaty of Westphalia',   pct: 92 },
  { topic: 'Por vs Para',            pct: 87 },
  { topic: 'Cross-price elasticity', pct: 79 },
];

export default function ProfileScreen() {
  return (
    <EdBase>
      {/* Identity bar */}
      <View style={styles.idBar}>
        <Text style={styles.idName}>Alex Morgan</Text>
        <Text style={styles.idLevel}>Level 14</Text>
      </View>

      {/* Avatar row */}
      <View style={styles.avatarRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarChar}>A</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.avName}>Alex Morgan</Text>
          <Text style={styles.avMeta}>Member since Jan 2025</Text>
        </View>
        <Text style={styles.editLink}>Edit</Text>
      </View>

      {/* Streak */}
      <View style={styles.streakBlock}>
        <SectionLabel style={{ marginBottom: 8 }}>Current Streak</SectionLabel>
        <View style={styles.streakLine}>
          <Text style={styles.streakNum}>47</Text>
          <Text style={styles.streakUnit}>days</Text>
          <Text style={[styles.streakUnit, { marginLeft: 'auto' }]}>Best: 61</Text>
        </View>

        {/* Day cells */}
        <View style={styles.daysRow}>
          {DAY_LABELS.map((d, i) => {
            const active = DAY_ACTIVE[i];
            return (
              <View key={i} style={styles.dayCell}>
                <View
                  style={[
                    styles.daySquare,
                    {
                      backgroundColor: active ? colors.accent : colors.bg,
                      borderColor: active ? colors.accent : colors.border,
                    },
                  ]}
                />
                <Text style={styles.dayLabel}>{d}</Text>
              </View>
            );
          })}
        </View>

        {/* Goal bar */}
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: '78%' }]} />
        </View>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>78% to monthly goal</Text>
          <Text style={styles.barLabel}>Goal: 60 days</Text>
        </View>
      </View>

      {/* Stats grid */}
      <View style={styles.gridBlock}>
        <View style={[styles.gridRow, { borderBottomWidth: 1, borderBottomColor: colors.border }]}>
          {STATS_TOP.map((item, i) => (
            <StatCell key={item.label} item={item} hasBorder={i === 0} />
          ))}
        </View>
        <View style={styles.gridRow}>
          {STATS_BOTTOM.map((item, i) => (
            <StatCell key={item.label} item={item} hasBorder={i === 0} />
          ))}
        </View>
      </View>

      {/* Recently mastered */}
      <View style={styles.masteredBlock}>
        <View style={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10 }}>
          <SectionLabel>Recently Mastered</SectionLabel>
        </View>
        {RECENTLY_MASTERED.map((item, idx) => (
          <View key={item.topic}>
            <View style={styles.masteredRow}>
              <Text style={styles.masteredTopic}>{item.topic}</Text>
              <View style={styles.miniBar}>
                <View style={[styles.miniBarFill, { width: `${item.pct}%` }]} />
              </View>
              <Text style={styles.masteredPct}>{item.pct}%</Text>
            </View>
            {idx < RECENTLY_MASTERED.length - 1 && <Divider style={{ marginHorizontal: 18 }} />}
          </View>
        ))}
        <View style={{ height: 10 }} />
      </View>
    </EdBase>
  );
}

function StatCell({ item, hasBorder }: { item: QuadStat; hasBorder: boolean }) {
  return (
    <View
      style={[
        styles.statCell,
        hasBorder && { borderRightWidth: 1, borderRightColor: colors.border },
      ]}
    >
      <SectionLabel style={{ marginBottom: 6 }}>{item.label}</SectionLabel>
      <Text style={styles.statVal}>{item.val}</Text>
      <Text style={styles.statSub}>{item.sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  idBar: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  idName:  { fontSize: 13, fontWeight: '600', letterSpacing: -0.2, color: colors.text, fontFamily: fonts.grotesk },
  idLevel: { fontSize: 12, color: colors.muted, fontFamily: fonts.grotesk },

  avatarRow: {
    paddingHorizontal: 20, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarChar: { color: '#fff', fontSize: 18, fontWeight: '700', fontFamily: fonts.grotesk },
  avName:     { fontSize: 17, fontWeight: '700', letterSpacing: -0.4, color: colors.text, fontFamily: fonts.grotesk },
  avMeta:     { fontSize: 12, color: colors.muted, marginTop: 2, fontFamily: fonts.grotesk },
  editLink:   { fontSize: 12, color: colors.accent, fontWeight: '600', fontFamily: fonts.grotesk },

  streakBlock: {
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18,
    backgroundColor: colors.surf,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  streakLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakNum:  { fontSize: 52, fontWeight: '900', letterSpacing: -2, lineHeight: 52, color: colors.text, fontFamily: fonts.grotesk },
  streakUnit: { fontSize: 13, color: colors.muted, fontFamily: fonts.grotesk },

  daysRow: { flexDirection: 'row', gap: 6, marginTop: 14 },
  dayCell: { flex: 1, alignItems: 'center', gap: 6 },
  daySquare: {
    width: '100%', aspectRatio: 1,
    borderRadius: 4, borderWidth: 1.5,
  },
  dayLabel: { fontSize: 9, color: colors.muted, fontWeight: '500', fontFamily: fonts.grotesk },

  barTrack: { height: 2, borderRadius: 1, backgroundColor: colors.dim, marginTop: 14, overflow: 'hidden' },
  barFill:  { height: '100%', backgroundColor: colors.accent },
  barRow:   { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  barLabel: { fontSize: 10, color: colors.muted, fontFamily: fonts.grotesk },

  gridBlock: { backgroundColor: colors.surf, borderBottomWidth: 1, borderBottomColor: colors.border },
  gridRow:   { flexDirection: 'row' },
  statCell:  { flex: 1, paddingHorizontal: 18, paddingVertical: 16 },
  statVal: {
    fontFamily: fonts.grotesk,
    fontSize: 28, fontWeight: '800', letterSpacing: -0.8, lineHeight: 28, color: colors.text,
  },
  statSub: { fontSize: 11, color: colors.muted, marginTop: 4, fontFamily: fonts.grotesk },

  masteredBlock: { backgroundColor: colors.surf, borderBottomWidth: 1, borderBottomColor: colors.border },
  masteredRow: {
    paddingHorizontal: 18, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  masteredTopic: { flex: 1, fontSize: 13, fontWeight: '500', color: colors.sub, fontFamily: fonts.grotesk },
  miniBar:       { width: 48, height: 2, borderRadius: 1, backgroundColor: colors.dim, overflow: 'hidden' },
  miniBarFill:   { height: '100%', backgroundColor: colors.accent },
  masteredPct:   { fontSize: 12, color: colors.accent, fontWeight: '700', width: 32, textAlign: 'right', fontFamily: fonts.grotesk },
});
