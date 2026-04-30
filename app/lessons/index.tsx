import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// 课程类型定义
interface Lesson {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
  terms_count?: number;
  completed_terms?: number; // Strong 和 Mastered 状态的数量
  progress_percent?: number; // 加权进度百分比 (0-100)
}

// 学习阶段权重定义
const LEARNING_STAGE_WEIGHTS: Record<string, number> = {
  New: 0,
  Learning: 0.2, // 20%
  Familiar: 0.4, // 40%
  Good: 0.6, // 60%
  Strong: 0.8, // 80%
  Mastered: 1.0, // 100%
};

// 根据 status 获取权重
const getStatusWeight = (status: string | null | undefined): number => {
  if (!status || status === 'New') {
    return LEARNING_STAGE_WEIGHTS.New;
  }
  return LEARNING_STAGE_WEIGHTS[status] || LEARNING_STAGE_WEIGHTS.New;
};

// 使用统一的缓存工具
import { isCacheExpired, loadFromCache, saveToCache } from '@/lib/cache';

// Expo Router 的 options 导出
export const options = {
  headerShown: false,
};

export default function LessonsListScreen() {
  const navigation = useNavigation();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoadingFromCache, setIsLoadingFromCache] = useState(false);

  // 动态设置导航栏隐藏（双重保障）
  useEffect(() => {
    navigation.setOptions({
      headerShown: false,
      header: () => null,
    });
  }, [navigation]);

  // 从缓存加载数据（使用统一缓存工具）
  const loadLessonsFromCache = async (): Promise<Lesson[] | null> => {
    return await loadFromCache<Lesson[]>('LESSONS');
  };

  // 保存数据到缓存（使用统一缓存工具）
  const saveLessonsToCache = async (lessonsData: Lesson[]) => {
    await saveToCache('LESSONS', lessonsData);
  };

  // 获取课程列表
  const fetchLessons = async (useCache: boolean = true) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        setIsLoadingFromCache(false);
        return;
      }

      // 如果使用缓存且正在初始加载，先尝试从缓存加载
      if (useCache && loading && !refreshing) {
        const cachedLessons = await loadLessonsFromCache();
        if (cachedLessons && cachedLessons.length > 0) {
          setLessons(cachedLessons);
          setIsLoadingFromCache(true);
          setLoading(false);
          // 继续在后台获取最新数据，不设置 loading 状态
        }
      }

      // 先查询所有 lessons
      const { data: lessonsData, error: lessonsError } = await supabase
        .from('lessons')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (lessonsError) {
        console.error('Error fetching lessons:', lessonsError);
        // 如果从缓存加载失败，且没有缓存数据，则设置为空数组
        if (!useCache || lessons.length === 0) {
          setLessons([]);
        }
        return;
      }

      if (!lessonsData || lessonsData.length === 0) {
        setLessons([]);
        await saveLessonsToCache([]);
        return;
      }

      // 批量查询所有 lessons 的 terms 和进度数据，优化性能
      const lessonIds = lessonsData.map(l => l.id);
      
      // 并行查询所有 lessons 的 terms
      const { data: allTermsData } = await supabase
        .from('terms')
        .select('id, lesson_id')
        .in('lesson_id', lessonIds);

      // 批量查询所有 terms 的进度记录
      const allTermIds = allTermsData?.map(t => t.id) || [];
      const { data: allProgressData } = allTermIds.length > 0
        ? await supabase
            .from('user_term_progress')
            .select('term_id, status')
            .eq('user_id', user.id)
            .in('term_id', allTermIds)
        : { data: [] };

      // 创建进度映射 (term_id -> status)
      const progressMap = new Map<string, string>();
      if (allProgressData) {
        allProgressData.forEach((p) => {
          progressMap.set(p.term_id, p.status);
        });
      }

      // 按 lesson_id 分组 terms
      const termsByLesson = new Map<string, typeof allTermsData>();
      if (allTermsData) {
        allTermsData.forEach((term) => {
          const lessonId = term.lesson_id;
          if (!termsByLesson.has(lessonId)) {
            termsByLesson.set(lessonId, []);
          }
          termsByLesson.get(lessonId)!.push(term);
        });
      }

      // 计算每个 lesson 的统计信息
      const lessonsWithCounts = lessonsData.map((lesson) => {
        const lessonTerms = termsByLesson.get(lesson.id) || [];
        const totalTerms = lessonTerms.length;

        // 初始化统计变量
        let completedTerms = 0; // Strong 和 Mastered 状态的数量
        let weightedScore = 0; // 加权总分

        // 遍历该 lesson 的所有 terms，计算加权分数和完成数量
        lessonTerms.forEach((term) => {
          const status = progressMap.get(term.id) || null;
          const weight = getStatusWeight(status);
          
          // 累加权重
          weightedScore += weight;
          
          // 只统计 Strong 和 Mastered 状态的数量
          if (status === 'Strong' || status === 'Mastered') {
            completedTerms++;
          }
        });

        // 计算加权进度百分比
        const progressPercent = totalTerms > 0 
          ? (weightedScore / totalTerms) * 100 
          : 0;

        return {
          ...lesson,
          terms_count: totalTerms,
          completed_terms: completedTerms,
          progress_percent: progressPercent,
        };
      });

      setLessons(lessonsWithCounts);
      await saveLessonsToCache(lessonsWithCounts);
      setIsLoadingFromCache(false);
    } catch (error) {
      console.error('Error:', error);
      // 如果从缓存加载失败，且没有缓存数据，则设置为空数组
      if (!useCache || lessons.length === 0) {
        setLessons([]);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // 组件挂载时加载数据（先尝试从缓存加载）
  useEffect(() => {
    fetchLessons(true);
  }, []);

  // 当页面获得焦点时刷新数据（如果缓存过期）
  useFocusEffect(
    useCallback(() => {
      const checkAndRefresh = async () => {
        const expired = await isCacheExpired('LESSONS');
        if (expired) {
          // 缓存过期，在后台刷新
            fetchLessons(false);
        }
      };
      checkAndRefresh();
    }, [])
  );

  // 下拉刷新（不使用缓存）
  const onRefresh = () => {
    setRefreshing(true);
    fetchLessons(false);
  };

  // 格式化日期
  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  };

  // 加载中
  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Loading lessons...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // 空状态
  if (lessons.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.emptyContainer}>
          <Feather name="book-open" size={64} color="#9CA3AF" />
          <Text style={styles.emptyTitle}>No Lessons Yet</Text>
          <Text style={styles.emptyText}>
            Create your first lesson to get started!
          </Text>
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => router.push('/create')}
            activeOpacity={0.8}
          >
            <Text style={styles.createButtonText}>Create Lesson</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Aggregate stats
  const totalCards = lessons.reduce((sum, l) => sum + (l.terms_count || 0), 0);
  const totalDue = lessons.reduce((sum, l) => {
    const cards = l.terms_count || 0;
    const pct = l.progress_percent || 0;
    return sum + Math.max(0, Math.round(cards * (1 - pct / 100)));
  }, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* ── Top bar ── */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Library</Text>
          <TouchableOpacity
            onPress={() => router.push('/create')}
            activeOpacity={0.7}
          >
            <Text style={styles.topBarAction}>+ New</Text>
          </TouchableOpacity>
        </View>

        {/* ── Stats summary ── */}
        <View style={styles.statsRow}>
          {[
            { val: String(lessons.length), label: 'decks' },
            { val: String(totalCards), label: 'cards' },
            { val: String(totalDue), label: 'due' },
          ].map((s, i) => (
            <View
              key={s.label}
              style={[styles.statCell, i < 2 && styles.statCellBorder]}
            >
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Deck list ── */}
        <View style={styles.deckSection}>
          <Text style={styles.sectionLabel}>All Decks</Text>
          <View style={styles.deckList}>
            {lessons.map((lesson) => {
              const totalTerms = lesson.terms_count || 0;
              const progress = Math.round(lesson.progress_percent || 0);
              const due = Math.max(0, Math.round(totalTerms * (1 - progress / 100)));

              return (
                <TouchableOpacity
                  key={lesson.id}
                  style={styles.deckCard}
                  onPress={() => router.push(`/lessons/${lesson.id}` as any)}
                  activeOpacity={0.8}
                >
                  {/* Title row */}
                  <View style={styles.deckTitleRow}>
                    <Text style={styles.deckTitle} numberOfLines={1}>
                      {lesson.name}
                    </Text>
                    <Text style={[styles.deckDue, due > 0 && styles.deckDueActive]}>
                      {due > 0 ? `${due} due` : 'caught up'}
                    </Text>
                  </View>
                  {/* Description */}
                  {lesson.description ? (
                    <Text style={styles.deckDesc} numberOfLines={1}>
                      {lesson.description}
                    </Text>
                  ) : null}
                  {/* Progress bar row */}
                  <View style={styles.deckProgressRow}>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress}%` as any }]} />
                    </View>
                    <Text style={styles.deckCards}>{totalTerms} cards</Text>
                    <Text style={styles.deckPct}>{progress}%</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const ED = {
  bg: '#FAFAF8',
  surf: '#FFFFFF',
  border: '#E5E3DE',
  accent: '#1A8A72',
  text: '#1A1916',
  muted: '#9B9790',
  dim: '#D8D5CF',
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: ED.bg },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, fontSize: 16, color: ED.muted },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyTitle: { fontSize: 24, fontWeight: '700', color: ED.text, marginTop: 16, marginBottom: 8 },
  emptyText: { fontSize: 16, color: ED.muted, textAlign: 'center', marginBottom: 32 },
  createButton: { backgroundColor: ED.accent, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 8 },
  createButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  // ── Top bar ──
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
    backgroundColor: ED.surf,
  },
  topBarTitle: { fontSize: 19, fontWeight: '800', letterSpacing: -0.4, color: ED.text },
  topBarAction: { fontSize: 12, color: ED.accent, fontWeight: '600' },
  // ── Stats row ──
  statsRow: {
    flexDirection: 'row',
    backgroundColor: ED.surf,
    borderBottomWidth: 1,
    borderBottomColor: ED.border,
  },
  statCell: { flex: 1, paddingHorizontal: 16, paddingVertical: 14 },
  statCellBorder: { borderRightWidth: 1, borderRightColor: ED.border },
  statVal: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6, color: ED.text, lineHeight: 26 },
  statLabel: { fontSize: 9.5, color: ED.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 5 },
  // ── Deck section ──
  deckSection: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 10,
    color: ED.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.9,
    paddingHorizontal: 4,
    marginBottom: 10,
  },
  deckList: { gap: 8 },
  deckCard: {
    backgroundColor: ED.surf,
    borderWidth: 1,
    borderColor: ED.border,
    borderRadius: 10,
    padding: 14,
  },
  deckTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 3,
  },
  deckTitle: { fontSize: 14, fontWeight: '700', color: ED.text, flex: 1, letterSpacing: -0.2 },
  deckDue: { fontSize: 11, color: ED.muted, fontWeight: '600', flexShrink: 0 },
  deckDueActive: { color: ED.accent },
  deckDesc: { fontSize: 11.5, color: ED.muted, marginBottom: 10 },
  deckProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  progressTrack: { flex: 1, height: 2, borderRadius: 1, backgroundColor: ED.dim, overflow: 'hidden' },
  progressFill: { height: '100%' as any, backgroundColor: ED.accent },
  deckCards: { fontSize: 10.5, color: ED.muted, width: 56, textAlign: 'right' },
  deckPct: { fontSize: 10.5, fontWeight: '700', color: ED.text, width: 30, textAlign: 'right' },
});

