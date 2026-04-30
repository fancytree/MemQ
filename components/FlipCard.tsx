import React, { useEffect } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

interface FlipCardProps {
  frontContent: React.ReactNode;
  backContent: React.ReactNode;
  isFlipped: boolean;
  onFlip: () => void;
  canFlip?: boolean; // 是否允许翻转（仅在 showFeedback 为 true 时）
}

export default function FlipCard({
  frontContent,
  backContent,
  isFlipped,
  onFlip,
  canFlip = false,
}: FlipCardProps) {
  const flipProgress = useSharedValue(0);

  useEffect(() => {
    // 根据 isFlipped 状态更新动画值
    flipProgress.value = withTiming(isFlipped ? 1 : 0, {
      duration: 800,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    });
  }, [isFlipped]);

  // 正面样式（初始状态，翻转后隐藏）
  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = flipProgress.value * 180;
    const opacity = flipProgress.value < 0.5 ? 1 : 0;
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  // 背面样式（初始隐藏，翻转后显示）
  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = 180 + flipProgress.value * 180;
    const opacity = flipProgress.value > 0.5 ? 1 : 0;
    return {
      transform: [{ rotateY: `${rotateY}deg` }],
      opacity,
    };
  });

  return (
    <View style={styles.container}>
      {/* 正面（题目面） */}
      <Animated.View
        style={[styles.card, frontAnimatedStyle]}
        pointerEvents={isFlipped ? 'none' : 'box-none'}
      >
        {frontContent}
        {/* 透明的点击覆盖层，只在允许翻转时显示 */}
        {!isFlipped && canFlip && (
          <TouchableOpacity
            onPress={onFlip}
            activeOpacity={1}
            style={styles.overlay}
          />
        )}
      </Animated.View>

      {/* 背面（答案面） */}
      <Animated.View
        style={[styles.card, styles.backCard, backAnimatedStyle]}
        pointerEvents={isFlipped ? 'auto' : 'none'}
      >
        {backContent}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    // 添加透视效果，让 3D 翻转更真实
    transform: [{ perspective: 1000 }],
    // 确保阴影不被裁剪
    overflow: 'visible',
    // 确保卡片占满宽度和高度
    alignSelf: 'stretch',
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 0.615,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    paddingHorizontal: 18.615,
    paddingTop: 24.615,
    paddingBottom: 12, // "Tap to reveal explanation" 与卡片底部的距离为 12px
    gap: 12,
    // 阴影：0px_12px_20px_-5px_rgba(0,0,0,0.05),0px_6px_8px_-6px_rgba(0,0,0,0.05)
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 4,
    // 确保圆角和阴影不被裁剪
    overflow: 'visible',
    // 确保背面不可见
    backfaceVisibility: 'hidden',
  },
  backCard: {
    // 背面初始状态，已通过动画样式控制
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});

