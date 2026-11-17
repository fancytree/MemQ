/**
 * A raised surface — the white a screen's content stands on.
 *
 * It is the same two layers as a button: a shell in the line colour with a lighter
 * face sitting on it, offset so a band of the shell shows along the bottom edge
 * (theme/ledge.ts). In a flat palette that band is the only depth there is.
 *
 * Three ways of drawing it had grown up side by side — a real pair of layers, an
 * `elevation.card` token that faked the band with a four-point box shadow, and
 * twenty-two box shadows written out by hand in twelve files. Two of the three were
 * shadows, which this palette does not have, and all three disagreed about how deep
 * the band is. They are one object, so they are one component.
 *
 * `onPress` makes it press flat like a button, for a card that opens something. A
 * card that only holds content does not move, and should not be given one.
 *
 * `style` is for where the card sits — margins, `flex: 1`, alignment. `faceStyle`
 * is for how its content is laid out inside it — a row, centred, stretched. Neither
 * is for how it looks: a card that needs a surface this does not have is a reason
 * to change the token, not to override it here.
 */

import { componentTokens } from '@/theme';
import type { ReactNode } from 'react';
import {
  StyleSheet, View,
  type AccessibilityActionEvent, type AccessibilityActionInfo, type StyleProp, type ViewStyle,
} from 'react-native';
import { LedgePressable } from './LedgePressable';

export type CardCorner = keyof typeof componentTokens.card.radius;
export type CardPad = keyof typeof componentTokens.card.pad | 'none';

type CardProps = {
  children?: ReactNode;
  /** `lg` is the card a screen is made of; `xl` the tall ones a character perches
   *  on, where the corner has a much larger surface to carry. */
  corner?: CardCorner;
  /** Room inside the face. `none` for a card that lays out its own rows — a menu,
   *  a list — and pads them itself. */
  pad?: CardPad;
  /** Between the face's children. */
  gap?: number;
  /** Takes the height its parent offers, and lets its content do the same — a card
   *  that is the screen rather than a block on it. */
  fill?: boolean;
  /** The chosen one of several cards. Both layers take the action's colour. */
  selected?: boolean;
  /** Makes it a button: it presses flat by the depth of its own lip. */
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** For a card that can be acted on without touching it — a flashcard is swiped. */
  accessibilityActions?: ReadonlyArray<AccessibilityActionInfo>;
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  disabled?: boolean;
  /** Where the card sits, not how it looks. */
  style?: StyleProp<ViewStyle>;
  /** How its content is laid out inside the face, not how the face looks. */
  faceStyle?: StyleProp<ViewStyle>;
};

export function Card({
  children, corner = 'lg', pad = 'md', gap = token.gap, fill = false, selected = false,
  onPress, accessibilityLabel, accessibilityHint, accessibilityActions, onAccessibilityAction,
  disabled, style, faceStyle,
}: CardProps) {
  const radius = token.radius[corner];
  const paint = selected ? token.selected : token;
  const shell = [
    { backgroundColor: paint.shell, borderRadius: radius, paddingBottom: token.lip },
    fill && styles.fill, style,
  ];
  const face = (
    <View style={[
      { backgroundColor: paint.face, borderRadius: radius, gap, padding: pad === 'none' ? 0 : token.pad[pad] },
      fill && styles.fill,
      faceStyle,
    ]}>
      {children}
    </View>
  );

  // A card that opens something is a button, and presses like one; one that only
  // holds content is not asking to be pushed.
  if (!onPress) return <View style={shell}>{face}</View>;
  return (
    <LedgePressable onPress={onPress} disabled={disabled}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityActions={accessibilityActions} onAccessibilityAction={onAccessibilityAction}
      style={shell}>
      {face}
    </LedgePressable>
  );
}

const token = componentTokens.card;
const styles = StyleSheet.create({
  // minHeight 0 as well as flex, or a scrolling child refuses to shrink inside it.
  fill: { flex: 1, minHeight: 0 },
});
