/**
 * The round controls a page's furniture is made of: close, confirm, back, and any
 * other single glyph in a bar.
 *
 * They are all components/ui/IconButton now — one disc, one depth — and these four
 * are the names the screens call it by, so that "the way this app closes things"
 * stays one decision rather than nineteen call sites each choosing a glyph and a
 * colour. Closing and going back are quiet; confirming is the action purple,
 * because the word it replaced was already written in it.
 */

import { Icon, type IconName } from '@/components/ui/Icon';
import { colors } from '@/theme/colors';
import { IconButton } from './IconButton';


/** What is being put away, for anyone who cannot see the glyph. */
export function CloseButton({ onPress, label = 'Close', size = 22 }: {
  onPress: () => void;
  label?: string;
  size?: number;
}) {
  return (
    <IconButton onPress={onPress} label={label}>
      <Icon name="close" size={size} color={colors.sub} />
    </IconButton>
  );
}

/** For a bar that both dismisses and commits: the same disc, a tick instead of a
 *  cross. Mid-commit the tick gives way to a spinner, since the word it replaced
 *  used to carry that news itself ("Creating…"). */
export function ConfirmButton({ onPress, label = 'Done', size = 22, disabled = false, busy = false }: {
  onPress: () => void;
  label?: string;
  size?: number;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <IconButton onPress={onPress} label={label} disabled={disabled} loading={busy}>
      <Icon name="check" size={size} color={colors.action} />
    </IconButton>
  );
}

/** Stepping back rather than dismissing: what was typed stays, which a cross
 *  would deny. */
export function BackButton({ onPress, label = 'Back', size = 22 }: {
  onPress: () => void;
  label?: string;
  size?: number;
}) {
  return (
    <IconButton onPress={onPress} label={label}>
      <Icon name="arrowLeft" size={size} color={colors.sub} />
    </IconButton>
  );
}

/** Any other icon action in a bar or a toolbar — edit, delete, retry. */
export function RoundAction({ icon, onPress, label, size = 20, color = colors.sub, disabled }: {
  icon: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <IconButton onPress={onPress} label={label} disabled={disabled}>
      <Icon name={icon} size={size} color={color} />
    </IconButton>
  );
}
