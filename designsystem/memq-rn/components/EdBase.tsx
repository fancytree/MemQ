import { ScrollView, View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import type { ReactNode } from 'react';

interface EdBaseProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Bottom inset to clear the tab bar — defaults to 70 when rendered inside (tabs). */
  bottomInset?: number;
  scroll?: boolean;
}

/**
 * Editorial base surface. Warm off-white background, scroll by default,
 * with bottom padding so the tab bar's elevated FAB doesn't cover content.
 */
export function EdBase({ children, style, bottomInset = 70, scroll = true }: EdBaseProps) {
  if (!scroll) {
    return (
      <View style={[styles.root, { paddingBottom: bottomInset }, style]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[{ paddingBottom: bottomInset }, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
