/**
 * The app's button.
 *
 * Every filled or outlined button on a screen is this one. It is a lipped surface
 * (components/ui/LedgePressable): a darker shell with a lighter face on it, pressed
 * flat by the depth of its own lip. What changes between buttons is only what it is
 * for — `size` for how much of the screen it is asking for, `variant` for whether it
 * is the thing to press or the way out of it — and both come from
 * componentTokens.button, not from the screen.
 *
 * Before this, the same button was written out by hand on every screen: eight
 * heights, ten corner radii and four label sizes for what was meant to be one
 * control. A screen that needs a geometry this does not have is a reason to change
 * the tokens, not to write a twenty-fifth button.
 *
 * `style` is for where the button sits — margins, alignment, `flex: 1` in a row —
 * never for how it looks. The one exception is `tone`, for a button standing on
 * artwork with a ground of its own rather than on the app's canvas: it takes the
 * scene's colours and everything else — height, radius, lip, label, press, hit
 * target — still comes from the tokens.
 */

import { componentTokens, fonts, hairline, interaction } from '@/theme';
import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, View,
  type PressableProps, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import { LedgePressable } from './LedgePressable';

export type ButtonSize = 'xl' | 'lg' | 'md' | 'sm';
export type ButtonVariant = 'primary' | 'danger' | 'secondary' | 'ghost' | 'quiet';

type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /** `xl` a screen that is one decision, `lg` the action a screen wants, `md` an
   *  action within it, `sm` a control. */
  size?: ButtonSize;
  /** `primary` is filled and leads; `danger` is the same weight for the choice
   *  that destroys something; `secondary` is the quieter way out; `ghost` and
   *  `quiet` have no surface at all — a word that acts, beside something that
   *  already carries the weight. */
  variant?: ButtonVariant;
  /** `full` spans its parent, `hug` takes only the width of its label.
   *
   *  It is `alignSelf` underneath, so it says WHERE as well as how wide, and that
   *  is the whole of the trap. In a column that stretches its children, `hug` is
   *  what stops the button spanning — and puts it at the left. In a column that
   *  already centres them, the button is hug-width anyway and `hug` only drags it
   *  off to the left: every empty and error state in the app had this, a centred
   *  drawing over centred copy over a button against the left margin. In a ROW the
   *  button is hug-width anyway and `hug` pulls it to the top instead, because
   *  there the cross axis is vertical.
   *
   *  So: pass it when the parent stretches and the button should not. Leave it
   *  alone when the parent centres, or when the button sits beside something. */
  width?: 'full' | 'hug';
  /** Drawn before the label, inside the face. */
  icon?: ReactNode;
  /** Drawn after the label. */
  iconEnd?: ReactNode;
  /** Shows a spinner in place of the label and refuses presses. */
  loading?: boolean;
  /** Only for a button on its own artwork, where the app's canvas colours do not
   *  apply — the welcome screens. A variant covers every button on a normal page. */
  tone?: { shell: string; face: string; label: string };
  /** Where the button sits, not how it looks. */
  style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
};

export function Button({
  label, size = 'lg', variant = 'primary', width = 'full',
  icon, iconEnd, loading = false, disabled, tone, style, labelStyle,
  accessibilityLabel, accessibilityState, ...props
}: ButtonProps) {
  const blocked = disabled || loading;
  const shape = token[size];
  const paint = tone ?? token[variant];
  const surfaceless = variant === 'ghost' || variant === 'quiet';
  // A filled action presses from the lead depth; everything quieter from the
  // shallow one, including a small filled button, which is not a screen's lead.
  const lip = surfaceless ? 0
    : (variant === 'primary' || variant === 'danger') && size !== 'sm' ? token.lip.lead
    : token.lip.control;

  // Without a surface there is no lip to use up, so pressing dims the word instead.
  if (surfaceless) {
    return (
      <Pressable
        {...props}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ ...accessibilityState, disabled: !!blocked, busy: loading }}
        disabled={blocked}
        hitSlop={8}
        style={({ pressed }) => [
          styles.bare,
          { minHeight: Math.max(shape.height, interaction.minTarget), gap: shape.gap },
          width === 'hug' && styles.hug,
          pressed && styles.pressed,
          blocked && styles.blocked,
          style,
        ]}
      >
        {loading
          ? <ActivityIndicator color={paint.label} />
          : <>
              {icon}
              <Text numberOfLines={1} style={[shape.label, variant === 'ghost' && styles.leading, { color: paint.label }, labelStyle]}>{label}</Text>
              {iconEnd}
            </>}
      </Pressable>
    );
  }

  return (
    <LedgePressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ ...accessibilityState, disabled: !!blocked, busy: loading }}
      disabled={blocked}
      style={[
        styles.shell,
        { height: shape.height + lip, paddingBottom: lip, backgroundColor: paint.shell },
        width === 'hug' && styles.hug,
        blocked && styles.blocked,
        style,
      ]}
    >
      {/* The face. It carries the colour you see and the padding the label sits in;
          the shell behind it is the lip, and is drawn by LedgePressable. */}
      <View style={[styles.face, {
        backgroundColor: paint.face,
        paddingHorizontal: shape.paddingHorizontal,
        gap: shape.gap,
      }, 'border' in paint && { borderWidth: hairline, borderColor: paint.border }]}>
        {loading
          ? <ActivityIndicator color={paint.label} />
          : <>
              {icon}
              <Text numberOfLines={1} style={[shape.label, { color: paint.label }, labelStyle]}>{label}</Text>
              {iconEnd}
            </>}
      </View>
    </LedgePressable>
  );
}

const token = componentTokens.button;
const styles = StyleSheet.create({
  // The shell is the darker layer and the lip is its bottom edge showing under the
  // face, so the shell holds the height and the lip and nothing else: padding here
  // would inset the face and leave the shell showing down both sides as well.
  shell: { minWidth: interaction.minTarget, borderRadius: token.radius },
  face: {
    flex: 1,
    borderRadius: token.radius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Cross-axis start: the left of a column, the top of a row, and nothing at all
  // in a parent that centres — where it is not wanted in the first place.
  hug: { alignSelf: 'flex-start' },
  // A surfaceless button is the label and the room to hit it, and nothing else.
  bare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  // `ghost` leads somewhere, so it is set in the weight a filled button would use;
  // `quiet` keeps the weight of the words around it and stays out of the way.
  leading: { fontFamily: fonts.semibold },
  pressed: { opacity: token.pressedOpacity },
  blocked: { opacity: token.disabledOpacity },
});
