import { Button } from '@/components/ui/Button';
import { colors } from '@/theme';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 学习阶段类型
type LearningStage = 'New' | 'Learning' | 'Familiar' | 'Good' | 'Strong' | 'Mastered';

interface Term {
  id: string;
  term: string;
  definition: string;
  explanation: string | null;
}

interface TermCardProps {
  term: Term;
  status: LearningStage;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TermCard({ term, status, onEdit, onDelete }: TermCardProps) {
  return (
    <View style={styles.container}>
      {/* Term 行 */}
      <View style={styles.termRow}>
        <Text style={styles.termLabel}>T:</Text>
        <Text style={styles.termText}>{term.term}</Text>
      </View>

      {/* Definition 行 */}
      <View style={styles.definitionRow}>
        <Text style={styles.definitionLabel}>D:</Text>
        <Text style={styles.definitionText}>{term.definition}</Text>
      </View>

      {/* Explanation 块（可选） */}
      {term.explanation && term.explanation.trim() && (
        <View style={styles.explanationContainer}>
          <Text style={styles.explanationText}>{term.explanation}</Text>
        </View>
      )}

      {/* 底部栏 */}
      <View style={styles.footer}>
        {/* 左侧：状态标签 */}
        <View style={[styles.statusBadge, styles[`statusBadge${status}`]]}>
          <Text style={[styles.statusText, styles[`statusText${status}`]]}>
            {status}
          </Text>
        </View>

        {/* 右侧：操作图标 */}
        <View style={styles.actions}>
          <Button
            onPress={onEdit}
            style={styles.actionButton}
            activeOpacity={0.6}
          >
            <Feather name="edit" size={16} color={colors.muted} />
          </Button>
          <Button
            onPress={onDelete}
            style={[styles.actionButton, styles.deleteButton]}
            activeOpacity={0.6}
          >
            <Feather name="trash-2" size={16} color={colors.muted} />
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surf,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    marginBottom: 12,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_700',
    marginRight: 8,
  },
  termText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '400',
    color: colors.text,
    fontFamily: 'JetBrainsMono_500',
  },
  definitionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  definitionLabel: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '400',
    color: colors.accent,
    fontFamily: 'JetBrainsMono_700',
    marginRight: 8,
  },
  definitionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    fontFamily: 'JetBrainsMono_400',
  },
  explanationContainer: {
    marginTop: 12,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  explanationText: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 19,
    fontFamily: 'JetBrainsMono_400',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontFamily: 'JetBrainsMono_700',
  },
  // New 状态样式 - 与 LessonStatsCard 一致
  statusBadgeNew: {
    backgroundColor: colors.bg,
    borderColor: colors.bg,
  },
  statusTextNew: {
    color: colors.muted,
  },
  // Learning 状态样式 - 与 LessonStatsCard 一致
  statusBadgeLearning: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEF2F2',
  },
  statusTextLearning: {
    color: '#E7000B',
  },
  // Familiar 状态样式 - 与 LessonStatsCard 一致
  statusBadgeFamiliar: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FFF7ED',
  },
  statusTextFamiliar: {
    color: '#FF6900',
  },
  // Good 状态样式 - 与 LessonStatsCard 一致
  statusBadgeGood: {
    backgroundColor: '#FEFCE8',
    borderColor: '#FEFCE8',
  },
  statusTextGood: {
    color: '#D08700',
  },
  // Strong 状态样式 - 与 LessonStatsCard 一致
  statusBadgeStrong: {
    backgroundColor: '#FAF5FF',
    borderColor: '#FAF5FF',
  },
  statusTextStrong: {
    color: colors.accent,
  },
  // Mastered 状态样式 - 与 LessonStatsCard 一致
  statusBadgeMastered: {
    backgroundColor: '#F0FDF4',
    borderColor: '#F0FDF4',
  },
  statusTextMastered: {
    color: '#00A63E',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteButton: {
    marginLeft: 8,
  },
});

