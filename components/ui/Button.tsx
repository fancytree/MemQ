import React from 'react';
import {
  StyleProp,
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
    <TouchableOpacity style={style} {...props}>
      {label ? <Text style={textStyle}>{label}</Text> : children}
    </TouchableOpacity>
  );
}

