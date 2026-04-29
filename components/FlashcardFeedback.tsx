import React, { useEffect } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface FlashcardFeedbackProps {
  correctAnswer: string;
  explanation: string | null;
  onFlipBack: () => void;
}

export default function FlashcardFeedback({
  correctAnswer,
  explanation,
  onFlipBack,
}: FlashcardFeedbackProps) {
  const flipProgress = useSharedValue(0);

  useEffect(() => {
    // 自动触发翻转动画
    flipProgress.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, []);

  // 正面样式（初始状态，翻转后隐藏）
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const progress = flipProgress.value;
    // 使用 rotateY 创建 3D 翻转效果
    const rotateY = progress * 180;
    // 在翻转过程中，当超过 90 度时隐藏
    const opacity = progress < 0.5 ? 1 : 0;
    // 添加透视效果，让翻转更真实
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  // 背面样式（初始隐藏，翻转后显示）
  const backAnimatedStyle = useAnimatedStyle(() => {
    const progress = flipProgress.value;
    // 背面从 180 度开始，翻转回 0 度
    const rotateY = 180 + progress * 180;
    // 在翻转过程中，当超过 90 度时显示
    const opacity = progress > 0.5 ? 1 : 0;
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  const handleFlipBack = () => {
    flipProgress.value = withTiming(
      0,
      {
        duration: 800,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1), // 使用相同的缓动函数
      },
      () => {
        onFlipBack();
      }
    );
  };

  return (
    <View style={styles.container}>
      {/* 正面（问题面）- 初始可见，翻转后隐藏 */}
      <Animated.View style={[styles.card, frontAnimatedStyle]}>
        <View style={styles.placeholder} />
      </Animated.View>

      {/* 背面（答案面）- 初始隐藏，翻转后显示 */}
      <Animated.View style={[styles.card, styles.backCard, backAnimatedStyle]}>
        <TouchableOpacity
          style={styles.backContent}
          onPress={handleFlipBack}
          activeOpacity={0.9}
        >
          {/* 顶部答案区 */}
          <View style={styles.answerSection}>
            <Text style={styles.answerLabel}>CORRECT ANSWER:</Text>
            <Text style={styles.answerText}>{correctAnswer}</Text>
          </View>

          {/* 中间解析区 */}
          {explanation && (
            <View style={styles.explanationSection}>
              <Text style={styles.explanationLabel}>EXPLANATION:</Text>
              <Text style={styles.explanationText}>{explanation}</Text>
            </View>
          )}

          {/* 底部操作区 */}
          <View style={styles.actionSection}>
            <Text style={styles.actionText}>Tap to see question again</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 400,
    marginTop: 16,
    // 添加透视效果，让 3D 翻转更真实
    transform: [{ perspective: 1000 }],
  },
  card: {
    position: 'absolute',
    width: '100%',
    minHeight: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
    // 确保背面不可见
    backfaceVisibility: 'hidden',
  },
  backCard: {
    // 背面初始状态，已通过动画样式控制
  },
  placeholder: {
    flex: 1,
  },
  backContent: {
    flex: 1,
  },
  // 顶部答案区
  answerSection: {
    backgroundColor: '#F0FDF4',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  answerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  answerText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#166534',
    marginTop: 8,
  },
  // 中间解析区
  explanationSection: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    flex: 1,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 16,
    color: '#374151',
    marginTop: 8,
    lineHeight: 24,
  },
  // 底部操作区
  actionSection: {
    backgroundColor: '#F9FAFB',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  actionText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },
});

