import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 学习阶段类型
type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';

// 学习阶段权重定义（与列表页面保持一致）
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

// 课程类型定义
interface Lesson {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
}

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

interface LessonStatsCardProps {
  lesson: Lesson;
  terms: Term[];
}

export default function LessonStatsCard({ lesson, terms }: LessonStatsCardProps) {
  // 统计数据（使用 useMemo 优化性能）
  const stats = useMemo(() => {
    const stageCounts = {
      New: 0,
      Learning: 0,
      Familiar: 0,
      Good: 0,
      Strong: 0,
      Mastered: 0,
    };

    // 遍历词条，统计每个阶段的数量
    terms.forEach((term) => {
      const status =
        term.user_term_progress && term.user_term_progress.length > 0
          ? term.user_term_progress[0].status
          : null;

      // 如果 status 为 null、undefined 或 'New'，都算作 New
      if (!status || status === 'New') {
        stageCounts.New++;
      } else if (status in stageCounts) {
        stageCounts[status as LearningStage]++;
      }
    });

    const total = terms.length;
    
    // 计算加权进度（与列表页面保持一致）
    let weightedScore = 0;
    terms.forEach((term) => {
      const status =
        term.user_term_progress && term.user_term_progress.length > 0
          ? term.user_term_progress[0].status
          : null;
      const weight = getStatusWeight(status);
      weightedScore += weight;
    });
    
    // 加权进度百分比
    const progressPercent = total > 0 
      ? Math.round((weightedScore / total) * 100) 
      : 0;
    
    // 完成数量：Strong 和 Mastered 状态的数量（用于显示）
    const completed = stageCounts.Mastered + stageCounts.Strong;

    return {
      stageCounts,
      total,
      completed,
      completionRate: progressPercent, // 使用加权进度
    };
  }, [terms]);

  // 计算剩余天数
  const daysLeft = useMemo(() => {
    if (!lesson.deadline) return null;

    try {
      const deadline = new Date(lesson.deadline);
      const now = new Date();
      const diffTime = deadline.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      return diffDays > 0 ? diffDays : 0;
    } catch {
      return null;
    }
  }, [lesson.deadline]);

  // 格式化截止日期
  const formatDeadline = (dateString: string | null) => {
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

  const deadlineFormatted = formatDeadline(lesson.deadline);

  return (
    <View style={styles.container}>
      {/* 标题区 - 带渐变背景 */}
      <LinearGradient
        colors={['rgba(250,245,255,1)', 'rgba(243,232,255,1)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGradient}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Feather name="trending-up" size={20} color="#0A0A0A" />
            <Text style={styles.title}>Overall Progress</Text>
          </View>

          {/* 截止日期和剩余天数 */}
          {lesson.deadline && (
            <View style={styles.deadlineRow}>
              <View style={styles.deadlineBadge}>
                <Feather name="calendar" size={14} color="#A65F00" />
                <Text style={styles.deadlineText}>Due: {deadlineFormatted}</Text>
              </View>
              {daysLeft !== null && (
                <Text style={styles.daysLeftText}>{daysLeft} days left</Text>
              )}
            </View>
          )}
        </View>
      </LinearGradient>

      {/* 进度条 */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Completion Rate</Text>
          <Text style={styles.progressText}>
            {stats.completed}/{stats.total} questions ({stats.completionRate}%)
          </Text>
        </View>
        <View style={styles.progressBarBackground}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.max(stats.completionRate, 1)}%` },
            ]}
          />
        </View>
      </View>

      {/* 统计网格 */}
      <View style={styles.statsGrid}>
        {/* New */}
        <View style={[styles.statCard, styles.statCardNew]}>
          <Text style={[styles.statNumber, styles.statNumberNew]}>
            {stats.stageCounts.New}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelNew]}>New</Text>
        </View>

        {/* Learning */}
        <View style={[styles.statCard, styles.statCardLearning]}>
          <Text style={[styles.statNumber, styles.statNumberLearning]}>
            {stats.stageCounts.Learning}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelLearning]}>Learning</Text>
        </View>

        {/* Familiar */}
        <View style={[styles.statCard, styles.statCardFamiliar]}>
          <Text style={[styles.statNumber, styles.statNumberFamiliar]}>
            {stats.stageCounts.Familiar}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelFamiliar]}>Familiar</Text>
        </View>

        {/* Good */}
        <View style={[styles.statCard, styles.statCardGood]}>
          <Text style={[styles.statNumber, styles.statNumberGood]}>
            {stats.stageCounts.Good}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelGood]}>Good</Text>
        </View>

        {/* Strong */}
        <View style={[styles.statCard, styles.statCardStrong]}>
          <Text style={[styles.statNumber, styles.statNumberStrong]}>
            {stats.stageCounts.Strong}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelStrong]}>Strong</Text>
        </View>

        {/* Mastered */}
        <View style={[styles.statCard, styles.statCardMastered]}>
          <Text style={[styles.statNumber, styles.statNumberMastered]}>
            {stats.stageCounts.Mastered}
          </Text>
          <Text style={[styles.statLabel, styles.statLabelMastered]}>Mastered</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 0.615,
    marginBottom: 12,
    borderWidth: 0.615,
    borderColor: '#E5E5E5',
    overflow: 'hidden',
  },
  headerGradient: {
    width: '100%',
  },
  header: {
    padding: 18,
    paddingTop: 18.615,
    paddingBottom: 18,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#0A0A0A',
    letterSpacing: -0.45,
  },
  deadlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  deadlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF9C2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20642200,
    height: 24,
  },
  deadlineText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#A65F00',
  },
  daysLeftText: {
    fontSize: 12,
    color: '#0A0A0A',
    fontWeight: '400',
  },
  progressSection: {
    padding: 18,
    paddingTop: 18,
    paddingBottom: 18,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '400',
    color: '#0A0A0A',
    letterSpacing: -0.15,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#4A5565',
    letterSpacing: -0.15,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: 'rgba(120,116,150,0.08)',
    borderRadius: 24,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#0A0A0A',
    borderRadius: 24,
    minWidth: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 18,
    paddingBottom: 18.615,
    justifyContent: 'space-between',
  },
  statCard: {
    width: '31%',
    height: 67,
    borderRadius: 4,
    paddingTop: 8,
    paddingHorizontal: 8,
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 16,
    fontWeight: '400',
    marginBottom: 0,
    lineHeight: 25.6,
    letterSpacing: -0.31,
  },
  statLabel: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 25.6,
    letterSpacing: -0.31,
    textTransform: 'none',
  },
  // New 样式
  statCardNew: {
    backgroundColor: '#F9FAFB',
  },
  statNumberNew: {
    color: '#4A5565',
  },
  statLabelNew: {
    color: '#6A7282',
  },
  // Learning 样式
  statCardLearning: {
    backgroundColor: '#FEF2F2',
  },
  statNumberLearning: {
    color: '#E7000B',
  },
  statLabelLearning: {
    color: '#6A7282',
  },
  // Familiar 样式
  statCardFamiliar: {
    backgroundColor: '#FFF7ED',
  },
  statNumberFamiliar: {
    color: '#FF6900',
  },
  statLabelFamiliar: {
    color: '#6A7282',
  },
  // Good 样式
  statCardGood: {
    backgroundColor: '#FEFCE8',
  },
  statNumberGood: {
    color: '#D08700',
  },
  statLabelGood: {
    color: '#6A7282',
  },
  // Strong 样式
  statCardStrong: {
    backgroundColor: '#FAF5FF',
  },
  statNumberStrong: {
    color: '#4E49FC',
  },
  statLabelStrong: {
    color: '#6A7282',
  },
  // Mastered 样式
  statCardMastered: {
    backgroundColor: '#F0FDF4',
  },
  statNumberMastered: {
    color: '#00A63E',
  },
  statLabelMastered: {
    color: '#6A7282',
  },
});

