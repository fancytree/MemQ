/** A plain tappable area: the 44-point target and nothing else.
 *
 * Not the app's button — that is components/ui/Button, which is lipped and carries
 * the system's sizes and colours. This is for the things that are pressable but are
 * not buttons: a row, a chip a screen styles itself, an area over a card.
 */

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

type TapTargetProps = Omit<TouchableOpacityProps, 'style'> & {
  label?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function TapTarget({ label, children, style, textStyle, ...props }: TapTargetProps) {
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
