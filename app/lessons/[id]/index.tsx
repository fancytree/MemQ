import { LessonCover } from '@/components/LessonCover';
import { fonts } from '@/theme/typography';
import { DesignAsset } from '@/components/DesignAsset';
import { HomeAsset } from '@/components/HomeAsset';
import { Icon } from '@/components/Icon';
import { homeColors } from '@/theme/colors';
import { sheet } from '@/theme/sheet';
import { LinearGradient } from 'expo-linear-gradient';
import TermCard from '@/components/TermCard';
import { LanguageCardModal } from '@/components/LanguageCardModal';
import { Button } from '@/components/ui/Button';
import { isCacheExpired, loadFromCache, saveToCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { buildLatestProgressMap } from '@/lib/termProgress';
import { colors, componentTokens, layout, radius, type } from '@/theme';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router/react-navigation';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState<'All' | LearningStage>('All');
  const [showFilterModal, setShowFilterModal] = useState(false);
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
      setError('Lesson ID is required');
      setLoading(false);
      setIsLoadingFromCache(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
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
        console.error('Error fetching lesson:', lessonResult.error);
        if (lessonResult.error.code === 'PGRST116') {
          setError('Lesson not found');
        } else {
          setError('Failed to load lesson');
        }
        setLoading(false);
        return;
      }

      if (!lessonResult.data) {
        setError('Lesson not found');
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
      setError('Something went wrong');
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
      Alert.alert('Error', 'No terms available to generate questions');
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
      const { data, error } = await supabase.functions.invoke(
        lesson?.learning_mode === 'language' ? 'generate-vocab-questions' : 'generate-questions', {
        body: {
          lessonId: id,
          terms: termsList,
        },
      });

      if (error) {
        console.error('Error generating questions:', error);
        throw new Error(error.message || 'Failed to generate questions');
      }

      if (data && data.success) {
        Alert.alert('Success', `Successfully generated ${data.questionsGenerated || 0} questions!`);

        // 重新加载页面数据以显示新生成的问题
        await fetchLessonDetail();
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (err) {
      console.error('Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      Alert.alert('Error', errorMessage);
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
    Alert.alert(
      'Delete Term',
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
                Alert.alert('Error', 'Failed to delete term');
                return;
              }

              setOpenTerm(null);
              // 重新加载数据
              await fetchLessonDetail(false);
            } catch (err) {
              console.error('Error:', err);
              Alert.alert('Error', 'Something went wrong');
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

  // 加载中
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentText} />
          <Text style={styles.loadingText}>Loading lesson...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 错误状态
  if (error || !lesson) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.errorContainer}>
          <Feather name="alert-circle" size={48} color={colors.red} />
          <Text style={styles.errorTitle}>Lesson Not Found</Text>
          <Text style={styles.errorText}>
            {error || 'The lesson you are looking for does not exist.'}
          </Text>
          <Button
            style={styles.backButton}
            onPress={handleGoBack}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>Back to Lessons</Text>
          </Button>
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
  const reviewedCount = Math.round(weightedScore);
  const dueCount = Math.max(totalCards - reviewedCount, 0);
  const masteredCount = terms.filter(
    (term) => term.user_term_progress?.[0]?.status === 'Mastered'
  ).length;

  return (
    <View style={styles.container}>
      <LinearGradient pointerEvents="none" colors={[homeColors.gradientStart, homeColors.gradientBright, homeColors.canvas]} locations={[0, 0.45, 1]} style={styles.headerGradient} />
      <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
        {/* Top nav */}
        <View style={styles.nav}>
          <Button accessibilityLabel="Back to Library" onPress={handleGoBack} activeOpacity={0.7}>
            <Text style={styles.navBack}>← Library</Text>
          </Button>
          <Button
            accessibilityLabel="Edit lesson"
            style={styles.navEdit}
            onPress={() => router.push(`/lessons/${id}/settings` as any)}
            activeOpacity={0.7}
          >
            <Feather name="edit-2" size={20} color={colors.text} />
          </Button>
        </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 28 + insets.bottom }]}
      >

        <View style={styles.overview}><View style={styles.overviewFace}>
          <View style={styles.identity}>
            <View style={styles.identityHeading}><LessonCover id={lesson.id} mode={lesson.learning_mode} coverStyle={lesson.cover_style} width={72} height={72} />
            <View style={styles.titleCopy}>
              <View style={styles.titleRow}>
                <Text accessibilityRole="header" style={styles.lessonTitle}>{lesson.name}</Text>
                {lesson.learning_mode === 'language' && (
                  <View accessible accessibilityLabel="Language learning" style={styles.languageTag}>
                    <MaterialIcons name="language" size={16} color={homeColors.white} />
                  </View>
                )}
              </View>
            </View></View>
            {!!lesson.description && <Text style={styles.lessonDescription}>{lesson.description}</Text>}
          </View>
          <View style={styles.statsRow}>
            {[
              { value: totalCards, label: 'total cards' },
              { value: dueCount, label: 'to review' },
              { value: masteredCount, label: 'mastered' },
            ].map((stat) => <View key={stat.label} style={styles.statCell}>
              <Text style={styles.statVal}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>)}
          </View>
          <View accessible accessibilityRole="progressbar" accessibilityLabel="Mastery"
            accessibilityValue={{ min: 0, max: 100, now: progressPct }} style={styles.mastery}>
            <View style={styles.masteryLine}>
              <Text style={styles.masteryLabel}>Mastery</Text>
              <Text style={styles.masteryValue}>{progressPct}%</Text>
            </View>
            <View style={styles.barTrack}><View style={[styles.barFill, { width: `${progressPct}%` }]} /></View>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: totalCards === 0 }} disabled={totalCards === 0} onPress={handleStartStudy} style={[styles.reviewButton, totalCards === 0 && styles.reviewDisabled]}><View style={styles.reviewButtonFace}><View style={styles.playIcon}><HomeAsset name="play" /></View><Text style={styles.reviewButtonText}>Start review</Text></View></Pressable>
        </View></View>

        <View style={styles.termsSection}>
          <View style={styles.controls}>
            <View style={styles.sectionHead}>
              <Text accessibilityRole="header" style={styles.sectionTitle}>Terms</Text>
              <Button accessibilityLabel="Add term" onPress={handleEditTerms} style={styles.addTerm}>
                <DesignAsset name="termPlus" /><Text style={styles.sectionAction}>Add</Text>
              </Button>
            </View>
            <View style={styles.searchContainer}>
              <Icon name="search" size={20} color={homeColors.muted} strokeWidth={1.8} />
              <TextInput accessibilityLabel="Search terms" style={styles.searchInput} placeholder="Search terms"
                placeholderTextColor={colors.muted} value={searchQuery} onChangeText={setSearchQuery}
                autoCorrect={false} returnKeyType="search" />
            </View>
            <View style={styles.filterRow}>
              <Button accessibilityLabel={`Filter by level: ${filterLevel}`} style={styles.filterButton}
                onPress={() => setShowFilterModal(true)}>
                <Text style={styles.filterButtonText}>Level: {filterLevel}</Text><DesignAsset name="termChevronDown" />
              </Button>
              <Text style={styles.resultCount}>Showing {filteredTerms.length} of {totalCards} cards</Text>
            </View>
          </View>

          {/* 词条列表 */}
          {filteredTerms.length === 0 ? (
            <View style={styles.emptyTermsContainer}>
              <Feather name="book-open" size={48} color={colors.muted} />
              <Text style={styles.emptyTermsTitle}>
                {searchQuery || filterLevel !== 'All'
                  ? 'No Terms Found'
                  : 'No Terms Yet'}
              </Text>
              <Text style={styles.emptyTermsText}>
                {searchQuery || filterLevel !== 'All'
                  ? 'Try adjusting your search or filter criteria.'
                  : 'Add terms to get started with this lesson.'}
              </Text>
              {!searchQuery && filterLevel === 'All' && (
              <Button
                  style={styles.addTermsButtonEmpty}
                onPress={handleEditTerms}
                activeOpacity={0.8}
              >
                  <Text style={styles.addTermsButtonTextEmpty}>Add Terms</Text>
              </Button>
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

      {/* Filter Modal */}
      <Modal
        visible={showFilterModal}
        transparent={true}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <Button
            style={styles.modalOverlayBackdrop}
            activeOpacity={1}
            onPress={() => setShowFilterModal(false)}
          />
          <View style={styles.filterModalContainer}>
            <View style={[styles.filterModalContent, { paddingBottom: Math.max(20, insets.bottom) }]}>
                <View style={styles.filterModalHeader}>
                  <View style={styles.filterModalHeaderRow}>
                    <Text style={styles.filterModalTitle}>Filter by Level</Text>
                    <Button
                      accessibilityLabel="Close level filter"
                      onPress={() => setShowFilterModal(false)}
                      style={styles.filterModalCloseButton}
                      activeOpacity={0.7}
                    >
                      <Feather name="x" size={18} color={colors.muted} />
                    </Button>
                  </View>
                </View>

                <ScrollView
                  style={styles.filterOptionsList}
                  showsVerticalScrollIndicator={false}
                  bounces={false}
                >
              {/* All Levels */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionAll,
                  filterLevel === 'All' && styles.filterOptionSelected,
                  filterLevel === 'All' && styles.filterOptionSelectedAll,
                ]}
                onPress={() => {
                  setFilterLevel('All');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    filterLevel === 'All' && styles.filterOptionTextSelected,
                  ]}
                >
                  All Levels
                </Text>
                {filterLevel === 'All' && (
                  <Feather name="check" size={20} color={colors.accentText} />
                )}
              </Button>

              {/* New */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionNew,
                  filterLevel === 'New' && styles.filterOptionSelectedNew,
                ]}
                onPress={() => {
                  setFilterLevel('New');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    styles.filterOptionTextNew,
                    filterLevel === 'New' && styles.filterOptionTextSelectedNew,
                  ]}
                >
                  New
                </Text>
                {filterLevel === 'New' && (
                  <Feather name="check" size={20} color={colors.muted} />
                )}
              </Button>

              {/* Learning */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionLearning,
                  filterLevel === 'Learning' && styles.filterOptionSelectedLearning,
                ]}
                onPress={() => {
                  setFilterLevel('Learning');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    styles.filterOptionTextLearning,
                    filterLevel === 'Learning' && styles.filterOptionTextSelectedLearning,
                  ]}
                >
                  Learning
                </Text>
                {filterLevel === 'Learning' && (
                  <Feather name="check" size={20} color={colors.red} />
                )}
              </Button>

              {/* Familiar */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionFamiliar,
                  filterLevel === 'Familiar' && styles.filterOptionSelectedFamiliar,
                ]}
                onPress={() => {
                  setFilterLevel('Familiar');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    styles.filterOptionTextFamiliar,
                    filterLevel === 'Familiar' && styles.filterOptionTextSelectedFamiliar,
                  ]}
                >
                  Familiar
                </Text>
                {filterLevel === 'Familiar' && (
                  <Feather name="check" size={20} color={colors.accentText} />
                )}
              </Button>

              {/* Good */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionGood,
                  filterLevel === 'Good' && styles.filterOptionSelectedGood,
                ]}
                onPress={() => {
                  setFilterLevel('Good');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    styles.filterOptionTextGood,
                    filterLevel === 'Good' && styles.filterOptionTextSelectedGood,
                  ]}
                >
                  Good
                </Text>
                {filterLevel === 'Good' && (
                  <Feather name="check" size={20} color={colors.warn} />
                )}
              </Button>

              {/* Strong */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionStrong,
                  filterLevel === 'Strong' && styles.filterOptionSelectedStrong,
                ]}
                onPress={() => {
                  setFilterLevel('Strong');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    styles.filterOptionTextStrong,
                    filterLevel === 'Strong' && styles.filterOptionTextSelectedStrong,
                  ]}
                >
                  Strong
                </Text>
                {filterLevel === 'Strong' && (
                  <Feather name="check" size={20} color={colors.accentText} />
                )}
              </Button>

              {/* Mastered */}
              <Button
                style={[
                  styles.filterOption,
                  styles.filterOptionMastered,
                  filterLevel === 'Mastered' && styles.filterOptionSelectedMastered,
                ]}
                onPress={() => {
                  setFilterLevel('Mastered');
                  setShowFilterModal(false);
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterOptionText,
                    styles.filterOptionTextMastered,
                    filterLevel === 'Mastered' && styles.filterOptionTextSelectedMastered,
                  ]}
                >
                  Mastered
                </Text>
                {filterLevel === 'Mastered' && (
                  <Feather name="check" size={20} color={colors.green} />
                )}
              </Button>
                </ScrollView>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  safeAreaTop: { flex: 1 },
  headerGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 450 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...type.bodySmall, color: colors.muted, marginTop: 12 },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  errorTitle: { ...type.section, color: colors.text, marginTop: 16, marginBottom: 8 },
  errorText: { ...type.bodySmall, color: colors.muted, textAlign: 'center', marginBottom: 24 },
  backButton: { backgroundColor: colors.action, paddingHorizontal: 20, paddingVertical: 12, borderRadius: radius.pill },
  backButtonText: { ...type.controlLink, color: colors.onAction },
  nav: { paddingHorizontal: layout.screenInline, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBack: { ...type.controlLink, color: homeColors.deep },
  navEdit: { width: 44, height: 44, borderRadius: 22, backgroundColor: homeColors.focus, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: layout.screenInline, paddingTop: 12, gap: componentTokens.lessonDetail.sectionGap },
  overview: { borderRadius: 24, paddingBottom: 4, backgroundColor: homeColors.border },
  overviewFace: { gap: 20, padding: 16, borderRadius: 24, backgroundColor: homeColors.white },
  identity: { gap: 12 },
  identityHeading: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  titleCopy: { gap: 5, flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lessonTitle: { fontFamily: fonts.display, fontSize: 30, lineHeight: 40, color: homeColors.deep, flexShrink: 1 },
  lessonMetadata: { ...type.meta, color: colors.supporting },
  languageTag: { width: 22, height: 22, borderRadius: 11, backgroundColor: homeColors.primary, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }], boxShadow: `0px 2px 0px ${homeColors.border}` },
  lessonDescription: { ...type.bodyReading, color: colors.supporting },
  statsRow: { flexDirection: 'row', borderRadius: 16, backgroundColor: homeColors.nav, paddingVertical: 12, paddingHorizontal: 8 },
  statCell: { flex: 1, gap: 2, alignItems: 'center' },
  statVal: { fontFamily: fonts.display, fontSize: 24, color: homeColors.deep },
  statLabel: { ...type.meta, color: homeColors.muted },
  mastery: { gap: 10 },
  masteryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  masteryLabel: { ...type.controlLink, color: colors.text },
  masteryValue: { ...type.courseTitle, color: colors.text },
  barTrack: { height: componentTokens.progress.height, borderRadius: radius.pill, backgroundColor: colors.progressTrack, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.action, borderRadius: radius.pill },
  reviewButton: { height: 56, borderRadius: 42, paddingBottom: 4, backgroundColor: homeColors.deep },
  reviewButtonFace: { flex: 1, borderRadius: 42, backgroundColor: homeColors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  reviewButtonText: { fontFamily: fonts.semibold, fontSize: 18, color: homeColors.white },
  reviewDisabled: { opacity: 0.45 },
  playIcon: { transform: [{ rotate: '90deg' }, { scale: 0.7 }] },
  termsSection: { gap: 16 },
  controls: { gap: 10 },
  sectionHead: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { ...type.section, color: colors.text },
  addTerm: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionAction: { ...type.controlLink, color: colors.text },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: homeColors.white, borderWidth: 1, borderColor: homeColors.border, borderRadius: 26, paddingHorizontal: 16, minHeight: 52, gap: 10 },
  searchInput: { ...type.input, color: colors.text, flex: 1, minHeight: 46, paddingVertical: 10 },
  filterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  filterButton: { minHeight: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: homeColors.border, backgroundColor: homeColors.white, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterButtonText: { ...type.streak, color: colors.text },
  resultCount: { ...type.meta, color: colors.supporting },
  emptyTermsContainer: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  emptyTermsTitle: { ...type.section, color: colors.text },
  emptyTermsText: { ...type.bodySmall, color: colors.muted, textAlign: 'center' },
  addTermsButtonEmpty: { backgroundColor: colors.action, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill },
  addTermsButtonTextEmpty: { ...type.controlLink, color: colors.onAction },
  termsList: { gap: 16 },
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
    backgroundColor: colors.modalScrim,
  },
  filterModalContainer: {
    width: '100%',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  filterModalContent: {
    ...sheet.surface,
    paddingBottom: Platform.OS === 'ios' ? 0 : 20,
    maxHeight: '90%',
  },
  // No rule under the title: the gap does that work, as on every other sheet.
  filterModalHeader: {
    paddingHorizontal: layout.screenInline,
    paddingTop: 18,
    paddingBottom: 16,
  },
  filterModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterModalTitle: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fonts.bold,
  },
  filterModalCloseButton: {
    width: 44,
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.controlBorder,
  },
  filterOptionsList: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    maxHeight: 320,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 8,
    marginVertical: 3,
    borderWidth: 1,
    borderColor: colors.transparent,
  },
  filterOptionSelected: {
    backgroundColor: colors.bg,
    borderColor: colors.controlBorder,
  },
  filterOptionAll: {
    backgroundColor: colors.surf,
  },
  filterOptionSelectedAll: {
    backgroundColor: colors.accentL,
    borderColor: colors.action,
  },
  filterOptionText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: colors.text,
    fontFamily: fonts.medium,
  },
  filterOptionTextSelected: {
    fontWeight: '700',
    color: colors.accentText,
    fontFamily: fonts.bold,
  },
  // Filter Option Colors (matching LessonStatsCard)
  filterOptionNew: {
    backgroundColor: colors.transparent,
  },
  filterOptionSelectedNew: {
    backgroundColor: colors.bg,
  },
  filterOptionTextNew: {
    color: colors.muted,
  },
  filterOptionTextSelectedNew: {
    color: colors.muted,
    fontWeight: '600',
  },
  filterOptionLearning: {
    backgroundColor: colors.transparent,
  },
  filterOptionSelectedLearning: {
    backgroundColor: colors.redL,
  },
  filterOptionTextLearning: {
    color: colors.red,
  },
  filterOptionTextSelectedLearning: {
    color: colors.red,
    fontWeight: '600',
  },
  filterOptionFamiliar: {
    backgroundColor: colors.transparent,
  },
  filterOptionSelectedFamiliar: {
    backgroundColor: colors.accentL,
  },
  filterOptionTextFamiliar: {
    color: colors.accentText,
  },
  filterOptionTextSelectedFamiliar: {
    color: colors.accentText,
    fontWeight: '600',
  },
  filterOptionGood: {
    backgroundColor: colors.transparent,
  },
  filterOptionSelectedGood: {
    backgroundColor: colors.warnL,
  },
  filterOptionTextGood: {
    color: colors.warn,
  },
  filterOptionTextSelectedGood: {
    color: colors.warn,
    fontWeight: '600',
  },
  filterOptionStrong: {
    backgroundColor: colors.transparent,
  },
  filterOptionSelectedStrong: {
    backgroundColor: colors.aiL,
  },
  filterOptionTextStrong: {
    color: colors.accentText,
  },
  filterOptionTextSelectedStrong: {
    color: colors.accentText,
    fontWeight: '600',
  },
  filterOptionMastered: {
    backgroundColor: colors.transparent,
  },
  filterOptionSelectedMastered: {
    backgroundColor: colors.greenL,
  },
  filterOptionTextMastered: {
    color: colors.green,
  },
  filterOptionTextSelectedMastered: {
    color: colors.green,
    fontWeight: '600',
  },
});

