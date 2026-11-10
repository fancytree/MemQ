import { ScrollView, View, ViewStyle, StyleProp, StyleSheet } from 'react-native';
import { colors } from '@/theme';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface EdBaseProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Bottom inset to clear the tab bar — defaults to 70 when rendered inside (tabs). */
  bottomInset?: number;
  scroll?: boolean;
}

/**
 * Editorial base surface. White canvas, scroll by default,
 * with bottom padding so the tab bar's elevated FAB doesn't cover content.
 */
export function EdBase({ children, style, bottomInset = 70, scroll = true }: EdBaseProps) {
  const insets = useSafeAreaInsets();
  const topInset = insets.top;

  if (!scroll) {
    return (
      <View style={[styles.root, { paddingTop: topInset, paddingBottom: bottomInset }, style]}>
        {children}
      </View>
    );
  }
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[{ paddingTop: topInset, paddingBottom: bottomInset }, style]}
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
