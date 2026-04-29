import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
          <TouchableOpacity
            onPress={onEdit}
            style={styles.actionButton}
            activeOpacity={0.6}
          >
            <Feather name="edit" size={18} color="#9CA3AF" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onDelete}
            style={[styles.actionButton, styles.deleteButton]}
            activeOpacity={0.6}
          >
            <Feather name="trash-2" size={18} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  termLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2563EB',
    marginRight: 8,
  },
  termText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  definitionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 8,
  },
  definitionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#059669',
    marginRight: 8,
  },
  definitionText: {
    flex: 1,
    fontSize: 16,
    color: '#374151',
    lineHeight: 24,
  },
  explanationContainer: {
    marginTop: 12,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#E5E7EB',
  },
  explanationText: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
  },
  statusBadge: {
    borderRadius: 9999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  // New 状态样式 - 与 LessonStatsCard 一致
  statusBadgeNew: {
    backgroundColor: '#F9FAFB',
  },
  statusTextNew: {
    color: '#4A5565',
  },
  // Learning 状态样式 - 与 LessonStatsCard 一致
  statusBadgeLearning: {
    backgroundColor: '#FEF2F2',
  },
  statusTextLearning: {
    color: '#E7000B',
  },
  // Familiar 状态样式 - 与 LessonStatsCard 一致
  statusBadgeFamiliar: {
    backgroundColor: '#FFF7ED',
  },
  statusTextFamiliar: {
    color: '#FF6900',
  },
  // Good 状态样式 - 与 LessonStatsCard 一致
  statusBadgeGood: {
    backgroundColor: '#FEFCE8',
  },
  statusTextGood: {
    color: '#D08700',
  },
  // Strong 状态样式 - 与 LessonStatsCard 一致
  statusBadgeStrong: {
    backgroundColor: '#FAF5FF',
  },
  statusTextStrong: {
    color: '#4E49FC',
  },
  // Mastered 状态样式 - 与 LessonStatsCard 一致
  statusBadgeMastered: {
    backgroundColor: '#F0FDF4',
  },
  statusTextMastered: {
    color: '#00A63E',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 4,
  },
  deleteButton: {
    marginLeft: 8,
  },
});

