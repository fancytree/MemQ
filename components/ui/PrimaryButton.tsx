import type { ReactNode } from 'react';
import { colors, componentTokens, elevation, interaction } from '@/theme';
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../Icon';
import { DesignAsset } from '../DesignAsset';

type PrimaryButtonProps = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  endIcon?: ReactNode;
};

/** Default geometry from Today. Pressed/loading/disabled behavior is an implementation extension. */
export function PrimaryButton({ label, loading = false, disabled, style, accessibilityState, endIcon, ...props }: PrimaryButtonProps) {
  const blocked = disabled || loading;
  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={(state) => [styles.root, state.pressed && styles.pressed, blocked && styles.disabled,
        typeof style === 'function' ? style(state) : style]}
    >
      <Text style={[styles.label, blocked && styles.disabledLabel]}>{label}</Text>
      <View accessible={false} style={styles.end}>
        {loading ? <ActivityIndicator color={colors.disabledText} /> : !blocked ? (endIcon ?? <DesignAsset name="arrow" />) :
          <Icon name="arrowRight" size={componentTokens.icon.actionSize} strokeWidth={componentTokens.icon.actionStroke} color={blocked ? colors.disabledText : colors.onAction} />}
      </View>
    </Pressable>
  );
}
const { color: _labelColor, label: _labelStyle, ...primaryStyle } = componentTokens.primaryAction;
const styles = StyleSheet.create({
  root: { ...primaryStyle, ...elevation.none, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 },
  label: { ...componentTokens.primaryAction.label, color: colors.onAction, flexShrink: 1 },
  end: { minWidth: 18, alignItems: 'center' },
  pressed: { backgroundColor: interaction.pressed },
  disabled: { backgroundColor: interaction.disabled.backgroundColor },
  disabledLabel: { color: interaction.disabled.color },
});
