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
import { AccuracyChart, ChartCard, ChartWaiting, ForecastChart, GoalChart, StageBar, WeekGrid } from '@/components/stats/ProgressCharts';
import { CountUp } from '@/components/motion/Grow';
import { cardsByLastReview, dayStart, dueForecast, recentDays, stageCounts, studyLevels, type ReviewDay } from '@/lib/reviewStats';
import { loadReviewDays } from '@/lib/reviewLog';
import { STAGES, type Stage } from '@/lib/scheduler';
import { LedgePressable } from '@/components/ui/LedgePressable';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
/** How far back each chart looks. */
/** How many weeks the streak's grid shows, this one included. */
const GRID_WEEKS = 5;
const TREND_DAYS = 14;

const shortDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });


export default function ProfileScreen() {
  const { isPro, showPaywall } = useSubscription();
  const [displayName, setDisplayName] = useState('User');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<Stage, number>>(
    () => Object.fromEntries(STAGES.map((stage) => [stage, 0])) as Record<Stage, number>);
  const [forecast, setForecast] = useState<number[]>(() => new Array(7).fill(0));
  /** How much was studied on each day (0–4), by local day key. */
  const [heat, setHeat] = useState<Map<string, number>>(() => new Map());
  /** Answers per day from the review record; null until it can be read. */
  const [reviewDays, setReviewDays] = useState<Map<string, ReviewDay> | null>(null);
  const [dailyGoal, setDailyGoal] = useState(20);
  /** Whether the numbers have arrived. Until they have, nothing says "you have no
   * cards" or "nothing yet": the charts sit empty, ready to grow. */
  const [loaded, setLoaded] = useState(false);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);

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

      const { data: lessonsData } = await supabase.from('lessons').select('id').eq('user_id', user.id);

      const lessonIds = (lessonsData || []).map((lesson) => lesson.id);
      const { data: termsData } = lessonIds.length
        ? await supabase.from('terms').select('id').in('lesson_id', lessonIds)
        : { data: [] as { id: string }[] };

      const termIds = (termsData || []).map((term) => term.id);

      const { data: progressData } = termIds.length
        ? await supabase
            .from('user_term_progress')
            .select('term_id, status, last_reviewed_at, next_review_at')
            .eq('user_id', user.id)
            .in('term_id', termIds)
        : { data: [] as { term_id: string; status: string | null; last_reviewed_at: string | null; next_review_at: string | null }[] };

      const progressMap = buildLatestProgressMap(progressData || []);
      const activityDays = activityDaysFromProgressUpdates(progressData || []);

      setStages(stageCounts(termIds, progressMap));
      setForecast(dueForecast((progressData || []).map((row) => row.next_review_at)));
      const goal = user.user_metadata?.daily_goal_cards;
      setDailyGoal(typeof goal === 'number' && goal > 0 ? goal : 20);

      // Every day the grid can show, shaded by how many cards were studied on it
      // against the busiest of them (reviewStats.studyLevels).
      const today = new Date();
      const since = dayStart(-(GRID_WEEKS * 7 + 6), today);
      const days = await loadReviewDays(since);
      setReviewDays(days);
      const keys = recentDays(Math.round((dayStart(0, today).getTime() - since.getTime()) / 86400000) + 1, today);
      setHeat(studyLevels(keys, days, cardsByLastReview((progressData || []).map((row) => row.last_reviewed_at))));

      setCurrentStreak(computeCurrentStreak(activityDays));
      setBestStreak(computeBestStreak(activityDays));

      setLoaded(true);
    };
    void loadUserProfile();
  }, []));

  const avatarInitial = useMemo(() => displayName.charAt(0).toUpperCase() || 'U', [displayName]);
  // From the same counts as the bar, so the two can never disagree mid-load.
  const totalCards = STAGES.reduce((sum, stage) => sum + stages[stage], 0);
  const masteredCards = stages.Mastered;

  // The charts' labels and sentences, worked out once per render from the numbers.
  const charts = useMemo(() => {
    const today = new Date();
    const forecastLabels = forecast.map((_, i) => (i === 0 ? 'Today' : SHORT_DAYS[dayStart(i, today).getDay()]));
    const weekDue = forecast.reduce((sum, n) => sum + n, 0);
    const later = forecast.slice(1);
    const peak = later.indexOf(Math.max(...later)) + 1;
    const forecastNote = weekDue === 0 ? 'Nothing due this week.'
      : forecast[peak] > forecast[0] ? `Busiest: ${forecastLabels[peak]}, ${forecast[peak]} cards.`
      : `${weekDue} cards this week.`;

    const keys = recentDays(TREND_DAYS, today);
    const trendLabels = keys.map((_, i) => (i === keys.length - 1 ? 'Today' : shortDate(dayStart(i - keys.length + 1, today))));
    const cardsByDay = keys.map((key) => reviewDays?.get(key)?.cards ?? 0);
    const goalDays = cardsByDay.slice(-7).filter((n) => n >= dailyGoal).length;
    const accuracy = keys.map((key) => {
      const day = reviewDays?.get(key);
      return day && day.answers > 0 ? Math.round((day.correct / day.answers) * 100) : null;
    });
    const sum = (from: number, to: number) => keys.slice(from, to).reduce((acc, key) => {
      const day = reviewDays?.get(key);
      return { answers: acc.answers + (day?.answers ?? 0), correct: acc.correct + (day?.correct ?? 0) };
    }, { answers: 0, correct: 0 });
    const week = sum(7, 14), before = sum(0, 7);
    const weekPct = week.answers > 0 ? Math.round((week.correct / week.answers) * 100) : null;
    const beforePct = before.answers > 0 ? Math.round((before.correct / before.answers) * 100) : null;
    const change = weekPct !== null && beforePct !== null ? weekPct - beforePct : null;
    const accuracyNote = change === null ? undefined
      : change > 0 ? `Up ${change} points on last week.` : change < 0 ? `Down ${-change} points on last week.` : 'Same as last week.';
    const answered = !!reviewDays && [...reviewDays.values()].some((day) => day.answers > 0);
    return { forecastLabels, forecastNote, trendLabels, cardsByDay, goalDays, accuracy, weekPct, accuracyNote, answered };
  }, [forecast, reviewDays, dailyGoal]);

  return (
    <EdBase bottomInset={0} scroll={false}>
      <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.45, 1]} style={styles.pageGradient} />
      <SecondaryPageNav backLabel="← Today" onBack={() => safeBack('/(tabs)')}
        right={<RoundAction icon="settings" label="Open profile settings"
          onPress={() => router.push('/profile/settings' as any)} />} />
      {/* Avatar row */}
      <View style={styles.avatarRow}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarChar}>{avatarInitial}</Text>
          </View>
        )}
        <View style={styles.identity}>
          <Text numberOfLines={1} style={styles.avName}>{displayName}</Text>
          {isPro && (
            <View style={styles.memberRow}>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
          )}
        </View>
        {!isPro && (
          <LedgePressable accessibilityRole="button" accessibilityLabel="Go Pro"
            onPress={showPaywall} style={styles.goPro}>
            <View style={styles.goProFace}>
              <Feather name="zap" size={15} color={homeColors.white} />
              <Text style={styles.goProText}>Go Pro</Text>
            </View>
          </LedgePressable>
        )}
      </View>

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={styles.contentScrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* Streak */}
        <View style={styles.streakBlock}>
          {/* The streak on the left, the weeks it was made of on the right. */}
          <View style={styles.streakCopy}>
            <View style={styles.flameBadge}><HomeAsset name="flame" /></View>
            {/* The number, and what it counts sitting on its baseline beside it. */}
            <View style={styles.streakLine} accessible accessibilityLabel={`${currentStreak} day streak`}>
              <CountUp value={currentStreak} style={styles.streakNum} />
              <Text style={styles.streakUnit}>day streak</Text>
            </View>
            <Text style={styles.bestLine}>Best <Text style={styles.bestValue}>{bestStreak}</Text></Text>
          </View>
          <WeekGrid levels={heat} weeks={GRID_WEEKS} />
        </View>

        <View style={styles.progressSection}>
          <View style={styles.sectionHeading}><Text accessibilityRole="header" style={styles.sectionTitle}>Your progress</Text><Pressable accessibilityRole="button" onPress={() => router.push('/(tabs)/library')} style={styles.libraryLink}><Text style={styles.libraryLinkText}>Library</Text><Feather name="arrow-up-right" size={16} color={homeColors.primary} /></Pressable></View>
          <ChartCard label="Your cards" value={String(masteredCards)} unit={loaded || totalCards > 0 ? `of ${totalCards} mastered` : 'mastered'}
            note={loaded && totalCards === 0 ? 'Add cards to start tracking.' : undefined}>
            <StageBar counts={stages} />
          </ChartCard>
        </View>

        <View style={styles.chartSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Coming up</Text>
          <ChartCard label="Reviews due" value={String(forecast[0])} unit="today" note={charts.forecastNote}>
            <ForecastChart counts={forecast} labels={charts.forecastLabels} />
          </ChartCard>
        </View>

        <View style={styles.chartSection}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>How you’re doing</Text>
          <ChartCard label="Daily goal" value={charts.answered ? String(charts.goalDays) : '–'} unit="of the last 7 days" note={`Goal: ${dailyGoal} cards a day.`}>
            {charts.answered
              ? <GoalChart values={charts.cardsByDay} labels={charts.trendLabels} goal={dailyGoal} />
              : <ChartWaiting>{loaded ? 'Your study days will show here from today.' : ''}</ChartWaiting>}
          </ChartCard>
          <ChartCard label="Correct answers" value={charts.weekPct === null ? '–' : `${charts.weekPct}%`} unit="this week" note={charts.accuracyNote}>
            {charts.answered
              ? <AccuracyChart values={charts.accuracy} labels={charts.trendLabels} />
              : <ChartWaiting>{loaded ? 'How often you’re right will show here once you practise.' : ''}</ChartWaiting>}
          </ChartCard>
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
    flexShrink: 1,
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
  // Avatar and name take what they need; the offer is pushed to the far edge of the
  // row, against the same margin everything below it lines up on.
  identity: { flex: 1 },
  // The filled button of the set. It is the one thing on this page asking for
  // something, so it is the only filled control here — which is what makes it read
  // as an offer rather than as another control.
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
    padding: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12,
    backgroundColor: homeColors.white, borderRadius: 24,
    boxShadow: `0px 4px 0px ${homeColors.border}`,
  },
  bestValue: { fontFamily: fonts.semibold, color: homeColors.deep },
  flameBadge: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: homeColors.selected, marginBottom: 8 },
  streakLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  streakNum: { fontSize: 44, lineHeight: 50, fontFamily: fonts.display, color: homeColors.deep },
  // Down onto the number's baseline: Oswald's figures sit high in their line.
  streakUnit: { fontSize: 14, color: homeColors.deep, fontFamily: fonts.semibold, marginBottom: 8 },
  streakCopy: { flex: 1 },
  bestLine: { fontSize: 12, color: homeColors.muted, fontFamily: fonts.medium, marginTop: 6 },


  chartSection: { paddingHorizontal: layout.screenInline, paddingBottom: 24, gap: 14 },
  progressSection: { paddingHorizontal: layout.screenInline, paddingTop: 28, paddingBottom: 24, gap: 14 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  sectionTitle: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 28, color: homeColors.darkest },
  libraryLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 3 },
  libraryLinkText: { fontFamily: fonts.semibold, fontSize: 14, color: homeColors.primary },
});
