import { layout } from '@/theme/spacing';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { safeBack } from '@/lib/safeBack';
import { EdBase } from '@/components/EdBase';
import { MascotCharacter } from '@/components/mascot/MascotCharacter';
import { SectionLabel } from '@/components/SectionLabel';
import { useSubscription } from '@/context/SubscriptionContext';
import {
  activityDaysFromProgressUpdates,
  computeBestStreak,
  computeCurrentStreak,
} from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { colors, fonts } from '@/theme';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

interface QuadStat {
  label: string;
  val: string;
  sub: string;
}

const LEARNING_STAGE_WEIGHTS: Record<string, number> = {
  New: 0,
  Learning: 0.2,
  Familiar: 0.4,
  Good: 0.6,
  Strong: 0.8,
  Mastered: 1.0,
};

const getStatusWeight = (status: string | null | undefined): number => {
  if (!status || status === 'New') return LEARNING_STAGE_WEIGHTS.New;
  return LEARNING_STAGE_WEIGHTS[status] ?? LEARNING_STAGE_WEIGHTS.New;
};

/** 本地日期键 YYYY-MM-DD，与 activityDaysFromProgressUpdates 保持一致 */
function toLocalDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function ProfileScreen() {
  const { isPro, showPaywall } = useSubscription();
  const [displayName, setDisplayName] = useState('User');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [dayLabels, setDayLabels] = useState<string[]>(['-', '-', '-', '-', '-', '-', '-']);
  const [dayActive, setDayActive] = useState<boolean[]>([false, false, false, false, false, false, false]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [stats, setStats] = useState<QuadStat[]>([
    { label: 'Lessons', val: '0', sub: 'total' },
    { label: 'Terms', val: '0', sub: 'total cards' },
    { label: 'Mastered', val: '0', sub: 'status reached' },
    { label: 'Focus queue', val: '0', sub: 'cards due today' },
  ]);

  useEffect(() => {
    const loadUserProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fromMeta = user.user_metadata?.full_name as string | undefined;
      const fromEmail = user.email?.split('@')[0];
      const name = (fromMeta?.trim() || fromEmail || 'User').trim();
      setDisplayName(name);
      const avatarPath = user.user_metadata?.avatar_url as string | undefined;
      if (!avatarPath) {
        setAvatarUrl(null);
      } else if (avatarPath.startsWith('http')) {
        setAvatarUrl(avatarPath);
      } else {
        const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
        setAvatarUrl(data.publicUrl || null);
      }

      const [{ data: lessonsData }, { count: lessonsCount }] = await Promise.all([
        supabase.from('lessons').select('id').eq('user_id', user.id),
        supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      const lessonIds = (lessonsData || []).map((lesson) => lesson.id);
      const { data: termsData } = lessonIds.length
        ? await supabase.from('terms').select('id').in('lesson_id', lessonIds)
        : { data: [] as { id: string }[] };

      const termIds = (termsData || []).map((term) => term.id);
      const totalTerms = termIds.length;

      const { data: progressData } = termIds.length
        ? await supabase
            .from('user_term_progress')
            .select('term_id, status, last_reviewed_at')
            .eq('user_id', user.id)
            .in('term_id', termIds)
        : { data: [] as { term_id: string; status: string | null; last_reviewed_at: string | null }[] };

      const progressMap = buildLatestProgressMap(progressData || []);
      const activityDays = activityDaysFromProgressUpdates(progressData || []);

      let weightedScore = 0;
      let masteredCount = 0;
      termIds.forEach((termId) => {
        const status = progressMap.get(termId);
        weightedScore += getStatusWeight(status);
        if (status === 'Mastered') masteredCount += 1;
      });

      const dueToday = Math.max(totalTerms - Math.round(weightedScore), 0);
      const weightedPct = totalTerms > 0 ? Math.round((weightedScore / totalTerms) * 100) : 0;

      // 最近 7 天（今天在最后一格），用本地日期键比对（避免 UTC 跨天误差）
      const recent7Days = Array.from({ length: 7 }, (_, idx) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - (6 - idx));
        return d;
      });
      setDayLabels(recent7Days.map((d) => WEEKDAY_LABELS[d.getDay()]));
      setDayActive(recent7Days.map((d) => activityDays.has(toLocalDateKey(d))));

      setCurrentStreak(computeCurrentStreak(activityDays));
      setBestStreak(computeBestStreak(activityDays));

      setStats([
        { label: 'Lessons', val: String(lessonsCount || 0), sub: 'total' },
        { label: 'Terms', val: String(totalTerms), sub: `${weightedPct}% weighted mastery` },
        { label: 'Mastered', val: String(masteredCount), sub: 'status reached' },
        { label: 'Focus queue', val: String(dueToday), sub: 'cards due today' },
      ]);
    };
    loadUserProfile();
  }, []);

  const avatarInitial = useMemo(() => displayName.charAt(0).toUpperCase() || 'U', [displayName]);

  return (
    <EdBase bottomInset={0} scroll={false}>
      <SecondaryPageNav backLabel="← Today" onBack={() => safeBack('/(tabs)')} showDivider={false} />
      {/* Avatar row */}
      <View style={styles.avatarRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarChar}>{avatarInitial}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.avName}>{displayName}</Text>
          <View style={styles.memberRow}>
            {isPro ? (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            ) : (
              <Pressable accessibilityRole="button" onPress={showPaywall} style={styles.upgradeEntry}>
                <Text style={styles.upgradeEntryText}>Go Pro</Text>
              </Pressable>
            )}
          </View>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/profile/settings' as any)}>
          <Text style={styles.editLink}>Edit</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* Streak */}
        <View style={styles.streakBlock}>
          <View style={styles.streakHead}>
            <View style={styles.streakCopy}>
              <SectionLabel size={11} style={{ marginBottom: 7, fontFamily: fonts.medium, fontWeight: '500', lineHeight: 15 }}>
                Your streak
              </SectionLabel>
              <View style={styles.streakLine}>
                <Text style={styles.streakNum}>{currentStreak}</Text>
                <Text style={styles.streakUnit}>days</Text>
                <Text style={[styles.streakUnit, { marginLeft: 'auto' }]}>Best {bestStreak}</Text>
              </View>
            </View>
            <MascotCharacter width={102} mood={currentStreak > 0 ? 'happy' : 'idle'} />
          </View>

          {/* Day cells — 最近 7 天，有学习的天无论 streak 是否连续都高亮 */}
          <View style={styles.daysRow}>
            {dayLabels.map((d, i) => {
              const active = dayActive[i];
              const isToday = i === dayLabels.length - 1;
              return (
                <View key={i} style={styles.dayCell}>
                  <View
                    style={[
                      styles.daySquare,
                      active ? styles.daySquareActive : styles.daySquareIdle,
                      isToday && !active && styles.daySquareToday,
                    ]}
                  />
                  <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{d}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.gridBlock}>
          <View style={styles.gridRow}>
            {stats.slice(0, 2).map((item, i) => (
              <StatCell key={item.label} item={item} />
            ))}
          </View>
          <View style={styles.gridRow}>
            {stats.slice(2, 4).map((item, i) => (
              <StatCell key={item.label} item={item} />
            ))}
          </View>
        </View>
      </ScrollView>
    </EdBase>
  );
}

function StatCell({ item }: { item: QuadStat }) {
  return (
    <View style={styles.statCell}>
      <SectionLabel size={11} style={{ marginBottom: 6, fontFamily: fonts.medium, fontWeight: '500', lineHeight: 15 }}>
        {item.label}
      </SectionLabel>
      <Text style={styles.statVal}>{item.val}</Text>
      <Text style={styles.statSub}>{item.sub}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarRow: {
    paddingHorizontal: layout.screenInline, paddingTop: 16, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  avatar: {
    width: 48, height: 48, borderRadius: 17,
    backgroundColor: colors.accentL,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 48, height: 48, borderRadius: 17 },
  avatarChar: { color: colors.accentText, fontSize: 19, fontWeight: '700', fontFamily: fonts.bold },
  avName: {
    fontSize: 20, fontFamily: fonts.bold, fontWeight: '700',
    lineHeight: 28, letterSpacing: -0.1, color: colors.text,
  },
  memberRow: { marginTop: 4, flexDirection: 'row', alignItems: 'center', gap: 8 },
  proBadge: {
    borderWidth: 1, borderColor: colors.action, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.accentL,
  },
  proBadgeText: {
    fontSize: 12, lineHeight: 14, letterSpacing: 0.4, color: colors.accentText,
    fontFamily: fonts.bold, fontWeight: '700',
  },
  upgradeEntry: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2, backgroundColor: colors.bg,
  },
  upgradeEntryText: {
    fontSize: 12, lineHeight: 14, letterSpacing: 0.2, color: colors.muted,
    fontFamily: fonts.medium, fontWeight: '500',
  },
  editLink: {
    fontSize: 13, letterSpacing: -0.1, color: colors.action,
    fontFamily: fonts.bold, fontWeight: '700',
  },

  contentScroll: { flex: 1 },
  contentScrollBody: { paddingBottom: 70 },

  streakBlock: {
    marginHorizontal: layout.screenInline, marginTop: 14,
    paddingHorizontal: 17, paddingTop: 16, paddingBottom: 17,
    backgroundColor: colors.heroBg,
    borderWidth: 1, borderColor: colors.heroBorder, borderRadius: 20,
  },
  streakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakCopy: { flex: 1, minWidth: 0 },
  streakLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakNum: {
    fontSize: 50, fontFamily: fonts.extraBold, fontWeight: '800',
    letterSpacing: -1.8, lineHeight: 56, paddingTop: 2, color: colors.text,
  },
  streakUnit: { fontSize: 14, color: colors.muted, fontFamily: fonts.regular },

  daysRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  dayCell: { flex: 1, alignItems: 'center', gap: 4 },
  daySquare: {
    width: '100%', aspectRatio: 1, borderRadius: 999, borderWidth: 1.5,
  },
  daySquareActive: { backgroundColor: colors.accent, borderColor: colors.action },
  daySquareIdle: { backgroundColor: colors.bg, borderColor: colors.border },
  daySquareToday: { backgroundColor: colors.transparent, borderWidth: 2, borderColor: colors.action },
  dayLabel: { fontSize: 12, color: colors.muted, fontWeight: '500', fontFamily: fonts.medium },
  dayLabelToday: { color: colors.accentText, fontFamily: fonts.bold, fontWeight: '700' },

  gridBlock: { gap: 10, paddingHorizontal: layout.screenInline, paddingTop: 14, paddingBottom: 22 },
  gridRow: { flexDirection: 'row', gap: 10 },
  statCell: { flex: 1, paddingHorizontal: 14, paddingVertical: 15, backgroundColor: colors.surf, borderRadius: 17, borderWidth: 1, borderColor: colors.border },
  statVal: {
    fontFamily: fonts.extraBold, fontSize: 32, fontWeight: '800',
    letterSpacing: -0.1, lineHeight: 36, paddingTop: 2, color: colors.text,
  },
  statSub: {
    fontSize: 12, lineHeight: 17, color: colors.muted, marginTop: 4,
    fontFamily: fonts.regular, fontWeight: '400',
  },
});
