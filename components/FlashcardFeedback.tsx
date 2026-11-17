import { space, type, componentTokens } from '@/theme';

const card = componentTokens.card;
import { colors } from '@/theme/colors';
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
        <View style={styles.face}><View style={styles.placeholder} /></View>
      </Animated.View>

      {/* 背面（答案面）- 初始隐藏，翻转后显示 */}
      <Animated.View style={[styles.card, styles.backCard, backAnimatedStyle]}>
        <View style={styles.face}>
        <TouchableOpacity accessibilityRole="button"
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
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    minHeight: 400,
    marginTop: space[4],
    // 添加透视效果，让 3D 翻转更真实
    transform: [{ perspective: 1000 }],
  },
  card: {
    position: 'absolute',
    width: '100%',
    minHeight: 400,
    // The same two layers every raised surface carries. The shell is here rather
    // than a components/ui/Card because the flip's animated style needs an
    // Animated.View; the face below is the white you see.
    borderRadius: card.radius.lg,
    backgroundColor: card.shell,
    paddingBottom: card.lip,
    overflow: 'hidden',
    backfaceVisibility: 'hidden',
  },
  face: {
    flex: 1,
    borderRadius: card.radius.lg,
    backgroundColor: card.face,
    overflow: 'hidden',
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
    backgroundColor: colors.greenL,
    padding: space[5],
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  answerLabel: {
    ...type.caption,
    color: colors.green,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: space[2],
  },
  answerText: {
    ...type.page,
    color: colors.green,
    marginTop: space[2],
  },
  // 中间解析区
  explanationSection: {
    backgroundColor: colors.surf,
    padding: space[5],
    flex: 1,
  },
  explanationLabel: {
    ...type.caption,
    color: colors.sub,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: space[2],
  },
  explanationText: {
    ...type.body,
    color: colors.sub,
    marginTop: space[2],
  },
  // 底部操作区
  actionSection: {
    backgroundColor: colors.panel,
    padding: space[4],
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  actionText: {
    ...type.small,
    color: colors.sub,
    textAlign: 'center',
  },
});

