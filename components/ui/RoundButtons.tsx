import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

/** The round control all three are cut from: a shell with a white face on it,
 *  offset so a band of the shell shows along the bottom edge. A small control, so
 *  it carries the shallowest lip of the three depths. */
type Glyph = keyof typeof Feather.glyphMap;

function RoundButton({ icon, color, onPress, label, size, disabled, busy }: {
  icon: Glyph;
  color: string;
  onPress: () => void;
  label: string;
  size: number;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!busy, busy: !!busy }}
      disabled={disabled || busy} onPress={onPress} hitSlop={8}
      style={[styles.shell, (disabled || busy) && styles.off]}>
      <View style={styles.face}>
        {busy
          ? <ActivityIndicator size="small" color={color} />
          : <Feather name={icon} size={size} color={color} />}
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
export function ConfirmButton({ onPress, label = 'Done', size = 22, disabled = false, busy = false }: {
  onPress: () => void;
  label?: string;
  size?: number;
  disabled?: boolean;
  /** Mid-commit: the tick gives way to a spinner, since the word it replaced used
   *  to carry that news itself ("Creating…"). */
  busy?: boolean;
}) {
  return (
    <RoundButton icon="check" color={homeColors.primary} onPress={onPress}
      label={label} size={size} disabled={disabled} busy={busy} />
  );
}

/** Any other icon action that sits in a top bar or a toolbar — edit, delete, retry.
 *  There was a second round button in the app for these: the same 44 circle, but
 *  filled flat with the pale focus yellow and with no lip, so a bar holding one of
 *  each showed two different ideas of what a round button is. */
export function RoundAction({ icon, onPress, label, size = 20, color = homeColors.deep, disabled }: {
  icon: Glyph;
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  disabled?: boolean;
}) {
  return <RoundButton icon={icon} color={color} onPress={onPress} label={label} size={size} disabled={disabled} />;
}

/** The third of the set, for a bar that steps back rather than dismisses: going back
 *  to the previous step keeps what was typed there, which a cross would deny. */
export function BackButton({ onPress, label = 'Back', size = 22 }: {
  onPress: () => void;
  label?: string;
  size?: number;
}) {
  return <RoundButton icon="arrow-left" color={homeColors.deep} onPress={onPress} label={label} size={size} />;
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
