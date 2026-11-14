import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

/** The round control these two are cut from: a shell with a white face on it,
 *  offset so a band of the shell shows along the bottom edge. A small control, so
 *  it carries the shallowest lip of the three. */
function RoundButton({ icon, color, onPress, label, size, disabled }: {
  icon: 'x' | 'check';
  color: string;
  onPress: () => void;
  label: string;
  size: number;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled} onPress={onPress} hitSlop={8}
      style={[styles.shell, disabled && styles.off]}>
      <View style={styles.face}>
        <Feather name={icon} size={size} color={color} />
      </View>
    </Pressable>
  );
}

/** The way this app closes things.
 *
 * There were five: a white disc on a lip, a rounded square filled with canvas, a
 * circle filled with the nav grey, and twice a bare glyph with nothing under it. The
 * gesture is the same every time — put this away — so it should look the same every
 * time, and it should look like something, since a bare glyph on a gradient has no
 * edge to aim at.
 */
export function CloseButton({ onPress, label = 'Close', size = 22 }: {
  onPress: () => void;
  /** What is being closed, for anyone who cannot see the glyph. */
  label?: string;
  size?: number;
}) {
  return <RoundButton icon="x" color={homeColors.deep} onPress={onPress} label={label} size={size} />;
}

/** Its opposite, for a bar that both dismisses and commits: the same disc, a tick
 *  instead of a cross. The tick is the action purple, which is the colour the word
 *  it replaces was already written in — the shape says "a button", the colour says
 *  "this is the one that does the thing". */
export function ConfirmButton({ onPress, label = 'Done', size = 22, disabled = false }: {
  onPress: () => void;
  label?: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <RoundButton icon="check" color={homeColors.primary} onPress={onPress}
      label={label} size={size} disabled={disabled} />
  );
}

const styles = StyleSheet.create({
  shell: {
    width: 44,
    height: 42 + ledge.control,
    borderRadius: 22,
    backgroundColor: homeColors.border,
    paddingBottom: ledge.control,
  },
  off: { opacity: 0.45 },
  face: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: homeColors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
