/**
 * A button that is only an icon.
 *
 * The same lipped surface as components/ui/Button, cut round: a shell with a face
 * on it that presses flat. Everything in the app that is a glyph you can press is
 * this — closing a sheet, going back, confirming a bar, playing a word, sending a
 * message, clearing a field — so they are all the same size, the same corner and
 * the same depth, instead of the five different discs the app used to hold.
 *
 * It has no label on screen, so `label` is not optional: it is what the button is
 * called for anyone who cannot see the glyph.
 */

import { componentTokens, hairline, interaction } from '@/theme';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, View,
  type PressableProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { LedgePressable } from './LedgePressable';
import type { ButtonVariant } from './Button';

export type IconButtonSize = 'xl' | 'lg' | 'md' | 'sm';

type IconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  /** The glyph. Sized by the caller, so an icon set's own sizing still applies. */
  children: ReactNode;
  /** What this does, for screen readers. Not optional: nothing else says it. */
  label: string;
  size?: IconButtonSize;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  children, label, size = 'md', variant = 'secondary', loading = false,
  disabled, style, accessibilityState, ...props
}: IconButtonProps) {
  const blocked = disabled || loading;
  const side = token.size[size];
  const paint = componentTokens.button[variant];
  const surfaceless = variant === 'ghost' || variant === 'quiet';
  const lip = surfaceless ? 0 : token.lip[size];
  // The lip is inside the diameter, so the silhouette stays a circle.
  const shape = { width: side, height: side, borderRadius: token.radius };

  if (surfaceless) {
    return (
      <Pressable
        {...props}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ ...accessibilityState, disabled: !!blocked, busy: loading }}
        disabled={blocked}
        hitSlop={Math.max(0, (interaction.minTarget - side) / 2)}
        style={({ pressed }) => [styles.centre, shape, pressed && styles.pressed, blocked && styles.blocked, style]}
      >
        {loading ? <ActivityIndicator size="small" color={paint.label} /> : children}
      </Pressable>
    );
  }

  return (
    <LedgePressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ ...accessibilityState, disabled: !!blocked, busy: loading }}
      disabled={blocked}
      hitSlop={Math.max(0, (interaction.minTarget - side) / 2)}
      style={[{ ...shape, paddingBottom: lip, backgroundColor: paint.shell }, blocked && styles.blocked, style]}
    >
      <View style={[styles.face, { borderRadius: token.radius, backgroundColor: paint.face },
        'border' in paint && { borderWidth: hairline, borderColor: paint.border }]}>
        {loading ? <ActivityIndicator size="small" color={paint.label} /> : children}
      </View>
    </LedgePressable>
  );
}

const token = componentTokens.iconButton;
const styles = StyleSheet.create({
  face: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: componentTokens.button.pressedOpacity },
  blocked: { opacity: componentTokens.button.disabledOpacity },
});
