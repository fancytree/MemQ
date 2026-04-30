import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { colors } from '@/theme';
import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
  size?: number;
}

/** Small uppercase tracked label — used as a section header throughout. */
export function SectionLabel({ children, style, color, size }: SectionLabelProps) {
  return (
    <Text style={[styles.label, color ? { color } : null, size ? { fontSize: size } : null, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 10,
    color: colors.muted,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
});
