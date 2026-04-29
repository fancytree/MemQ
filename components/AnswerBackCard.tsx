import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface AnswerBackCardProps {
  correctAnswer: string;
  explanation: string | null;
  onFlipBack: () => void;
  questionText?: string; // 添加问题文本
}

export default function AnswerBackCard({
  correctAnswer,
  explanation,
  onFlipBack,
  questionText,
}: AnswerBackCardProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onFlipBack}
      activeOpacity={0.9}
    >
      {/* 顶部 - 问题文本区域 */}
      <View style={styles.questionSection}>
        {questionText && (
          <Text style={styles.questionText}>{questionText}</Text>
        )}
      </View>

      {/* 中间 - 正确答案和解析区域 */}
      <View style={styles.contentSection}>
        {/* 正确答案区 */}
        <View style={styles.correctAnswerContainer}>
          <Text style={styles.correctAnswerLabel}>Correct Answer:</Text>
          <Text style={styles.correctAnswerText}>{correctAnswer}</Text>
        </View>

        {/* 解析区 */}
        {explanation && (
          <View style={styles.explanationContainer}>
            <Text style={styles.explanationLabel}>Explanation:</Text>
            <Text style={styles.explanationText}>{explanation}</Text>
          </View>
        )}
      </View>

      {/* 底部提示 */}
      <View style={styles.footerSection}>
        <Text style={styles.footerText}>Tap to see question again</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // 边距已经在 FlipCard 的 card 样式中设置，这里不需要重复设置
    gap: 12,
  },
  // 顶部 - 问题文本区域
  questionSection: {
    height: 265.77,
    justifyContent: 'center',
    gap: 4,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '400',
    color: '#0A0A0A',
    lineHeight: 28,
    letterSpacing: -0.4492,
  },
  // 中间 - 内容区域
  contentSection: {
    gap: 16,
    flex: 1,
  },
  // 正确答案区
  correctAnswerContainer: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.846,
    borderColor: '#F0FDF4',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  correctAnswerLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#4A5565',
    lineHeight: 16,
  },
  correctAnswerText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#00A63E',
    lineHeight: 28,
    letterSpacing: -0.4395,
  },
  // 解析区
  explanationContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    gap: 8,
  },
  explanationLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#4A5565',
    lineHeight: 16,
  },
  explanationText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#1E2939',
    lineHeight: 18,
  },
  // 底部提示
  footerSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 0,
  },
  footerText: {
    fontSize: 12,
    color: '#6A7282',
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 16,
  },
});

