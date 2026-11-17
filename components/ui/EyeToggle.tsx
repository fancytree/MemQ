/**
 * Show what was typed into a password field.
 *
 * It lives inside a Field's well, as its `trailing`, and four screens had written
 * it four times — each with its own glyph size, its own colour and its own
 * absolutely-positioned 44pt box hanging off the right edge. One quiet icon
 * button in the row does the same job and sits where the well puts it.
 */

import { Icon } from '@/components/ui/Icon';
import { colors } from '@/theme/colors';
import { IconButton } from './IconButton';

export function EyeToggle({ shown, onPress }: { shown: boolean; onPress: () => void }) {
  return (
    <IconButton variant="quiet" size="sm" label={shown ? 'Hide password' : 'Show password'} onPress={onPress}>
      <Icon name={shown ? 'eyeOff' : 'eye'} size={20} color={colors.faint} />
    </IconButton>
  );
}
