import { EdBase } from '@/components/EdBase';
import { MemqBuddy } from '@/components/MemqBuddy';
import { DesignAsset } from '@/components/DesignAsset';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { loadFromCache, saveToCache } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { colors, componentTokens, fonts, layout, radius, type } from '@/theme';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

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
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(windowWidth);
  const columns = listWidth < 350 || fontScale > 1.3 ? 1 : 2;
  const cardWidth = (listWidth - layout.screenInline * 2 - (columns - 1) * componentTokens.libraryCard.gridGap) / columns;
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

  useFocusEffect(
    useCallback(() => {
      fetchLessons();
    }, [fetchLessons])
  );

  const summary = useMemo(() => {
    const cards = lessons.reduce((sum, lesson) => sum + lesson.cards, 0);
    const due = lessons.reduce((sum, lesson) => sum + lesson.due, 0);
    return { lessons: lessons.length, cards, due };
  }, [lessons]);

  return (
    <EdBase bottomInset={0} scroll={false}>
      <View style={styles.list} onLayout={(event) => setListWidth(event.nativeEvent.layout.width)}>
      <FlatList
        key={columns}
        data={lessons}
        numColumns={columns}
        keyExtractor={(lesson) => lesson.id}
        contentContainerStyle={styles.content}
        columnWrapperStyle={columns === 2 ? styles.gridRow : undefined}
        ItemSeparatorComponent={() => <View style={styles.gridSeparator} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={<View>
          <View style={styles.introduction}>
            <Text accessibilityRole="header" style={styles.title}>Your library</Text>
            <Text style={styles.subtitle}>
              <Text style={styles.summaryNumber}>{summary.lessons}</Text> {summary.lessons === 1 ? 'lesson' : 'lessons'} · <Text style={styles.summaryNumber}>{summary.cards}</Text> {summary.cards === 1 ? 'card' : 'cards'} · <Text style={styles.summaryNumber}>{summary.due}</Text> to review
            </Text>
          </View>
          <View style={styles.sectionHeading}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>All Lessons</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Create a new lesson"
              onPress={() => router.push('/create')} style={styles.newLesson}>
              <Text style={styles.newLessonLabel}>+ New lesson</Text>
            </Pressable>
          </View>
        </View>}
        renderItem={({ item }) => <LessonGridCard lesson={item} width={cardWidth} fontScale={fontScale} />}
        ListEmptyComponent={<View style={styles.empty}>
          <MemqBuddy size={82} mood="curious" />
          <Text style={styles.emptyTitle}>A fresh page.</Text>
          <Text style={styles.emptyCopy}>Start with one topic you want to remember.</Text>
          <PrimaryButton label="Make your first lesson" onPress={() => router.push('/create')} />
        </View>}
      />
      </View>
    </EdBase>
  );
}

function LessonGridCard({ lesson, width, fontScale }: { lesson: LessonSummary; width: number; fontScale: number }) {
  return (
    <Pressable accessibilityRole="button"
      accessibilityLabel={`${lesson.title}. ${lesson.cards} ${lesson.cards === 1 ? 'card' : 'cards'}. ${lesson.pct} percent mastered. ${lesson.due} to review.`}
      accessibilityHint="Opens lesson details"
      onPress={() => router.push(`/lessons/${lesson.id}`)}
      style={({ pressed }) => [styles.card, { width }, pressed && styles.cardPressed]}>
      <View style={styles.cardHeading}>
        <Text style={[styles.cardTitle, { minHeight: 38 * fontScale }]}>{lesson.title}</Text>
        <View accessible={false} style={styles.chevron}><DesignAsset name="libraryChevron" /></View>
      </View>
      <Text style={[styles.description, { minHeight: 53 * fontScale }]}>{lesson.sub}</Text>
      <View style={styles.cardSummary}>
        <Text style={styles.cardCount}>{lesson.cards} {lesson.cards === 1 ? 'card' : 'cards'}</Text>
        <Text style={styles.percentage}>{lesson.pct}%</Text>
      </View>
      <Text style={styles.review}>{lesson.due > 0 ? `${lesson.due} to review today` : 'All caught up'}</Text>
      <View accessible={false} style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, lesson.pct))}%` }]} />
      </View>
    </Pressable>
  );
}

const card = componentTokens.libraryCard;
const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: layout.screenInline, paddingTop: 24, paddingBottom: 16 },
  introduction: { gap: 6, marginBottom: 12 },
  title: { ...type.page, color: colors.text },
  subtitle: { ...type.bodyReading, color: colors.text },
  sectionHeading: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  sectionTitle: { ...type.section, color: colors.text, flexShrink: 1 },
  newLesson: { minHeight: 44, justifyContent: 'center' },
  newLessonLabel: { ...type.controlLink, color: colors.text },
  gridRow: { gap: card.gridGap, alignItems: 'stretch' },
  gridSeparator: { height: 8 },
  card: { minHeight: card.minHeight, padding: card.padding, gap: card.gap, borderWidth: 1, borderColor: colors.border, borderRadius: card.borderRadius, backgroundColor: colors.bg },
  cardPressed: { backgroundColor: colors.surfaceSubtle },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  cardTitle: { ...type.courseTitle, color: colors.text, flex: 1 },
  chevron: { paddingTop: 1 },
  description: { ...type.meta, color: colors.supporting, flexGrow: 1 },
  cardSummary: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  cardCount: { ...type.meta, color: colors.muted },
  percentage: { ...type.meta, color: colors.supporting },
  review: { ...type.meta, color: colors.supporting },
  track: { height: card.progressHeight, borderRadius: radius.pill, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.action },
  summaryNumber: { fontFamily: fonts.bold },
  empty: { paddingVertical: 24, gap: 12 },
  emptyTitle: { ...type.section, color: colors.text },
  emptyCopy: { ...type.bodyReading, color: colors.supporting },
});
