import AIChatModal from '@/components/AIChatModal';
import FaceIcon from '@/components/icons/FaceIcon';
import FloatingAIButtonIcon from '@/components/icons/FloatingAIButtonIcon';
import { isCacheExpired, loadFromCache, saveToCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { Image } from 'expo-image';
import { router, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLoading } from '@/context/LoadingContext';

// ── Types ─────────────────────────────────────────────────────────
interface Lesson {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
  terms_count?: number;
  completed_terms?: number;
  progress_percent?: number;
}

interface DashboardCacheData {
  todayGoal: number;
  todayProgress: number;
  recentLessons: Lesson[];
  totalLessonsCount: number;
  userEmail: string;
  userAvatarUrl: string | null;
  user: any;
}

// ── Editorial Design Tokens ───────────────────────────────────────
const ED = {
  bg: '#FAFAF8',
  surf: '#FFFFFF',
  border: '#E5E3DE',
  accent: '#1A8A72',
  accentL: '#E6F5F2',
  text: '#1A1916',
  sub: '#37352F',
  muted: '#9B9790',
  dim: '#D8D5CF',
};

const SANS = Platform.select({
  ios: 'System',
  default: 'normal',
});

const MONO = Platform.select({
  ios: 'Courier New',
  default: 'monospace',
});

// ── Learning Stage Weights ────────────────────────────────────────
const LEARNING_STAGE_WEIGHTS: Record<string, number> = {
  New: 0, Learning: 0.2, Familiar: 0.4, Good: 0.6, Strong: 0.8, Mastered: 1.0,
};
const getStatusWeight = (status: string | null | undefined): number =>
  !status || status === 'New' ? 0 : LEARNING_STAGE_WEIGHTS[status] || 0;

// ── Helpers ───────────────────────────────────────────────────────
const getDayLabel = () => {
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });
  const month = now.toLocaleDateString('en-US', { month: 'long' });
  const date = now.getDate();
  return `${day} · ${month} ${date}`;
};

const getGreeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

// ── Main Component ────────────────────────────────────────────────
export default function LearningDashboardScreen() {
  const [todayGoal, setTodayGoal] = useState(0);
  const [todayProgress, setTodayProgress] = useState(0);
  const [recentLessons, setRecentLessons] = useState<Lesson[]>([]);
  const [totalLessonsCount, setTotalLessonsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);
  const [userEmail, setUserEmail] = useState('User');
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [chatModalVisible, setChatModalVisible] = useState(false);
  const routerNavigation = useRouter();
  const { setLoading: setAppLoading } = useLoading();

  const getUserDisplayName = () =>
    user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const getUserInitial = () => getUserDisplayName().charAt(0).toUpperCase();

  const fetchData = useCallback(async (useCache: boolean = true) => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        if (userError.message?.includes('session missing') || userError.name === 'AuthSessionMissingError') {
          setLoading(false); setIsLoadingFromCache(false); return;
        }
        if (__DEV__) console.error('Error getting user:', userError);
        setLoading(false); setIsLoadingFromCache(false); return;
      }
      if (!user) { setLoading(false); setIsLoadingFromCache(false); return; }

      if (useCache && loading && !refreshing) {
        const cachedData = await loadFromCache<DashboardCacheData>('DASHBOARD');
        if (cachedData) {
          setTodayGoal(cachedData.todayGoal);
          setTodayProgress(cachedData.todayProgress);
          setRecentLessons(cachedData.recentLessons);
          setTotalLessonsCount(cachedData.totalLessonsCount);
          setUserEmail(cachedData.userEmail);
          setUserAvatarUrl(cachedData.userAvatarUrl);
          setUser(cachedData.user);
          setIsLoadingFromCache(true);
          setLoading(false);
        }
      }

      setUser(user);
      setUserEmail(user.email?.split('@')[0] || 'User');
      const avatarPath = user.user_metadata?.avatar_url;
      if (avatarPath) {
        if (avatarPath.startsWith('http')) {
          setUserAvatarUrl(avatarPath);
        } else {
          const { data } = supabase.storage.from('avatars').getPublicUrl(avatarPath);
          setUserAvatarUrl(data.publicUrl);
        }
      } else {
        setUserAvatarUrl(null);
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();
      const todayDateStr = today.toISOString().split('T')[0];

      const { data: dueTermsData } = await supabase
        .from('user_term_progress').select('term_id, status, next_review_at')
        .eq('user_id', user.id)
        .or(`next_review_at.lte.${todayISO},status.eq.New`).limit(1000);

      const { data: allTermsData } = await supabase
        .from('terms').select('id, lesson_id, lessons!inner(id, user_id, deadline)')
        .eq('lessons.user_id', user.id).limit(1000);

      const progressTermIds = new Set<string>();
      dueTermsData?.forEach(item => { if (item.term_id) progressTermIds.add(item.term_id); });

      const todayTermsCount = new Set<string>();
      dueTermsData?.forEach(item => { if (item.term_id) todayTermsCount.add(item.term_id); });
      allTermsData?.forEach(term => { if (!progressTermIds.has(term.id)) todayTermsCount.add(term.id); });

      let calculatedGoal = todayTermsCount.size;
      const { data: lessonsWithDeadline } = await supabase
        .from('lessons').select('id, deadline, terms(id)')
        .eq('user_id', user.id).not('deadline', 'is', null).limit(10);

      if (lessonsWithDeadline && lessonsWithDeadline.length > 0) {
        const now = new Date();
        let totalNewTermsToLearn = 0;
        const allDeadlineTermIds: string[] = [];
        const lessonTermMap = new Map<string, string[]>();
        lessonsWithDeadline.forEach((lesson) => {
          if (lesson.deadline && lesson.terms && lesson.terms.length > 0) {
            const deadline = new Date(lesson.deadline);
            const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            if (daysLeft > 0) {
              const termIds = lesson.terms.map((t: any) => t.id);
              lessonTermMap.set(lesson.id, termIds);
              allDeadlineTermIds.push(...termIds);
            }
          }
        });
        let allDeadlineProgress: any[] = [];
        if (allDeadlineTermIds.length > 0) {
          const { data: progressData } = await supabase
            .from('user_term_progress').select('term_id, status')
            .eq('user_id', user.id).in('term_id', allDeadlineTermIds).limit(1000);
          allDeadlineProgress = progressData || [];
        }
        const progressMap = new Map<string, string>();
        allDeadlineProgress.forEach((p) => progressMap.set(p.term_id, p.status));
        lessonsWithDeadline.forEach((lesson) => {
          if (!lesson.deadline) return;
          const deadline = new Date(lesson.deadline);
          const daysLeft = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 0) return;
          const termIds = lessonTermMap.get(lesson.id) || [];
          if (termIds.length === 0) return;
          let masteredCount = 0;
          termIds.forEach((termId) => { if (progressMap.get(termId) === 'Mastered') masteredCount++; });
          const unmasteredCount = termIds.length - masteredCount;
          if (unmasteredCount <= 0) return;
          const dailyTarget = Math.ceil(unmasteredCount / Math.max(daysLeft, 1));
          totalNewTermsToLearn += Math.min(dailyTarget, unmasteredCount);
        });
        calculatedGoal = Math.max(todayTermsCount.size, totalNewTermsToLearn);
      }

      const finalTodayGoal = Math.max(calculatedGoal, 10);
      setTodayGoal(finalTodayGoal);

      const { data: progressData } = await supabase
        .from('user_daily_progress').select('questions_completed')
        .eq('user_id', user.id).eq('date', todayDateStr).maybeSingle();
      const finalTodayProgress = progressData?.questions_completed || 0;
      setTodayProgress(finalTodayProgress);

      let recentLessonsResult: any = { error: null, data: [] };
      let totalCountResult: any = { error: null, count: 0 };
      try {
        const results = await Promise.all([
          supabase.from('lessons').select('*').eq('user_id', user.id)
            .order('created_at', { ascending: false }).limit(4),
          supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
        ]);
        recentLessonsResult = results[0];
        totalCountResult = results[1];
      } catch (error) {
        if (__DEV__) console.error('Error fetching lessons:', error);
      }

      let finalRecentLessons: Lesson[] = [];
      if (!recentLessonsResult.error) {
        const recentLessonsData = recentLessonsResult.data || [];
        if (recentLessonsData.length > 0) {
          const lessonIds = recentLessonsData.map((l: Lesson) => l.id);
          const { data: allTermsForLessons } = await supabase
            .from('terms').select('id, lesson_id').in('lesson_id', lessonIds);
          const termsByLessonId = new Map<string, { id: string }[]>();
          allTermsForLessons?.forEach((term) => {
            if (!termsByLessonId.has(term.lesson_id)) termsByLessonId.set(term.lesson_id, []);
            termsByLessonId.get(term.lesson_id)?.push(term);
          });
          const allTermIdsForLessons = allTermsForLessons?.map((t) => t.id) || [];
          let allProgressData: any[] = [];
          if (allTermIdsForLessons.length > 0) {
            const { data } = await supabase.from('user_term_progress').select('term_id, status')
              .eq('user_id', user.id).in('term_id', allTermIdsForLessons);
            allProgressData = data || [];
          }
          const progressMap2 = new Map<string, string>();
          allProgressData.forEach((p) => progressMap2.set(p.term_id, p.status));
          const lessonsWithStats = recentLessonsData.map((lesson: Lesson) => {
            const terms = termsByLessonId.get(lesson.id) || [];
            let completedTerms = 0;
            let weightedScore = 0;
            terms.forEach((term) => {
              const status = progressMap2.get(term.id) || null;
              weightedScore += getStatusWeight(status);
              if (status === 'Strong' || status === 'Mastered') completedTerms++;
            });
            return {
              ...lesson,
              terms_count: terms.length,
              completed_terms: completedTerms,
              progress_percent: terms.length > 0 ? Math.round((weightedScore / terms.length) * 100) : 0,
            };
          });
          finalRecentLessons = lessonsWithStats;
          setRecentLessons(lessonsWithStats);
        } else {
          setRecentLessons([]);
        }
      }

      const finalTotalLessonsCount = totalCountResult.error ? 0 : (totalCountResult.count || 0);
      setTotalLessonsCount(finalTotalLessonsCount);

      await saveToCache('DASHBOARD', {
        todayGoal: finalTodayGoal,
        todayProgress: finalTodayProgress,
        recentLessons: finalRecentLessons,
        totalLessonsCount: finalTotalLessonsCount,
        userEmail: user.email?.split('@')[0] || 'User',
        userAvatarUrl,
        user,
      });
      setIsLoadingFromCache(false);
    } catch (error) {
      if (__DEV__) console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) setAppLoading(false);
  }, [loading, setAppLoading]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) { setLoading(false); setAppLoading(false); }
    }, 8000);
    return () => clearTimeout(timeout);
  }, [loading, setAppLoading]);

  useFocusEffect(
    useCallback(() => {
      const checkAndRefresh = async () => {
        try {
          const expired = await isCacheExpired('DASHBOARD');
          if (expired) { fetchData(false); } else { fetchData(true); }
        } catch {
          setLoading(false); setAppLoading(false);
        }
      };
      checkAndRefresh();
    }, [fetchData, setAppLoading])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData(false);
  }, []);

  const progressPercentage = todayGoal > 0 ? Math.min((todayProgress / todayGoal) * 100, 100) : 0;
  const completionRate = Math.round(progressPercentage);
  const remainingCount = Math.max(0, todayGoal - todayProgress);
  const estimatedMinutes = Math.ceil(remainingCount * 1.5);

  // Week grid
  const weekLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const activeDays = Math.min(7, Math.max(0, Math.round((completionRate / 100) * 7)));

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={ED.accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Find a first lesson to study ──────────────────────────────
  const firstStudyLesson = recentLessons[0];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ED.accent} />}
      >
        {/* ── Top bar ─────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View style={{ flex: 1 }}>
            <Text style={styles.topBarDate}>{getDayLabel()}</Text>
            <Text style={styles.topBarGreeting}>
              {getGreeting()}, {getUserDisplayName()}
            </Text>
          </View>
          <View style={styles.streakBadge}>
            <Text style={styles.streakNumber}>{todayProgress}</Text>
            <Text style={styles.streakLabel}>Day Streak</Text>
          </View>
        </View>

        {/* ── Focus Queue ─────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Focus Queue</Text>
          <View style={styles.focusRow}>
            <Text style={styles.focusNumber}>{remainingCount}</Text>
            <Text style={styles.focusSub}>cards due today</Text>
            {estimatedMinutes > 0 && (
              <Text style={styles.focusTime}>~{estimatedMinutes} min</Text>
            )}
          </View>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${completionRate}%` as any }]} />
          </View>
          <View style={styles.progressMeta}>
            <Text style={styles.progressHint}>
              {todayProgress} of {todayGoal} reviewed
            </Text>
            <Text style={styles.progressGoal}>Daily goal: {todayGoal}</Text>
          </View>
          {/* CTA */}
          <TouchableOpacity
            style={[styles.startButton, !firstStudyLesson && styles.startButtonDim]}
            activeOpacity={0.85}
            onPress={() => {
              if (firstStudyLesson) {
                router.push(`/study/${firstStudyLesson.id}` as any);
              } else {
                router.push('/(tabs)/create');
              }
            }}
          >
            <Text style={styles.startButtonText}>
              {firstStudyLesson ? 'Start review →' : 'Create your first set →'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Up Next list ─────────────────────────────────────── */}
        {recentLessons.length > 0 && (
          <View style={styles.upNextSection}>
            <View style={styles.upNextHeader}>
              <Text style={styles.sectionLabel}>Up Next</Text>
              <Text style={styles.upNextMeta}>by lesson</Text>
            </View>
            <View style={styles.deckList}>
              {recentLessons.map((lesson) => {
                const due = Math.max(0, (lesson.terms_count || 0) - (lesson.completed_terms || 0));
                return (
                  <TouchableOpacity
                    key={lesson.id}
                    style={styles.deckCard}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/lessons/${lesson.id}` as any)}
                  >
                    <View style={styles.deckCardContent}>
                      <Text style={styles.deckTopic} numberOfLines={1}>{lesson.name}</Text>
                      {lesson.description ? (
                        <Text style={styles.deckDesc} numberOfLines={1}>{lesson.description}</Text>
                      ) : null}
                    </View>
                    <View style={styles.deckRight}>
                      {due > 0 ? (
                        <Text style={styles.deckDue}>{due} due</Text>
                      ) : (
                        <Text style={styles.deckCaughtUp}>caught up</Text>
                      )}
                      <TouchableOpacity
                        style={styles.deckStudyBtn}
                        activeOpacity={0.8}
                        onPress={(e) => {
                          e.stopPropagation();
                          router.push(`/study/${lesson.id}` as any);
                        }}
                      >
                        <Text style={styles.deckStudyText}>Study →</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Stats grid ──────────────────────────────────────── */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Reviewed', val: String(todayProgress), sub: 'today' },
            { label: 'Accuracy', val: `${completionRate}%`, sub: '7-day avg' },
          ].map((item, i) => (
            <View
              key={item.label}
              style={[styles.statCell, i === 0 && styles.statCellLeft]}
            >
              <Text style={styles.sectionLabel}>{item.label}</Text>
              <Text style={styles.statVal}>{item.val}</Text>
              <Text style={styles.statSub}>{item.sub}</Text>
            </View>
          ))}
        </View>

        {/* ── Empty CTA ─────────────────────────────────────────── */}
        {recentLessons.length === 0 && (
          <TouchableOpacity
            style={styles.emptyCard}
            activeOpacity={0.8}
            onPress={() => router.push('/(tabs)/create')}
          >
            <View>
              <Text style={styles.emptyCardTitle}>Make a new set</Text>
              <Text style={styles.emptyCardSub}>Generate cards from a question or doc</Text>
            </View>
            <Text style={styles.emptyCardPlus}>+</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* ── AI FAB ───────────────────────────────────────────────── */}
      <TouchableOpacity style={styles.fab} onPress={() => setChatModalVisible(true)} activeOpacity={0.8}>
        <View style={styles.fabContainer}>
          <FloatingAIButtonIcon size={64} />
          <View style={styles.fabFaceContainer}>
            <FaceIcon size={34} color="white" />
          </View>
        </View>
      </TouchableOpacity>

      <AIChatModal visible={chatModalVisible} onClose={() => setChatModalVisible(false)} />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ED.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },

  // Top bar
  topBar: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
    backgroundColor: ED.bg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  topBarDate: {
    fontSize: 10,
    color: ED.muted,
    letterSpacing: 0.09 * 10,
    textTransform: 'uppercase',
    fontWeight: '500',
    fontFamily: MONO,
  },
  topBarGreeting: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.025 * 18,
    color: ED.text,
    marginTop: 2,
  },
  streakBadge: {
    alignItems: 'flex-end',
    flexShrink: 0,
  },
  streakNumber: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.03 * 22,
    color: ED.accent,
    lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  streakLabel: {
    fontSize: 9,
    color: ED.muted,
    marginTop: 3,
    letterSpacing: 0.09 * 9,
    textTransform: 'uppercase',
    fontFamily: MONO,
    fontWeight: '500',
  },

  // Focus queue section
  section: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
    backgroundColor: ED.surf,
  },
  sectionLabel: {
    fontSize: 10,
    color: ED.muted,
    letterSpacing: 0.09 * 10,
    textTransform: 'uppercase',
    fontWeight: '500',
    fontFamily: MONO,
    marginBottom: 8,
  },
  focusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 14,
  },
  focusNumber: {
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: -0.04 * 52,
    lineHeight: 56,
    color: ED.text,
  },
  focusSub: {
    fontSize: 13,
    color: ED.muted,
  },
  focusTime: {
    marginLeft: 'auto' as any,
    fontSize: 12,
    color: ED.muted,
  },
  progressTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: ED.dim,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%' as any,
    borderRadius: 2,
    backgroundColor: ED.accent,
  },
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  progressHint: { fontSize: 10, color: ED.muted, fontFamily: MONO },
  progressGoal: { fontSize: 10, color: ED.muted, fontFamily: MONO },
  startButton: {
    marginTop: 16,
    paddingVertical: 13,
    borderRadius: 8,
    backgroundColor: ED.accent,
    alignItems: 'center',
  },
  startButtonDim: { backgroundColor: ED.dim },
  startButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  // Up next
  upNextSection: {
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
  },
  upNextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  upNextMeta: { fontSize: 11, color: ED.muted },
  deckList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  deckCard: {
    backgroundColor: ED.surf,
    borderWidth: 1,
    borderColor: ED.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deckCardContent: { flex: 1, minWidth: 0 },
  deckTopic: {
    fontSize: 13,
    fontWeight: '500',
    color: ED.sub,
  },
  deckDesc: {
    fontSize: 11,
    color: ED.muted,
    marginTop: 2,
  },
  deckRight: { alignItems: 'flex-end', gap: 4 },
  deckDue: {
    fontSize: 11,
    color: ED.accent,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  deckCaughtUp: { fontSize: 11, color: ED.muted },
  deckStudyBtn: { paddingVertical: 2 },
  deckStudyText: {
    fontSize: 11,
    color: ED.accent,
    fontWeight: '600',
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    backgroundColor: ED.surf,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
  },
  statCell: {
    flex: 1,
    padding: 18,
    borderRightWidth: 0,
    borderRightColor: ED.border,
  },
  statCellLeft: {
    borderRightWidth: 1,
  },
  statVal: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.03 * 28,
    lineHeight: 32,
    color: ED.text,
    marginTop: 2,
  },
  statSub: { fontSize: 11, color: ED.muted, marginTop: 4 },

  // Empty card
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: ED.dim,
    borderStyle: 'dashed',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  emptyCardTitle: { fontSize: 13, fontWeight: '600', color: ED.text },
  emptyCardSub: { fontSize: 11, color: ED.muted, marginTop: 2 },
  emptyCardPlus: { fontSize: 18, color: ED.muted },

  // AI FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabContainer: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  fabFaceContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
