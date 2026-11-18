import { Card } from '@/components/ui/Card';
import { LanguageBadge } from '@/components/LanguageBadge';
import { LessonCover } from '@/components/LessonCover';
import { dialog } from '@/lib/dialog';
import { fonts } from '@/theme/typography';
import { HomeAsset } from '@/components/HomeAsset';
import { Icon } from '@/components/ui/Icon';
import { sheet } from '@/theme/sheet';
import { BackButton, RoundAction } from '@/components/ui/RoundButtons';
import { LinearGradient } from 'expo-linear-gradient';
import TermCard from '@/components/TermCard';
import { LanguageCardModal } from '@/components/LanguageCardModal';
import { Button } from '@/components/ui/Button';
import { FilterMenu, type FilterOption } from '@/components/ui/FilterMenu';
import { SearchField } from '@/components/ui/SearchField';
import { TapTarget } from '@/components/ui/TapTarget';
import { isCacheExpired, loadFromCache, saveToCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { callAI } from '@/lib/aiUsage';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { space, colors, layout, radius, type } from '@/theme';
import { useNavigation } from 'expo-router/react-navigation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MascotState } from '@/components/mascot/MascotState';
import { StageBar } from '@/components/stats/ProgressCharts';
import { CountUp } from '@/components/motion/Grow';
import { stageCounts } from '@/lib/reviewStats';
import { MascotLoading } from '@/components/mascot/MascotLoading';

// 课程类型定义
interface Lesson {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
  learning_mode?: 'language' | 'knowledge';
  cover_style?: string | null;
}

// 学习阶段类型
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

// 词条类型定义
interface Term {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
  language_data?: unknown;
  created_at: string;
  user_term_progress?: Array<{
    status: LearningStage;
  }>;
}

// Lesson 详情缓存数据类型
interface LessonDetailCacheData {
  lesson: Lesson;
  terms: Term[];
  questionsCount: number;
}

// Expo Router 的 options 导出
export const options = {
  headerShown: false,
};

export default function LessonDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [questionsCount, setQuestionsCount] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);
  /** What went wrong, as the screen says it. `missing` is the ordinary one — the
   *  lesson is gone, or the link is to someone else's — and reads differently
   *  from a load that failed, which is worth trying again. */
  const [error, setError] = useState<'missing' | 'failed' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<'All' | LearningStage>('All');
  const [openTerm, setOpenTerm] = useState<Term | null>(null);

  // 动态设置导航栏隐藏（使用自定义 header）
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
      header: () => null,
      headerBackVisible: false,
    });
  }, [navigation]);

  // 获取课程详情（提取为独立函数以便重新调用）
  const fetchLessonDetail = useCallback(async (useCache: boolean = true) => {
    if (!id) {
      setError('missing');
      setLoading(false);
      setIsLoadingFromCache(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('failed');
        setLoading(false);
        setIsLoadingFromCache(false);
        return;
      }

      // 如果使用缓存且正在初始加载，先尝试从缓存加载
      if (useCache && loading && !isLoadingFromCache) {
        const cachedData = await loadFromCache<LessonDetailCacheData>('LESSON_DETAIL', id);
        if (cachedData) {
          setLesson(cachedData.lesson);
          setTerms(cachedData.terms);
          setQuestionsCount(cachedData.questionsCount);
          setIsLoadingFromCache(true);
          setLoading(false);
          // 继续在后台获取最新数据，不设置 loading 状态
        }
      }

      // 并行查询课程信息和词条
      const [lessonResult, termsResult] = await Promise.all([
        // 查询课程信息
        supabase
          .from('lessons')
          .select('*')
          .eq('id', id)
          .eq('user_id', user.id)
          .single(),
        // 查询词条
        supabase
          .from('terms')
          .select('*')
          .eq('lesson_id', id)
          .order('created_at', { ascending: false }),
      ]);

      // 处理课程信息
      if (lessonResult.error) {
        // PGRST116 is "no rows": the lesson has been deleted, or the link is to
        // someone else's. That is not a failure — it is an outcome this screen is
        // built for, and it has a face. Logging it as an error put a red banner
        // over that face every time, for something nothing had gone wrong with.
        const missing = lessonResult.error.code === 'PGRST116';
        if (!missing) console.error('Error fetching lesson:', lessonResult.error);
        setError(missing ? 'missing' : 'failed');
        setLoading(false);
        return;
      }

      if (!lessonResult.data) {
        setError('missing');
        setLoading(false);
        return;
      }

      setLesson(lessonResult.data);

      // 处理词条
      let finalProcessedTerms: Term[] = [];
      if (termsResult.error) {
        console.error('Error fetching terms:', termsResult.error);
        setTerms([]);
      } else {
        const termsData = termsResult.data || [];

        // 如果有词条，查询用户进度
        if (termsData.length > 0) {
          const termIds = termsData.map((t) => t.id);
          const { data: progressData } = await supabase
            .from('user_term_progress')
            .select('term_id, status, last_reviewed_at')
            .eq('user_id', user.id)
            .in('term_id', termIds);

          // 统一取每个 term 的最新状态，避免与列表页顺序不一致
          const progressMap = buildLatestProgressMap(progressData || []);

          // 合并词条和进度数据
          const processedTerms = termsData.map((term) => ({
            ...term,
            user_term_progress: progressMap.has(term.id)
              ? [{ status: progressMap.get(term.id) }]
              : [],
          }));

          finalProcessedTerms = processedTerms;
          setTerms(processedTerms);
        } else {
          setTerms([]);
        }
      }

      // 检查并统计问题数量
      let finalQuestionsCount = 0;
      if (termsResult.data && termsResult.data.length > 0) {
        const termIds = termsResult.data.map((t) => t.id);
        const { data: questionsData, error: questionsError } = await supabase
          .from('questions')
          .select('id')
          .in('term_id', termIds);

        if (!questionsError && questionsData) {
          finalQuestionsCount = questionsData.length;
          setQuestionsCount(questionsData.length);
        } else {
          setQuestionsCount(0);
        }
      } else {
        setQuestionsCount(0);
      }

      // 保存数据到缓存（使用已处理好的数据）
      const cacheData: LessonDetailCacheData = {
        lesson: lessonResult.data,
        terms: finalProcessedTerms,
        questionsCount: finalQuestionsCount,
      };
      await saveToCache('LESSON_DETAIL', cacheData, id);
      setIsLoadingFromCache(false);
      setLoading(false);
    } catch (err) {
      console.error('Error:', err);
      setError('failed');
      // 如果从缓存加载失败，且没有缓存数据，则保持默认值
      if (!useCache || (lesson === null && terms.length === 0)) {
        // 不重置数据，保持当前状态
      }
      setLoading(false);
      setIsLoadingFromCache(false);
    }
  }, [id, loading, isLoadingFromCache]);

  // 组件挂载时获取数据（先尝试从缓存加载）
  useEffect(() => {
    fetchLessonDetail(true);
  }, [id]);

  // 页面重新获得焦点时刷新数据（如果缓存过期）
  useFocusEffect(
    useCallback(() => {
      if (id && !loading) {
        // 只在页面已经加载完成后才检查缓存
        // 避免与 useEffect 的初始加载冲突
        const checkAndRefresh = async () => {
          const expired = await isCacheExpired('LESSON_DETAIL', id);
          if (expired) {
            // 缓存过期，在后台刷新（不显示 loading）
            fetchLessonDetail(false);
          }
        };
        checkAndRefresh();
      }
    }, [id, loading])
  );

  // 格式化日期
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  // 处理开始学习
  const handleStartStudy = () => {
    if (!id) return;
    router.push(`/quiz?entry=lesson&lessonId=${id}`);
  };

  // 处理生成题目
  const handleGenerateQuestions = async () => {
    if (!id || terms.length === 0) {
      dialog('Error', 'No terms available to generate questions');
      return;
    }

    setGenerating(true);
    try {
      // 准备 terms 数据
      const termsList = terms.map((term) => ({
        id: term.id,
        term: term.term,
        definition: term.definition,
        explanation: term.explanation,
        language_data: term.language_data,
      }));

      // 调用 Supabase Edge Function
      // Through `callAI`, so that a "no" from the server — there is a ceiling on how
      // many sets a day — arrives as its own sentence rather than a status code.
      const data = await callAI<{ success?: boolean; questionsGenerated?: number }>(
        lesson?.learning_mode === 'language' ? 'generate-vocab-questions' : 'generate-questions',
        { lessonId: id, terms: termsList }, 'Failed to generate questions',
      );

      if (data && data.success) {
        dialog('Success', `Successfully generated ${data.questionsGenerated || 0} questions!`);

        // 重新加载页面数据以显示新生成的问题
        await fetchLessonDetail();
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      dialog('Error', errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  // 处理编辑/添加词条（从详情页进入，不带 fromCreate 参数）
  const handleEditTerms = () => {
    router.push({
      pathname: `/lessons/[id]/add-terms`,
      params: { id },
    } as any);
  };

  // 返回列表页
  const handleGoBack = () => {
    safeBack('/(tabs)/library');
  };

  // 处理编辑词条
  const handleEditTerm = (termId: string) => {
    if (lesson?.learning_mode === 'language') return;
    // 跳转到 Add Terms 页面，带上 termId 参数用于编辑
    router.push({
      pathname: `/lessons/[id]/add-terms`,
      params: { id, termId },
    } as any);
  };

  // 处理删除词条
  const handleDeleteTerm = (termId: string, termName: string) => {
    dialog(
      'Delete card?',
      `Are you sure you want to delete "${termName}"?`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('terms')
                .delete()
                .eq('id', termId);

              if (error) {
                console.error('Error deleting term:', error);
                dialog('Error', 'Failed to delete card');
                return;
              }

              setOpenTerm(null);
              // 重新加载数据
              await fetchLessonDetail(false);
            } catch (err) {
              console.error('Error:', err);
              dialog('Error', 'Something went wrong');
            }
          },
        },
      ]
    );
  };

  // 过滤词条
  const filteredTerms = terms.filter((term) => {
    // 搜索过滤：匹配 term 或 definition
    const matchesSearch =
      searchQuery.trim() === '' ||
      term.term.toLowerCase().includes(searchQuery.toLowerCase()) ||
      term.definition.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (term.explanation &&
        term.explanation.toLowerCase().includes(searchQuery.toLowerCase()));

    // 级别过滤
    const matchesFilter =
      filterLevel === 'All' ||
      (term.user_term_progress &&
        term.user_term_progress.length > 0 &&
        term.user_term_progress[0].status === filterLevel) ||
      (filterLevel === 'New' &&
        (!term.user_term_progress || term.user_term_progress.length === 0));

    return matchesSearch && matchesFilter;
  });

  /** What the filter menu offers. A card with no progress row has never been seen,
   *  which is what New means here, so the counts follow the same rule the filter
   *  above does rather than a second one that can drift from it. */
  const levelOptions: FilterOption<'All' | LearningStage>[] = [
    { id: 'All', label: 'All levels', count: terms.length },
    ...(Object.keys(LEARNING_STAGE_WEIGHTS) as LearningStage[]).map((stage) => ({
      id: stage,
      label: stage,
      count: terms.filter((term) => (term.user_term_progress?.[0]?.status ?? 'New') === stage).length,
    })),
  ];

  // 加载中
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <MascotLoading label="Opening your lesson…" />
      </SafeAreaView>
    );
  }

  // 错误状态
  if (error || !lesson) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <MascotState kind="error" width={156} />
          <Text style={styles.errorTitle}>
            {error === 'failed' ? 'Couldn’t load this lesson' : 'Lesson not found'}
          </Text>
          <Text style={styles.errorText}>
            {error === 'failed'
              ? 'Check your connection and try again.'
              : 'It may have been deleted, or the link points somewhere else.'}
          </Text>
          <Button size="md" label="Back to lessons" onPress={handleGoBack} />
        </View>
      </SafeAreaView>
    );
  }

  const formattedDeadline = formatDate(lesson.deadline);
  const totalCards = terms.length;
  const weightedScore = terms.reduce((sum, term) => {
    const status = term.user_term_progress?.[0]?.status;
    return sum + getStatusWeight(status);
  }, 0);
  const progressPct = totalCards > 0 ? Math.round((weightedScore / totalCards) * 100) : 0;
  const masteredCount = terms.filter(
    (term) => term.user_term_progress?.[0]?.status === 'Mastered'
  ).length;

  return (
    <View style={styles.container}>
      <LinearGradient pointerEvents="none" colors={[colors.limePale, colors.limeBright, colors.bg]} locations={[0, 0.45, 1]} style={styles.headerGradient} />
      <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
        {/* Top nav */}
        <View style={styles.nav}>
          <BackButton onPress={handleGoBack} label="Back to Library" />
          <RoundAction icon="edit" label="Edit lesson"
            onPress={() => router.push(`/lessons/${id}/settings` as any)} />
        </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: space[6] + insets.bottom }]}
      >

        <Card gap={space[5]}>
          <View style={styles.identity}>
            <View style={styles.identityHeading}><LessonCover id={lesson.id} mode={lesson.learning_mode} coverStyle={lesson.cover_style} width={72} height={72} />
            <View style={styles.titleCopy}>
              <View style={styles.titleRow}>
                <Text accessibilityRole="header" style={styles.lessonTitle}>{lesson.name}</Text>
                {lesson.learning_mode === 'language' && <LanguageBadge labelled />}
              </View>
            </View></View>
            {!!lesson.description && <Text style={styles.lessonDescription}>{lesson.description}</Text>}
          </View>
          {/* The same picture of where the cards stand as the You page draws for all
              of them: how many are mastered, and the rest by stage. */}
          <View style={styles.stageBlock}>
            <View style={styles.masteryLine}>
              <Text style={styles.masteredLine}><CountUp value={masteredCount} style={styles.masteredNumber} /> of {totalCards} mastered</Text>
              <Text style={styles.masteredLine}>Progress <Text style={styles.masteryValue}>{progressPct}%</Text></Text>
            </View>
            <StageBar counts={stageCounts(terms.map((term) => term.id), new Map(terms.map((term) => [term.id, term.user_term_progress?.[0]?.status ?? null])))} />
          </View>
          <Button label="Start review" disabled={totalCards === 0} onPress={handleStartStudy}
            icon={<View style={styles.playIcon}><HomeAsset name="play" height={16} /></View>} />
        </Card>

        <View style={styles.termsSection}>
          <View style={styles.controls}>
            <View style={styles.sectionHead}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Cards</Text>
              <TapTarget accessibilityLabel="Add cards" onPress={handleEditTerms} style={styles.addTerm}>
                <Icon name="plus" size={18} color={colors.action} /><Text style={styles.sectionAction}>Add cards</Text>
              </TapTarget>
            </View>
            <View style={styles.searchRow}>
              <FilterMenu label="Filter by level" options={levelOptions} value={filterLevel} onChange={setFilterLevel} />
              <SearchField label="Search cards" value={searchQuery} onChangeText={setSearchQuery} autoCorrect={false} />
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.resultCount}>Showing {filteredTerms.length} of {totalCards} cards</Text>
            </View>
          </View>

          {/* 词条列表 */}
          {filteredTerms.length === 0 ? (
            <View style={styles.emptyTermsContainer}>
              <MascotState kind={searchQuery || filterLevel !== 'All' ? 'noResults' : 'empty'} width={156} />
              <Text style={styles.emptyTermsTitle}>
                {searchQuery || filterLevel !== 'All'
                  ? 'No matching cards'
                  : 'No cards yet'}
              </Text>
              <Text style={styles.emptyTermsText}>
                {searchQuery || filterLevel !== 'All'
                  ? 'Try another word or level.'
                  : 'Add a few to start learning.'}
              </Text>
              {!searchQuery && filterLevel === 'All' && (
              <Button size="md" label="Add cards" onPress={handleEditTerms} />
              )}
            </View>
          ) : (
            <View style={styles.termsList}>
              {filteredTerms.map((term) => {
                // 获取学习进度状态（如果没有进度记录，默认为 'New'）
                const progressStatus: LearningStage =
                  term.user_term_progress && term.user_term_progress.length > 0
                    ? term.user_term_progress[0].status
                    : 'New';

                return (
                  <TermCard
                    key={term.id}
                    term={term}
                    isLanguage={lesson.learning_mode === 'language'}
                    onOpen={() => setOpenTerm(term)}
                    status={progressStatus}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>

      <LanguageCardModal term={openTerm} onClose={() => setOpenTerm(null)} isLanguage={lesson.learning_mode === 'language'}
        onEdit={openTerm && lesson.learning_mode !== 'language' ? () => handleEditTerm(openTerm.id) : undefined}
        onDelete={openTerm ? () => handleDeleteTerm(openTerm.id, openTerm.term) : undefined} />


    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeAreaTop: { flex: 1 },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 450 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[10] },
  errorTitle: { ...type.heading, fontFamily: fonts.bold, color: colors.text, marginTop: space[4], marginBottom: space[2] },
  errorText: { ...type.small, color: colors.sub, textAlign: 'center', marginBottom: space[6] },
  // The empty and error states' one button, lipped the way Library's are.
  nav: { paddingHorizontal: layout.screenInline, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: layout.screenInline, paddingTop: space[3], gap: space[6] },
  identity: { gap: space[3] },
  identityHeading: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  titleCopy: { gap: space[1], flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  lessonTitle: { ...type.title, color: colors.sub, flexShrink: 1 },
  lessonMetadata: { ...type.caption, color: colors.sub },
  lessonDescription: { ...type.small, color: colors.sub },
  stageBlock: { gap: space[3] },
  masteryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  masteredLine: { ...type.small, fontFamily: fonts.medium, color: colors.faint },
  masteredNumber: { ...type.page, color: colors.sub },
  masteryValue: { ...type.small, fontFamily: fonts.display, color: colors.text },
  playIcon: { transform: [{ rotate: '90deg' }, { scale: 0.7 }] },
  termsSection: { gap: space[4] },
  controls: { gap: space[2] },
  sectionHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...type.heading, fontFamily: fonts.bold, color: colors.text },
  // Drawn the way Library's "New lesson" is: the section's way to add more, in the
  // primary colour.
  addTerm: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: space[1] },
  sectionAction: { ...type.small, fontFamily: fonts.semibold, color: colors.action },
  // The filter and the field share a row, the way the library's do.
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: space[2] },
  resultCount: { ...type.caption, color: colors.sub },
  emptyTermsContainer: { alignItems: 'center', paddingVertical: space[6], gap: space[3] },
  emptyTermsTitle: { ...type.heading, fontFamily: fonts.bold, color: colors.text },
  emptyTermsText: { ...type.small, color: colors.sub, textAlign: 'center' },
  termsList: { gap: space[4] },
  // Filter Modal Styles (iOS bottom sheet style)
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalOverlayBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
  },
  // No rule under the title: the gap does that work, as on every other sheet.
  // Filter Option Colors (matching LessonStatsCard)
});

