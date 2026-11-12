import AIChatModal from '@/components/AIChatModal';
import { EdBase } from '@/components/EdBase';
import { DesignAsset } from '@/components/DesignAsset';
import { CourseRow } from '@/components/ui/CourseRow';
import { DailyGoal } from '@/components/ui/DailyGoal';
import { TodayHero } from '@/components/ui/TodayHero';
import type { MascotMood } from '@/components/mascot/MascotCharacter';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { activityDaysFromProgressUpdates, computeCurrentStreak } from '@/lib/streak';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { colors, componentTokens, layout, type } from '@/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface LessonSummary {
  id: string;
  title: string;
  sub: string;
  cards: number;
  due: number;
  totalDue: number;
  pct: number;
  deadline: string | null;
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

/** Implementation extension: the reference frame only shows the morning greeting. */
function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** Implementation extension: the reference frame reads 23min for 37 due cards. */
const SECONDS_PER_CARD = 37;

/** Today: live learning data in the Figma home composition; course artwork is deferred. */
export default function TodayScreen() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);
  const [username, setUsername] = useState('User');
  const [dailyGoalCards, setDailyGoalCards] = useState(20);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [showAIChat, setShowAIChat] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const visibleLessons = lessons.slice(0, 5);
  const lessonsCount = lessons.length;
  const totalCards = lessons.reduce((sum, lesson) => sum + lesson.cards, 0);
  const totalDue = lessons.reduce((sum, lesson) => sum + lesson.due, 0);
  const hasCourses = totalCards > 0;
  const estimateMinutes = Math.max(1, Math.round((totalDue * SECONDS_PER_CARD) / 60));
  const greeting = greetingForHour(new Date().getHours());
  const initial = Array.from(username)[0]?.toUpperCase() || 'U';

  // The character reacts to where the learner actually stands today.
  const goalMet = dailyGoalCards > 0 && reviewedToday >= dailyGoalCards;
  const mood: MascotMood = !loaded ? 'thinking'
    : totalCards === 0 ? 'onboarding'
    : goalMet ? 'happy'
    : totalDue === 0 ? 'sleepy'
    : 'idle';

  useEffect(() => {
    const loadUserName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const fromMeta = user.user_metadata?.full_name as string | undefined;
      const fromEmail = user.email?.split('@')[0];
      setUsername((fromMeta?.trim() || fromEmail || 'User').trim());
      const goalFromMeta = user.user_metadata?.daily_goal_cards;
      if (typeof goalFromMeta === 'number' && goalFromMeta > 0) {
        setDailyGoalCards(goalFromMeta);
      } else {
        setDailyGoalCards(20);
      }
    };
    loadUserName();
  }, []);

  const fetchLessons = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLessons([]);
      setCurrentStreak(0);
      return;
    }

    // 先从本地缓存加载，立即显示（stale-while-revalidate）
    const cached = await loadFromCache<LessonSummary[]>('DASHBOARD', user.id);
    if (cached && cached.length > 0) {
      setLessons(cached);
    }

    const { data: lessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, name, description, created_at, deadline')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (lessonsError || !lessonsData) {
      setLessons([]);
      setCurrentStreak(0);
      return;
    }

    const lessonIds = lessonsData.map((l) => l.id);
    if (lessonIds.length === 0) {
      setLessons([]);
      setCurrentStreak(0);
      return;
    }

    const { data: termsData } = await supabase
      .from('terms')
      .select('id, lesson_id')
      .in('lesson_id', lessonIds);

    const termIds = termsData?.map((t) => t.id) || [];
    const { data: progressData } = termIds.length
      ? await supabase
          .from('user_term_progress')
          .select('term_id, status, last_reviewed_at')
          .eq('user_id', user.id)
          .in('term_id', termIds)
      : { data: [] as { term_id: string; status: string | null; last_reviewed_at: string | null }[] };

    const progressMap = buildLatestProgressMap(progressData || []);
    const activityDays = activityDaysFromProgressUpdates(progressData || []);
    setCurrentStreak(computeCurrentStreak(activityDays));

    // Count distinct terms reviewed today (last_reviewed_at >= today 00:00 local)
    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);
    const reviewedTodayCount = (progressData || []).filter(
      (p) => p.last_reviewed_at && new Date(p.last_reviewed_at) >= todayMidnight
    ).length;
    setReviewedToday(reviewedTodayCount);

    const termsByLesson = new Map<string, { id: string; lesson_id: string }[]>();
    (termsData || []).forEach((term) => {
      if (!termsByLesson.has(term.lesson_id)) {
        termsByLesson.set(term.lesson_id, []);
      }
      termsByLesson.get(term.lesson_id)?.push(term);
    });

    const nextLessons: LessonSummary[] = lessonsData.map((lesson) => {
      const lessonTerms = termsByLesson.get(lesson.id) || [];
      const cards = lessonTerms.length;
      let weightedScore = 0;

      lessonTerms.forEach((term) => {
        const status = progressMap.get(term.id);
        weightedScore += getStatusWeight(status);
      });

      const reviewed = Math.round(weightedScore);
      const pct = cards > 0 ? Math.round((weightedScore / cards) * 100) : 0;
      const rawDue = Math.max(cards - reviewed, 0);
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);
      const lessonDeadline = lesson.deadline ? new Date(lesson.deadline) : null;
      const isFutureLesson =
        lessonDeadline &&
        !Number.isNaN(lessonDeadline.getTime()) &&
        lessonDeadline > todayEnd;
      let due = rawDue;
      if (isFutureLesson && lessonDeadline) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const daysRemaining = Math.max(
          1,
          Math.floor((lessonDeadline.getTime() - todayStart.getTime()) / msPerDay) + 1
        );
        // 预留复习缓冲天数，避免学习计划卡到 deadline 当天
        const reviewBufferDays = Math.max(1, Math.floor(daysRemaining * 0.2));
        const effectiveStudyDays = Math.max(1, daysRemaining - reviewBufferDays);
        due = Math.ceil(rawDue / effectiveStudyDays);
      }

      return {
        id: lesson.id,
        title: lesson.name || 'Untitled lesson',
        sub: lesson.description || 'No description',
        cards,
        due,
        totalDue: rawDue,
        pct,
        deadline: lesson.deadline ?? null,
      };
    });

    setLessons(nextLessons);
    // 保存到本地，下次打开立即可见
    void saveToCache('DASHBOARD', nextLessons, user.id);
  }, []);

  useEffect(() => {
    fetchLessons().finally(() => setLoaded(true));
  }, [fetchLessons]);

  useFocusEffect(
    useCallback(() => {
      fetchLessons();
    }, [fetchLessons])
  );

  return (
    <EdBase scroll={false} bottomInset={0}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.signature}>
            <View style={styles.greetingRow}>
              <Text accessibilityRole="header" style={styles.greeting}>{greeting}</Text>
              <View accessible={false} pointerEvents="none"><DesignAsset name="rays" /></View>
            </View>
            <Text style={styles.invitation}>A little learning, every day.</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open profile for ${username}`}
            onPress={() => router.push('/you')} style={styles.profile}>
            <Text style={styles.initial}>{initial}</Text>
          </Pressable>
        </View>

        <View style={styles.hero}>
          <TodayHero dueCount={totalDue} mood={mood}
            estimateMinutes={totalDue > 0 ? estimateMinutes : null}
            actionLabel={hasCourses ? 'Start' : 'Create your first course'}
            showPlayIcon={hasCourses}
            onPress={() => router.push(hasCourses ? '/quiz?entry=home' : '/create')} />
        </View>

        <View style={styles.progress}>
          <View style={styles.goal}><DailyGoal completed={reviewedToday} total={dailyGoalCards} /></View>
          <View style={styles.separator} />
          <View accessible accessibilityLabel={`${currentStreak}-day streak`} style={styles.streak}>
            <DesignAsset name="flame" />
            <Text style={styles.streakText}>{currentStreak}-day streak</Text>
          </View>
        </View>

        <View style={styles.courses}>
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Your courses</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`View all ${lessonsCount} courses`}
              onPress={() => router.push('/(tabs)/library')} style={styles.courseCountButton}>
              <Text style={styles.meta}>{lessonsCount} {lessonsCount === 1 ? 'course' : 'courses'}</Text>
            </Pressable>
          </View>
          {visibleLessons.map((lesson) => (
            <CourseRow key={lesson.id} title={lesson.title}
              metadata={`${lesson.due} due · ${lesson.cards} ${lesson.cards === 1 ? 'card' : 'cards'}`}
              onPress={() => router.push(`/lessons/${lesson.id}`)} />
          ))}
          {lessonsCount === 0 && <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Your first course is waiting.</Text>
            <Text style={styles.emptyCopy}>Turn a topic, a note, or a PDF into learning cards.</Text>
          </View>}
          {lessonsCount > visibleLessons.length && <Pressable accessibilityRole="button"
            onPress={() => router.push('/(tabs)/library')} style={styles.secondaryAction}>
            <Text style={styles.secondaryText}>View all courses</Text>
          </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel="Open AI study assistant"
            onPress={() => setShowAIChat(true)} style={styles.secondaryAction}>
            <Text style={styles.secondaryText}>Ask your study assistant</Text>
          </Pressable>
        </View>
      </ScrollView>
      <AIChatModal visible={showAIChat} onClose={() => setShowAIChat(false)} />
    </EdBase>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: layout.sectionBottom },
  header: { paddingHorizontal: layout.heroInline, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  signature: { flexShrink: 1 },
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3 },
  greeting: { ...type.dailyGreeting, color: colors.text },
  invitation: { ...type.dailyInvitation, color: colors.supporting },
  profile: { width: componentTokens.profile.size, height: componentTokens.profile.size, borderRadius: componentTokens.profile.borderRadius, backgroundColor: componentTokens.profile.backgroundColor, alignItems: 'center', justifyContent: 'center' },
  initial: { ...componentTokens.profile.label, color: colors.text },
  hero: { paddingHorizontal: layout.heroInline, paddingTop: layout.heroTop, paddingBottom: 12 },
  progress: { paddingHorizontal: layout.listInline, paddingTop: 2, paddingBottom: layout.goalBottom, flexDirection: 'row', alignItems: 'flex-end', gap: layout.goalInline },
  goal: { flex: 1, minWidth: 0 },
  separator: { width: 1, height: 42, backgroundColor: colors.border },
  streak: { alignItems: 'center', gap: 5 },
  streakText: { ...type.streak, color: colors.text },
  courses: { paddingHorizontal: layout.listInline },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, paddingBottom: 10 },
  sectionTitle: { ...type.section, color: colors.text },
  courseCountButton: { minHeight: 44, justifyContent: 'center' },
  meta: { ...type.meta, color: colors.muted },
  empty: { paddingVertical: 20, gap: 8 },
  emptyTitle: { ...type.courseTitle, color: colors.text },
  emptyCopy: { ...type.meta, color: colors.muted },
  secondaryAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 12 },
  secondaryText: { ...type.meta, color: colors.sub },
});
