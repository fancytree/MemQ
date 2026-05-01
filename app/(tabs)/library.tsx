import { EdBase } from '@/components/EdBase';
import { SectionLabel } from '@/components/SectionLabel';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { supabase } from '@/lib/supabase';
import { colors, fonts } from '@/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface LessonSummary {
  id: string;
  title: string;
  sub: string;
  cards: number;
  due: number;
  pct: number;
}

type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';

const LEARNING_STAGE_WEIGHTS: Record<LearningStage, number> = {
  New: 0,
  Learning: 0.2,
  Familiar: 0.4,
  Good: 0.6,
  Strong: 0.8,
  Mastered: 1.0,
};

const getStatusWeight = (status?: LearningStage | null): number => {
  if (!status) return LEARNING_STAGE_WEIGHTS.New;
  return LEARNING_STAGE_WEIGHTS[status] ?? LEARNING_STAGE_WEIGHTS.New;
};

export default function LibraryScreen() {
  const [lessons, setLessons] = useState<LessonSummary[]>([]);

  const fetchLessons = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      setLessons([]);
      return;
    }

    // 先从本地缓存加载，立即显示（stale-while-revalidate）
    const cached = await loadFromCache<LessonSummary[]>('LESSONS', user.id);
    if (cached && cached.length > 0) {
      setLessons(cached);
    }

    const { data: lessonsData, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, name, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (lessonsError || !lessonsData) {
      setLessons([]);
      return;
    }

    const lessonIds = lessonsData.map((l) => l.id);
    if (lessonIds.length === 0) {
      setLessons([]);
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
        const status = progressMap.get(term.id) as LearningStage | null | undefined;
        weightedScore += getStatusWeight(status);
      });

      // 与 lesson 详情页保持一致：使用加权进度，并用 round 后的 reviewed 计算 due
      const pct = cards > 0 ? Math.round((weightedScore / cards) * 100) : 0;
      const reviewedCount = Math.round(weightedScore);
      const due = Math.max(cards - reviewedCount, 0);

      return {
        id: lesson.id,
        title: lesson.name || 'Untitled lesson',
        sub: lesson.description || 'No description',
        cards,
        due,
        pct,
      };
    });

    setLessons(nextLessons);
    // 保存到本地，下次打开立即可见
    void saveToCache('LESSONS', nextLessons, user.id);
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  useFocusEffect(
    useCallback(() => {
      fetchLessons();
    }, [fetchLessons])
  );

  const summaryStats: { v: string; l: string }[] = useMemo(() => {
    const lessonsCount = lessons.length;
    const cardsCount = lessons.reduce((sum, lesson) => sum + lesson.cards, 0);
    const dueCount = lessons.reduce((sum, lesson) => sum + lesson.due, 0);
    return [
      { v: String(lessonsCount), l: 'lessons' },
      { v: String(cardsCount), l: 'cards' },
      { v: String(dueCount), l: 'to review' },
    ];
  }, [lessons]);

  return (
    <EdBase>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={styles.title}>Library</Text>
        <Pressable onPress={() => router.push('/create')}>
          <Text style={styles.linkAccent}>Add new</Text>
        </Pressable>
      </View>

      {/* Stats summary */}
      <View style={styles.statsRow}>
        {summaryStats.map((s, i) => (
          <View
            key={s.l}
            style={[styles.statCell, i < summaryStats.length - 1 && styles.statCellBorder]}
          >
            <Text style={styles.statVal}>{s.v}</Text>
            <SectionLabel size={11} style={styles.statLabel}>{s.l}</SectionLabel>
          </View>
        ))}
      </View>

      {/* Lesson rows */}
      <View style={styles.section}>
        <View style={{ paddingHorizontal: 4, paddingBottom: 10 }}>
          <SectionLabel size={12} style={{ fontFamily: 'JetBrainsMono_500', fontWeight: '400' }}>All Lessons</SectionLabel>
        </View>
        <View style={{ gap: 8 }}>
          {lessons.map((d) => (
            <LessonRow key={d.id} lesson={d} />
          ))}
        </View>
      </View>
    </EdBase>
  );
}

function LessonRow({ lesson: d }: { lesson: LessonSummary }) {
  return (
    <Pressable onPress={() => router.push(`/lessons/${d.id}`)} style={styles.lessonCard}>
      <View style={styles.lessonTitleRow}>
        <Text style={styles.lessonTitle}>{d.title}</Text>
        <Text style={[styles.dueLabel, { color: d.due > 0 ? colors.accent : colors.muted }]}>
          {d.due > 0 ? 'review today' : 'caught up'}
        </Text>
      </View>
      <Text style={styles.lessonSub}>{d.sub}</Text>
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
    fontFamily: 'JetBrainsMono_800',
    fontSize: 24, fontWeight: '400', letterSpacing: -0.5, color: colors.text,
  },
  linkAccent: { fontSize: 13, letterSpacing: -0.1, color: colors.accent, fontFamily: 'JetBrainsMono_700' },

  statsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surf,
  },
  statCell:       { flex: 1, paddingHorizontal: 20, paddingVertical: 20 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: colors.border },
  statVal: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 26, letterSpacing: -0.1, color: colors.text, lineHeight: 26, paddingTop: 2,
  },
  statLabel: {
    marginTop: 0,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    letterSpacing: -0.1,
    lineHeight: 15,
  },

  section: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 24 },

  lessonCard: {
    backgroundColor: colors.surf,
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  lessonTitleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  lessonTitle: {
    flex: 1,
    fontFamily: 'JetBrainsMono_700',
    fontSize: 16, lineHeight: 22, fontWeight: '400', letterSpacing: -0.1, color: colors.text,
  },
  dueLabel: { fontSize: 12, fontWeight: '400', letterSpacing: -0.1, fontFamily: 'JetBrainsMono_600' },
  lessonSub:  {
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: -0.1,
    color: colors.muted,
    marginTop: 3,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },

  progressRow:   { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  progressTrack: { flex: 1, height: 2, borderRadius: 1, backgroundColor: colors.dim, overflow: 'hidden' },
  progressFill:  { height: '100%', backgroundColor: colors.accent },
  cardsLabel:    { fontSize: 11, color: colors.muted, width: 60, textAlign: 'right', fontFamily: fonts.grotesk },
  pctLabel:      { fontSize: 11, color: colors.text, fontWeight: '700', width: 30, textAlign: 'right', fontFamily: fonts.grotesk },
});
