import { Icon } from '@/components/ui/Icon';
import { space, radius } from '@/theme/spacing';
import { type } from '@/theme/typography';
import { colors } from '@/theme/colors';
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
    <TouchableOpacity accessibilityRole="button"
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
      <TouchableOpacity accessibilityRole="button"
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
    padding: space[4],
    marginBottom: space[4],
  },
  topInfoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[3],
  },
  dueDateBadge: {
    backgroundColor: t.color.inner,
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: t.radius.sm,
    borderWidth: 1,
    borderColor: t.color.border,
  },
  dueDateText: {
    ...type.caption,
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  daysLeftText: {
    ...type.caption,
    color: t.color.muted,
  },
  titleSection: {
    marginBottom: space[4],
  },
  title: {
    ...type.heading,
    color: t.color.textHigh,
  },
  description: {
    ...type.caption,
    color: t.color.text,
    marginTop: space[1],
  },
  progressSection: {
    marginBottom: space[3],
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[2],
  },
  progressLabel: {
    ...type.caption,
    color: t.color.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  progressPercentage: {
    ...type.small,
    color: colors.sub,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: t.color.inner,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: t.color.accent,
    borderRadius: radius.sm,
  },
  progressText: {
    ...type.caption,
    color: t.color.muted,
    marginTop: space[2],
  },
  studyButton: { minHeight: 44,
    backgroundColor: t.color.accentLight,
    borderRadius: t.radius.md,
    paddingVertical: space[2],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[1],
    borderWidth: 1,
    borderColor: colors.faint,
  },
  studyButtonText: {
    ...type.small,
    color: colors.action,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
});

