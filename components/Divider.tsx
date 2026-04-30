import { View, ViewStyle, StyleProp } from 'react-native';
import { colors } from '@/theme';

interface DividerProps {
  style?: StyleProp<ViewStyle>;
  color?: string;
}

/** 1px hairline rule. */
export function Divider({ style, color = colors.border }: DividerProps) {
  return <View style={[{ height: 1, backgroundColor: color }, style]} />;
}
