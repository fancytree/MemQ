import { fonts } from '@/theme/typography';
import { Text, StyleSheet, TextStyle, StyleProp } from 'react-native';
import { type, colors } from '@/theme';
import type { ReactNode } from 'react';

interface SectionLabelProps {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
  size?: number;
}

/** Legacy compact section label (use type.heading for new screen headings) — used as a section header throughout. */
export function SectionLabel({ children, style, color, size }: SectionLabelProps) {
  return (
    <Text style={[styles.label, color ? { color } : null, size ? { fontSize: Math.max(12, size) } : null, style]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    ...type.caption,
    color: colors.sub,
  },
});
