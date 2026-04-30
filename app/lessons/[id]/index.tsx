import { SectionLabel } from '@/components/SectionLabel';
import TermCard from '@/components/TermCard';
import { Button } from '@/components/ui/Button';
import { isCacheExpired, loadFromCache, saveToCache } from '@/lib/cache';
import { safeBack } from '@/lib/safeBack';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
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
  is_vocab_mode?: boolean;
}

// 学习阶段类型
type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';

// 词条类型定义
interface Term {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
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
            .select('term_id, status')
            .eq('user_id', user.id)
            .in('term_id', termIds);
          
          // 创建进度映射
          const progressMap = new Map();
          if (progressData) {
            progressData.forEach((p) => {
              progressMap.set(p.term_id, p.status);
            });
          }
          
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
    router.push(`/study/${id}` as any);
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
      }));

      // 调用 Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('generate-questions', {
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

              // 重新加载数据
              await fetchLessonDetail();
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
          <ActivityIndicator size="large" color={colors.accent} />
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
          <Feather name="alert-circle" size={48} color="#EF4444" />
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
  const masteredCount = terms.filter(
    (term) => term.user_term_progress?.[0]?.status === 'Mastered'
  ).length;
  const dueCount = Math.max(totalCards - masteredCount, 0);
  const progressPct = totalCards > 0 ? Math.round((masteredCount / totalCards) * 100) : 0;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
        {/* Top nav */}
        <View style={styles.nav}>
          <Button onPress={handleGoBack} activeOpacity={0.7}>
            <Text style={styles.navBack}>← Library</Text>
          </Button>
          <Button
            onPress={() => router.push(`/lessons/${id}/settings` as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.navEdit}>Edit</Text>
          </Button>
        </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 28 + insets.bottom }]}
      >

        {/* Title block */}
        <View style={styles.titleBlock}>
          <View style={styles.lessonMetaRow}>
            <SectionLabel size={11}>Lesson</SectionLabel>
            {lesson.is_vocab_mode && (
              <View style={styles.vocabModeTag}>
                <Text style={styles.vocabModeTagText}>Vocabulary Mode</Text>
              </View>
            )}
          </View>
          <Text style={styles.lessonTitle}>{lesson.name}</Text>
          {lesson.description && <Text style={styles.lessonDescription}>{lesson.description}</Text>}
          <View style={styles.masteryLine}>
            <Text style={styles.masteryNum}>{progressPct}%</Text>
            <Text style={styles.masteryUnit}>mastery</Text>
            <Text style={[styles.masteryUnit, { marginLeft: 'auto' }]}>
              {masteredCount} of {totalCards}
            </Text>
          </View>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${progressPct}%` }]} />
          </View>
        </View>

        {/* Stat row */}
        <View style={styles.statsRow}>
          {[
            { v: totalCards, l: 'cards' },
            { v: dueCount, l: 'due' },
            { v: masteredCount, l: 'mastered' },
          ].map((s, i, arr) => (
            <View
              key={s.l}
              style={[
                styles.statCell,
                i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: colors.border },
              ]}
            >
              <Text style={styles.statVal}>{s.v}</Text>
              <SectionLabel size={11} style={styles.statLabel}>{s.l}</SectionLabel>
            </View>
          ))}
        </View>

        {/* CTA */}
        <View style={styles.ctaWrap}>
          <Button
            style={styles.continueLearningButton}
            onPress={handleStartStudy}
            activeOpacity={0.8}
          >
            <Text style={styles.continueLearningButtonText}>Review {dueCount} due →</Text>
          </Button>
        </View>

        {/* Terms 列表区域 */}
        <View style={styles.termsSection}>
          <View style={styles.sectionHead}>
            <SectionLabel>Terms</SectionLabel>
            <Button onPress={handleEditTerms} activeOpacity={0.7}>
              <Text style={styles.sectionAction}>Add</Text>
            </Button>
          </View>

          {/* 工具栏 */}
          <View style={styles.toolbar}>
            {/* 搜索框 */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color={colors.dim} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Terms or Explanations..."
                placeholderTextColor={colors.muted}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* 筛选器下拉菜单 */}
          <Button
              style={styles.filterButton}
              onPress={() => setShowFilterModal(true)}
              activeOpacity={0.7}
          >
              <Text style={styles.filterButtonText}>
                {filterLevel === 'All' ? 'All Levels' : filterLevel}
            </Text>
              <Feather 
                name="chevron-down" 
                size={16} 
                color={colors.muted}
              />
          </Button>
        </View>

          {/* 列表头 */}
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderTitle}>Terms</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{filteredTerms.length}</Text>
            </View>
          </View>

          {/* 词条列表 */}
          {filteredTerms.length === 0 ? (
            <View style={styles.emptyTermsContainer}>
              <Feather name="book-open" size={48} color={colors.dim} />
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
                    status={progressStatus}
                    onEdit={() => handleEditTerm(term.id)}
                    onDelete={() => handleDeleteTerm(term.id, term.term)}
                  />
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>

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
            <View style={styles.filterModalContent}>
                <View style={styles.filterModalHeader}>
                  <View style={styles.filterModalHeaderRow}>
                    <Text style={styles.filterModalTitle}>Filter by Level</Text>
                    <Button
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
                  <Feather name="check" size={20} color={colors.accent} />
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
                  <Feather name="check" size={20} color="#E7000B" />
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
                  <Feather name="check" size={20} color="#FF6900" />
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
                  <Feather name="check" size={20} color="#D08700" />
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
                  <Feather name="check" size={20} color={colors.accent} />
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
                  <Feather name="check" size={20} color="#00A63E" />
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
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  safeAreaTop: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_700',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    textAlign: 'center',
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 28,
  },
  nav: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBack: {
    fontSize: 13,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  navEdit: {
    fontSize: 13,
    letterSpacing: -0.1,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
  titleBlock: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    backgroundColor: colors.surf,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lessonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  vocabModeTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#E0E7FF',
  },
  vocabModeTagText: {
    fontSize: 10,
    lineHeight: 14,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
  lessonTitle: {
    fontFamily: 'JetBrainsMono_700',
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '400',
    letterSpacing: -0.7,
    color: colors.text,
  },
  lessonDescription: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
    marginTop: 6,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  masteryLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 18,
  },
  masteryNum: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 38,
    letterSpacing: -1.2,
    lineHeight: 42,
    color: colors.text,
    paddingTop: 2,
    paddingRight: 2,
  },
  masteryUnit: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
  },
  barTrack: {
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.dim,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  statsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surf,
  },
  statCell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  statVal: {
    fontFamily: 'JetBrainsMono_800',
    fontSize: 26,
    letterSpacing: -0.1,
    lineHeight: 26,
    color: colors.text,
    paddingTop: 2,
  },
  statLabel: {
    marginTop: 0,
    fontFamily: 'JetBrainsMono_500',
    fontWeight: '400',
    letterSpacing: -0.1,
    lineHeight: 15,
  },
  ctaWrap: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surf,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Terms 列表区域样式
  termsSection: {
    marginTop: 0,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionHead: {
    paddingHorizontal: 4,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionAction: {
    fontSize: 13,
    letterSpacing: -0.1,
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    fontWeight: '400',
  },
  addTermsButtonEmpty: {
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addTermsButtonTextEmpty: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'JetBrainsMono_700',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surf,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.dim,
    marginRight: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
    paddingVertical: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surf,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonText: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_500',
    marginRight: 6,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listHeaderTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_700',
  },
  badge: {
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    fontFamily: 'JetBrainsMono_500',
  },
  emptyTermsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyTermsTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyTermsText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    textAlign: 'center',
    marginBottom: 24,
  },
  termsList: {
    gap: 12,
  },
  continueLearningButton: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 15,
    alignItems: 'center',
  },
  continueLearningButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 22,
    fontFamily: 'JetBrainsMono_700',
    letterSpacing: -0.1,
  },
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
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  filterModalContainer: {
    width: '100%',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  filterModalContent: {
    backgroundColor: colors.surf,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingBottom: Platform.OS === 'ios' ? 0 : 20,
    maxHeight: '90%',
  },
  filterModalHeader: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_700',
  },
  filterModalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
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
    borderColor: 'transparent',
  },
  filterOptionSelected: {
    backgroundColor: colors.bg,
    borderColor: colors.border,
  },
  filterOptionAll: {
    backgroundColor: colors.surf,
  },
  filterOptionSelectedAll: {
    backgroundColor: colors.accentL,
    borderColor: colors.accentRing,
  },
  filterOptionText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_500',
  },
  filterOptionTextSelected: {
    fontWeight: '400',
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
  },
  // Filter Option Colors (matching LessonStatsCard)
  filterOptionNew: {
    backgroundColor: 'transparent',
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
    backgroundColor: 'transparent',
  },
  filterOptionSelectedLearning: {
    backgroundColor: '#FEF2F2',
  },
  filterOptionTextLearning: {
    color: '#E7000B',
  },
  filterOptionTextSelectedLearning: {
    color: '#E7000B',
    fontWeight: '600',
  },
  filterOptionFamiliar: {
    backgroundColor: 'transparent',
  },
  filterOptionSelectedFamiliar: {
    backgroundColor: '#FFF7ED',
  },
  filterOptionTextFamiliar: {
    color: '#FF6900',
  },
  filterOptionTextSelectedFamiliar: {
    color: '#FF6900',
    fontWeight: '600',
  },
  filterOptionGood: {
    backgroundColor: 'transparent',
  },
  filterOptionSelectedGood: {
    backgroundColor: '#FEFCE8',
  },
  filterOptionTextGood: {
    color: '#D08700',
  },
  filterOptionTextSelectedGood: {
    color: '#D08700',
    fontWeight: '600',
  },
  filterOptionStrong: {
    backgroundColor: 'transparent',
  },
  filterOptionSelectedStrong: {
    backgroundColor: '#FAF5FF',
  },
  filterOptionTextStrong: {
    color: colors.accent,
  },
  filterOptionTextSelectedStrong: {
    color: colors.accent,
    fontWeight: '600',
  },
  filterOptionMastered: {
    backgroundColor: 'transparent',
  },
  filterOptionSelectedMastered: {
    backgroundColor: '#F0FDF4',
  },
  filterOptionTextMastered: {
    color: '#00A63E',
  },
  filterOptionTextSelectedMastered: {
    color: '#00A63E',
    fontWeight: '600',
  },
});

