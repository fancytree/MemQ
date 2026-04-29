import { Feather } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MemQTheme } from '@/constants/theme';

// 课程类型定义
interface Lesson {
  id: string;
  name: string;
  description: string | null;
  deadline: string | null;
  created_at: string;
}

interface LessonListCardProps {
  lesson: Lesson;
  totalTerms: number;
  completedTerms: number; // 用于显示底部文字（非 New 状态的数量）
  progress: number; // 加权进度百分比 (0-100)
  onPress: () => void;
  onStudyPress: () => void;
}

const t = MemQTheme;

export default function LessonListCard({
  lesson,
  totalTerms,
  completedTerms,
  progress,
  onPress,
  onStudyPress,
}: LessonListCardProps) {
  // 使用传入的 progress prop，确保在 0-100 范围内
  const progressPercentage = useMemo(() => {
    return Math.max(0, Math.min(100, Math.round(progress)));
  }, [progress]);

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
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {/* 顶部信息栏 */}
      {lesson.deadline && (
        <View style={styles.topInfoBar}>
          <View style={styles.dueDateBadge}>
            <Text style={styles.dueDateText}>Due {deadlineFormatted}</Text>
          </View>
          {daysLeft !== null && (
            <Text style={styles.daysLeftText}>{daysLeft} days left</Text>
          )}
        </View>
      )}

      {/* 标题区 */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>{lesson.name}</Text>
        {lesson.description && (
          <Text style={styles.description} numberOfLines={2}>
            {lesson.description}
          </Text>
        )}
      </View>

      {/* 进度区 */}
      <View style={styles.progressSection}>
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>Progress</Text>
          <Text style={styles.progressPercentage}>{progressPercentage}%</Text>
        </View>

        {/* 进度条 */}
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${progressPercentage}%` },
            ]}
          />
        </View>

        {/* 底部文字 */}
        <Text style={styles.progressText}>
          {completedTerms} / {totalTerms} items completed
        </Text>
      </View>

      {/* 底部按钮 */}
      <TouchableOpacity
        style={styles.studyButton}
        onPress={(e) => {
          e.stopPropagation(); // 阻止事件冒泡到卡片
          onStudyPress();
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.studyButtonText}>Study</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: t.color.surface,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.color.border,
    padding: 16,
    marginBottom: 16,
  },
  topInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dueDateBadge: {
    backgroundColor: t.color.inner,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.color.border,
  },
  dueDateText: {
    fontSize: 10,
    fontWeight: '600',
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  daysLeftText: {
    fontSize: 12,
    color: t.color.muted,
  },
  titleSection: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: t.color.textHigh,
  },
  description: {
    fontSize: 13,
    color: t.color.text,
    marginTop: 6,
    lineHeight: 19,
  },
  progressSection: {
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: '700',
    color: t.color.accent,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: t.color.inner,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: t.color.accent,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 11,
    color: t.color.muted,
    marginTop: 8,
  },
  studyButton: {
    backgroundColor: t.color.accentLight,
    borderRadius: t.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: t.color.border,
  },
  studyButtonText: {
    color: t.color.accent,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

