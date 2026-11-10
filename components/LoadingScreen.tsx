/**
 * 启动加载页面
 * 显示Logo和loading动画，在首页数据加载完成后自动隐藏
 */

import Logo from '@/components/icons/Logo';
import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/theme/colors';

interface LoadingScreenProps {
  visible: boolean;
}

export default function LoadingScreen({ visible }: LoadingScreenProps) {
  if (!visible) {
    return null;
  }

  // 使用 Modal 确保覆盖在所有内容之上，包括 native splash screen
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="none"
      statusBarTranslucent={true}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {/* Logo - 白色版本 */}
          <View style={styles.logoContainer}>
            <Logo width={200} color={colors.action} />
          </View>

          {/* Loading 动画 */}
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.action} />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 32,
  },
  loadingContainer: {
    marginTop: 24,
  },
});
