import React from 'react';
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  TouchableOpacity,
  TouchableOpacityProps,
  ViewStyle,
} from 'react-native';

type ButtonProps = Omit<TouchableOpacityProps, 'style'> & {
  label?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function Button({ label, children, style, textStyle, ...props }: ButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!props.disabled, ...props.accessibilityState }}
      {...props}
      style={[styles.target, style]}
    >
      {label ? <Text style={textStyle}>{label}</Text> : children}
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({ target: { minHeight: 44, minWidth: 44, justifyContent: 'center' } });
