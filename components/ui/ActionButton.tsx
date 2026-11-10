import { colors, componentTokens, type } from '@/theme';
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text } from 'react-native';

type Props = Omit<PressableProps, 'children'> & { label: string; secondary?: boolean; loading?: boolean };
/** Centered form/dialog action using the shared primary-action geometry. */
export function ActionButton({ label, secondary = false, loading = false, disabled, style, ...props }: Props) {
  const blocked = disabled || loading;
  return <Pressable {...props} accessibilityRole="button" disabled={blocked}
    accessibilityState={{ disabled: !!blocked, busy: loading }}
    style={(state) => [styles.root, secondary && styles.secondary, state.pressed && styles.pressed,
      disabled && styles.disabled, typeof style === 'function' ? style(state) : style]}>
    {loading ? <ActivityIndicator color={secondary ? colors.text : colors.onAction} /> :
      <Text style={[styles.label, secondary && styles.secondaryLabel, disabled && styles.disabledLabel]}>{label}</Text>}
  </Pressable>;
}
const { label: _label, color: _color, ...geometry } = componentTokens.primaryAction;
const styles = StyleSheet.create({
  root: { ...geometry, alignItems: 'center', justifyContent: 'center' },
  label: { ...type.button, color: colors.onAction },
  secondary: { backgroundColor: colors.surfaceSubtle },
  secondaryLabel: { color: colors.text },
  pressed: { opacity: 0.8 },
  disabled: { backgroundColor: colors.disabledBg },
  disabledLabel: { color: colors.disabledText },
});
