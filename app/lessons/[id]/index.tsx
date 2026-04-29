import { loadFromCache, saveToCache, isCacheExpired } from '@/lib/cache';
import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
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
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LessonStatsCard from '@/components/LessonStatsCard';
import TermCard from '@/components/TermCard';
import BackIcon from '@/components/icons/BackIcon';
import SettingIcon from '@/components/icons/SettingIcon';

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
    router.back();
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
          <ActivityIndicator size="large" color="#3B82F6" />
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
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleGoBack}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>Back to Lessons</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDeadline = formatDate(lesson.deadline);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeAreaTop} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header 区域（自定义样式） */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              onPress={handleGoBack}
              style={styles.backButtonHeader}
              activeOpacity={0.7}
            >
              <BackIcon size={20} color="#0A0A0A" />
            </TouchableOpacity>
            <View style={styles.headerRightSection}>
              {/* Vocabulary Mode 标签 */}
              <View style={[
                styles.vocabModeBadge,
                lesson.is_vocab_mode ? styles.vocabModeBadgeActive : styles.vocabModeBadgeInactive
              ]}>
                <Text style={[
                  styles.vocabModeText,
                  lesson.is_vocab_mode ? styles.vocabModeTextActive : styles.vocabModeTextInactive
                ]}>
                  Vocabulary Mode
                </Text>
              </View>
            <TouchableOpacity
              onPress={() => {
                router.push(`/lessons/${id}/settings` as any);
              }}
              style={styles.headerSettingButton}
              activeOpacity={0.7}
            >
              <SettingIcon size={24} color="#0A0A0A" />
            </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.lessonTitle}>{lesson.name}</Text>
          {lesson.description && (
            <Text style={styles.lessonDescription}>{lesson.description}</Text>
          )}
        </View>

        {/* 学习进度统计卡片 */}
        {terms.length > 0 && (
          <LessonStatsCard lesson={lesson} terms={terms} />
          )}

        {/* Add Items 按钮 */}
          <TouchableOpacity
          style={styles.addItemsButton}
          onPress={handleEditTerms}
            activeOpacity={0.8}
          >
          <Feather name="plus" size={20} color="#111827" />
          <Text style={styles.addItemsButtonText}>Add Items</Text>
          </TouchableOpacity>

        {/* Terms 列表区域 */}
        <View style={styles.termsSection}>

          {/* 工具栏 */}
          <View style={styles.toolbar}>
            {/* 搜索框 */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={18} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Terms or Explanations..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {/* 筛选器下拉菜单 */}
          <TouchableOpacity
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
                color="#6B7280"
              />
          </TouchableOpacity>
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
              <Feather name="book-open" size={48} color="#9CA3AF" />
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
              <TouchableOpacity
                  style={styles.addTermsButtonEmpty}
                onPress={handleEditTerms}
                activeOpacity={0.8}
              >
                  <Text style={styles.addTermsButtonTextEmpty}>Add Terms</Text>
              </TouchableOpacity>
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
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalOverlayBackdrop}
            activeOpacity={1}
            onPress={() => setShowFilterModal(false)}
          />
          <View style={styles.filterModalContainer}>
            <View style={styles.filterModalContent}>
                {/* Handle bar */}
                <View style={styles.filterModalHandle} />
                
                <View style={styles.filterModalHeader}>
                  <Text style={styles.filterModalTitle}>Filter by Level</Text>
                </View>
                
                <View style={styles.filterOptionsList}>
              {/* All Levels */}
              <TouchableOpacity
                style={[
                  styles.filterOption,
                  filterLevel === 'All' && styles.filterOptionSelected,
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
                  <Feather name="check" size={20} color="#4E49FC" />
                )}
              </TouchableOpacity>

              {/* New */}
              <TouchableOpacity
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
                  <Feather name="check" size={20} color="#4A5565" />
                )}
              </TouchableOpacity>

              {/* Learning */}
              <TouchableOpacity
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
              </TouchableOpacity>

              {/* Familiar */}
              <TouchableOpacity
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
              </TouchableOpacity>

              {/* Good */}
              <TouchableOpacity
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
              </TouchableOpacity>

              {/* Strong */}
              <TouchableOpacity
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
                  <Feather name="check" size={20} color="#4E49FC" />
                )}
              </TouchableOpacity>

              {/* Mastered */}
              <TouchableOpacity
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
              </TouchableOpacity>
                </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* 底部固定栏 */}
      <SafeAreaView style={styles.footerContainer} edges={['bottom']}>
        <View style={styles.footerContent}>
          <TouchableOpacity
            style={styles.continueLearningButton}
            onPress={handleStartStudy}
            activeOpacity={0.8}
          >
            <Feather name="play" size={20} color="#FFFFFF" />
            <Text style={styles.continueLearningButtonText}>Continue Learning</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
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
    fontSize: 16,
    color: '#6B7280',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: '#1A8A72',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100, // 为底部固定按钮留出空间
  },
  header: {
    marginBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backButtonHeader: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(120,116,150,0.08)',
    borderRadius: 16.4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerSettingButton: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  lessonTitle: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  vocabModeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  vocabModeBadgeActive: {
    backgroundColor: '#F5F3FF',
    borderColor: '#4E49FC',
  },
  vocabModeBadgeInactive: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  vocabModeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  vocabModeTextActive: {
    color: '#4E49FC',
  },
  vocabModeTextInactive: {
    color: '#6B7280',
  },
  lessonDescription: {
    fontSize: 16,
    color: '#6B7280',
    lineHeight: 24,
    marginBottom: 12,
  },
  deadlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  deadlineText: {
    fontSize: 14,
    color: '#6B7280',
    marginLeft: 8,
    fontWeight: '500',
  },
  actionBar: {
    marginBottom: 32,
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#3B82F6',
  },
  secondaryButton: {
    backgroundColor: '#10B981',
  },
  highlightButton: {
    shadowColor: '#10B981',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  outlineButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },
  secondaryButtonText: {
    color: '#FFFFFF',
  },
  outlineButtonText: {
    color: '#3B82F6',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  // Terms 列表区域样式
  termsSection: {
    marginTop: 0,
  },
  addItemsButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E3DE',
  },
  addItemsButtonText: {
    color: '#1A1916',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  addTermsButtonEmpty: {
    backgroundColor: '#1A8A72',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addTermsButtonTextEmpty: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
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
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
    marginRight: 6,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  listHeaderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  badge: {
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 32,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  emptyTermsContainer: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 20,
  },
  emptyTermsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyTermsText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  termsList: {
    gap: 12,
  },
  termCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  termCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  termIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  progressBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  // New 样式 - 与 LessonStatsCard 一致
  progressBadgeNew: {
    backgroundColor: '#F9FAFB',
    borderColor: '#F9FAFB',
  },
  // Learning 样式 - 与 LessonStatsCard 一致 (红色)
  progressBadgeLearning: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEF2F2',
  },
  // Familiar 样式 - 与 LessonStatsCard 一致 (橙色)
  progressBadgeFamiliar: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFF7ED',
  },
  // Good 样式 - 与 LessonStatsCard 一致 (黄色)
  progressBadgeGood: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FEFCE8',
  },
  // Strong 样式 - 与 LessonStatsCard 一致 (紫色)
  progressBadgeStrong: {
    backgroundColor: '#FAF5FF',
    borderColor: '#FAF5FF',
  },
  // Mastered 样式 - 与 LessonStatsCard 一致 (绿色)
  progressBadgeMastered: {
    backgroundColor: '#F0FDF4',
    borderColor: '#F0FDF4',
  },
  progressBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  // New 文本颜色 - 与 LessonStatsCard 一致
  progressBadgeTextNew: {
    color: '#4A5565',
  },
  // Learning 文本颜色 - 与 LessonStatsCard 一致
  progressBadgeTextLearning: {
    color: '#E7000B',
  },
  // Familiar 文本颜色 - 与 LessonStatsCard 一致
  progressBadgeTextFamiliar: {
    color: '#FF6900',
  },
  // Good 文本颜色 - 与 LessonStatsCard 一致
  progressBadgeTextGood: {
    color: '#D08700',
  },
  // Strong 文本颜色 - 与 LessonStatsCard 一致
  progressBadgeTextStrong: {
    color: '#4E49FC',
  },
  // Mastered 文本颜色 - 与 LessonStatsCard 一致
  progressBadgeTextMastered: {
    color: '#00A63E',
  },
  termContent: {
    gap: 12,
  },
  termRow: {
    gap: 8,
  },
  termLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  termValue: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  explanationText: {
    fontSize: 14,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  footerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E3DE',
  },
  footerContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
  },
  continueLearningButton: {
    backgroundColor: '#1A8A72',
    borderRadius: 8,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueLearningButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  filterModalContainer: {
    width: '100%',
    justifyContent: 'flex-end',
    zIndex: 1,
  },
  filterModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '70%',
  },
  filterModalHandle: {
    width: 36,
    height: 5,
    backgroundColor: '#D1D5DB',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  filterModalHeader: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterModalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  filterOptionsList: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    maxHeight: 400,
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginVertical: 2,
  },
  filterOptionSelected: {
    backgroundColor: '#F3F4F6',
  },
  filterOptionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  filterOptionTextSelected: {
    fontWeight: '600',
    color: '#4E49FC',
  },
  // Filter Option Colors (matching LessonStatsCard)
  filterOptionNew: {
    backgroundColor: 'transparent',
  },
  filterOptionSelectedNew: {
    backgroundColor: '#F9FAFB',
  },
  filterOptionTextNew: {
    color: '#4A5565',
  },
  filterOptionTextSelectedNew: {
    color: '#4A5565',
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
    color: '#4E49FC',
  },
  filterOptionTextSelectedStrong: {
    color: '#4E49FC',
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

