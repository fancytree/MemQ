import { layout } from '@/theme/spacing';
import { SecondaryPageNav } from '@/components/SecondaryPageNav';
import { RoundAction } from '@/components/ui/RoundButtons';
import { ledge } from '@/theme/ledge';
import { safeBack } from '@/lib/safeBack';
import { EdBase } from '@/components/EdBase';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { HomeAsset } from '@/components/HomeAsset';
import { homeColors } from '@/theme/colors';
import { useSubscription } from '@/context/SubscriptionContext';
import {
  activityDaysFromProgressUpdates,
  computeBestStreak,
  computeCurrentStreak,
} from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { colors, fonts } from '@/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

interface QuadStat {
  label: string;
  val: string;
  sub: string;
}

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
    { label: 'Cards', val: '0', sub: 'in your library' },
    { label: 'Mastered', val: '0', sub: 'cards mastered' },
  ]);

  useFocusEffect(useCallback(() => {
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

      let masteredCount = 0;
      termIds.forEach((termId) => {
        const status = progressMap.get(termId);
        if (status === 'Mastered') masteredCount += 1;
      });



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
        { label: 'Lessons', val: String(lessonsCount || 0), sub: 'created' },
        { label: 'Cards', val: String(totalTerms), sub: 'in your library' },
        { label: 'Mastered', val: String(masteredCount), sub: 'cards mastered' },
      ]);
    };
    void loadUserProfile();
  }, []));

  const avatarInitial = useMemo(() => displayName.charAt(0).toUpperCase() || 'U', [displayName]);
  const totalCards = Number(stats[1].val) || 0;
  const masteredCards = Number(stats[2].val) || 0;
  const mastery = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;

  return (
    <EdBase bottomInset={0} scroll={false}>
      <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.45, 1]} style={styles.pageGradient} />
      <SecondaryPageNav backLabel="← Today" onBack={() => safeBack('/(tabs)')}
        right={
          <View style={styles.navActions}>
            {!isPro && (
              <Pressable accessibilityRole="button" accessibilityLabel="Go Pro"
                onPress={showPaywall} style={styles.goPro}>
                <View style={styles.goProFace}>
                  <Feather name="zap" size={15} color={homeColors.white} />
                  <Text style={styles.goProText}>Go Pro</Text>
                </View>
              </Pressable>
            )}
            <RoundAction icon="settings" label="Open profile settings"
              onPress={() => router.push('/profile/settings' as any)} />
          </View>
        } />
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
          {isPro && (
            <View style={styles.memberRow}>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
          )}
        </View>
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
              <Text style={styles.streakLabel}>Your streak</Text>
              <View style={styles.streakLine}>
                <Text style={styles.streakNum}>{currentStreak}</Text>
                <Text style={styles.streakUnit}>days</Text>
              </View>
              <Text style={styles.streakHint}>{currentStreak > 0 ? 'Keep your learning streak going.' : 'One study session starts your streak.'}</Text>
            </View>
            <View style={styles.streakSide}><View style={styles.flameBadge}><HomeAsset name="flame" /></View><View style={styles.bestBadge}><Text style={styles.bestValue}>{bestStreak}</Text><Text style={styles.bestLabel}>best</Text></View></View>
          </View>

          <View style={styles.activityHeading}><Text style={styles.activityTitle}>Last 7 days</Text></View>
          <View style={styles.daysRow}>
            {dayLabels.map((d, i) => {
              const active = dayActive[i];
              const isToday = i === dayLabels.length - 1;
              return (
                <View key={i} accessible accessibilityLabel={`${isToday ? 'Today, ' : ''}${d}, ${active ? 'studied' : 'no study activity'}`} style={styles.dayCell}>
                  <View style={[styles.dayMarker, isToday && styles.dayMarkerToday]}>
                    <View style={[styles.daySquare, active ? styles.daySquareActive : styles.daySquareIdle]} />
                  </View>
                  <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{d}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.sectionHeading}><View><Text accessibilityRole="header" style={styles.sectionTitle}>Your progress</Text><Text style={styles.sectionSubtitle}>A look at what you’ve learned</Text></View><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/library')} style={styles.libraryLink}><Text style={styles.libraryLinkText}>Library</Text><Feather name="arrow-up-right" size={16} color={homeColors.primary} /></Pressable></View>
          <View style={styles.masteryCard}>
            <View style={styles.masteryCopy}><View style={styles.masteryTag}><Feather name="check" size={14} color={homeColors.deep} /><Text style={styles.masteryTagText}>Mastered</Text></View><Text style={styles.masteryNumber}>{masteredCards}<Text style={styles.masteryTotal}> / {totalCards}</Text></Text><Text style={styles.masteryHint}>{totalCards === 0 ? 'Add cards to start tracking your progress.' : 'cards have reached mastered status'}</Text></View>
            <View accessibilityRole="progressbar" accessibilityLabel="Cards mastered" accessibilityValue={{ min: 0, max: 100, now: mastery }} style={styles.masteryChart}><Svg width={100} height={100} viewBox="0 0 100 100"><Circle cx={50} cy={50} r={40} stroke={homeColors.track} strokeWidth={9} fill="none" /><Circle cx={50} cy={50} r={40} stroke={homeColors.primary} strokeWidth={9} fill="none" strokeLinecap="round" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={(2 * Math.PI * 40) * (1 - mastery / 100)} rotation={-90} origin="50, 50" /></Svg><Text style={styles.masteryPercent}>{mastery}%</Text></View>
          </View>
          <View style={styles.collectionCard}>
            <View style={styles.collectionItem}><Text style={styles.collectionValue}>{stats[0].val}</Text><Text style={styles.collectionLabel}>Lessons</Text></View><View style={styles.collectionDivider} /><View style={styles.collectionItem}><Text style={styles.collectionValue}>{stats[1].val}</Text><Text style={styles.collectionLabel}>Cards</Text></View><View style={styles.collectionDivider} /><View style={styles.collectionItem}><Text style={styles.collectionValue}>{stats[2].val}</Text><Text style={styles.collectionLabel}>Mastered</Text></View>
          </View>
        </View>
      </ScrollView>
    </EdBase>
  );
}

const styles = StyleSheet.create({
  pageGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 330 },
  avatarRow: { paddingHorizontal: layout.screenInline, paddingTop: 14, paddingBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: homeColors.deep,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  avatarChar: { color: homeColors.white, fontSize: 24, fontWeight: '700', fontFamily: fonts.bold },
  avName: {
    fontSize: 27, fontFamily: fonts.display,
    lineHeight: 36, color: homeColors.deep,
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
  navActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // The filled button of the set, at the shallow depth the bar's discs carry: it is
  // the only thing on this page asking for something, so it is the only filled one.
  goPro: {
    height: 42 + ledge.control, borderRadius: 22,
    backgroundColor: homeColors.deep, paddingBottom: ledge.control,
  },
  goProFace: {
    flex: 1, borderRadius: 22, backgroundColor: homeColors.primary,
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14,
  },
  goProText: {
    fontFamily: fonts.semibold, fontSize: 15, color: homeColors.white,
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
    backgroundColor: homeColors.white, borderRadius: 24,
    boxShadow: `0px 4px 0px ${homeColors.border}`, 
  },
  streakSide: { alignItems: 'center', gap: 8, marginLeft: 12 },
  bestBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 4, backgroundColor: homeColors.nav, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  bestValue: { fontFamily: fonts.display, fontSize: 16, color: homeColors.deep },
  bestLabel: { fontFamily: fonts.medium, fontSize: 11, color: homeColors.muted },
  streakHint: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: homeColors.muted, marginTop: 2 },
  activityHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderColor: homeColors.border, paddingTop: 16, marginTop: 18 },
  activityTitle: { fontFamily: fonts.semibold, fontSize: 13, color: homeColors.deep },
  streakLabel: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 24, color: homeColors.deep, marginBottom: 4 },
  flameBadge: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: homeColors.selected },
  streakHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  streakCopy: { flex: 1, minWidth: 0 },
  streakLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  streakNum: {
    fontSize: 50, fontFamily: fonts.display,
    letterSpacing: -1.8, lineHeight: 56, paddingTop: 2, color: homeColors.deep,
  },
  streakUnit: { fontSize: 14, color: colors.muted, fontFamily: fonts.regular },

  daysRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  dayCell: { flex: 1, alignItems: 'center', gap: 4 },
  dayMarker: { width: '100%', aspectRatio: 1, borderRadius: 999, padding: 3, borderWidth: 2, borderColor: colors.transparent },
  dayMarkerToday: { borderColor: homeColors.primary },
  daySquare: { flex: 1, borderRadius: 999, borderWidth: 1.5 },
  daySquareActive: { backgroundColor: homeColors.primary, borderColor: homeColors.primary },
  daySquareIdle: { backgroundColor: homeColors.nav, borderColor: homeColors.border },
  dayLabel: { fontSize: 12, color: colors.muted, fontWeight: '500', fontFamily: fonts.medium },
  dayLabelToday: { color: colors.accentText, fontFamily: fonts.bold, fontWeight: '700' },

  progressSection: { paddingHorizontal: layout.screenInline, paddingTop: 28, paddingBottom: 24, gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, color: homeColors.darkest },
  sectionSubtitle: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: homeColors.muted, marginTop: 2 },
  libraryLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 },
  libraryLinkText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary },
  masteryCard: { minHeight: 156, backgroundColor: homeColors.white, borderRadius: 24, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12, boxShadow: `0px 4px 0px ${homeColors.border}` },
  masteryCopy: { flex: 1, gap: 6 },
  masteryTag: { alignSelf: 'flex-start', borderRadius: 16, backgroundColor: homeColors.selected, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5 },
  masteryTagText: { fontFamily: fonts.semibold, fontSize: 12, color: homeColors.deep },
  masteryNumber: { fontFamily: fonts.display, fontSize: 38, lineHeight: 46, color: homeColors.deep },
  masteryTotal: { fontSize: 20, color: homeColors.muted },
  masteryHint: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: homeColors.muted },
  masteryChart: { width: 100, height: 100, alignItems: 'center', justifyContent: 'center' },
  masteryPercent: { position: 'absolute', fontFamily: fonts.display, fontSize: 22, color: homeColors.deep },
  collectionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: homeColors.white, borderRadius: 24, paddingVertical: 16, boxShadow: `0px 4px 0px ${homeColors.border}` },
  collectionItem: { flex: 1, alignItems: 'center', gap: 3 },
  collectionValue: { fontFamily: fonts.display, fontSize: 24, color: homeColors.deep },
  collectionLabel: { fontFamily: fonts.medium, fontSize: 12, color: homeColors.muted },
  collectionDivider: { width: 1, height: 36, backgroundColor: homeColors.border },
});
