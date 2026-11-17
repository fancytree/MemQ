/**
 * A chip: one of a set of choices.
 *
 * Not a button. A button is a thing to do — it has a pill's corner and, when it
 * leads, a deep lip. A chip is a thing to pick, so it is softer-cornered, carries
 * the shallow lip of a small control, and says which one it is by filling with the
 * action colour rather than by a tick or a tint.
 *
 * `selected` is the whole state. Where a set allows nothing to be chosen — a
 * reminder time that can be refused — tapping the chosen one again clears it, and
 * that is the screen's business, not the chip's.
 */

import { componentTokens, hairline } from '@/theme';
import type { ReactNode } from 'react';
import {
  StyleSheet, Text, View,
  type PressableProps, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LedgePressable } from './LedgePressable';

type ChipProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  selected?: boolean;
  /** Take an equal share of the row it is in, rather than hugging its label. */
  fill?: boolean;
  /** Drawn before the label. */
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function Chip({
  label, selected = false, fill = false, icon, disabled, style, labelStyle,
  accessibilityLabel, accessibilityState, ...props
}: ChipProps) {
  const paint = selected ? token.on : token.off;
  return (
    <LedgePressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, selected, disabled: !!disabled }}
      disabled={disabled}
      style={[
        styles.shell,
        { paddingBottom: token.lip, backgroundColor: paint.shell },
        fill && styles.fill,
        disabled && styles.blocked,
        style,
      ]}
    >
      <View style={[styles.face, { backgroundColor: paint.face },
        'border' in paint && { borderWidth: hairline, borderColor: paint.border }]}>
        {icon}
        <Text numberOfLines={1} style={[token.label, { color: paint.label }, labelStyle]}>{label}</Text>
      </View>
    </LedgePressable>
  );
}

const token = componentTokens.chip;
const styles = StyleSheet.create({
  shell: { borderRadius: token.radius },
  fill: { flex: 1 },
  face: {
    borderRadius: token.radius,
    paddingHorizontal: token.paddingHorizontal,
    paddingVertical: token.paddingVertical,
    gap: token.gap,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blocked: { opacity: componentTokens.button.disabledOpacity },
});
