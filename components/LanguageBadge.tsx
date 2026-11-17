/**
 * The little tilted sticker that says a lesson is a language lesson.
 *
 * It was written out twice — once in the library list, once on a lesson's own page —
 * and both drew its depth as a two-point box shadow in the line colour, which is a
 * pale grey band under a purple sticker. Depth here is the same colour with the
 * light taken out of it, so the lip is the action's own shell, and it is a real
 * layer rather than a shadow.
 */

import { colors } from '@/theme/colors';
import { componentTokens } from '@/theme';
import { ledge } from '@/theme/ledge';
import { radius } from '@/theme/spacing';
import { Icon } from '@/components/ui/Icon';
import { StyleSheet, View } from 'react-native';

const SIZE = 22;

export function LanguageBadge({ labelled = false }: {
  /** In a list the lesson's title already says it; on its own page it does not. */
  labelled?: boolean;
}) {
  return (
    <View style={styles.shell}
      accessible={labelled} accessibilityLabel={labelled ? 'Language learning' : undefined}>
      <View style={styles.face}>
        <Icon name="globe" size={16} color={colors.onAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: SIZE, height: SIZE, borderRadius: radius.sm,
    backgroundColor: componentTokens.button.primary.shell,
    paddingBottom: ledge.control,
    transform: [{ rotate: '-8deg' }],
  },
  face: {
    flex: 1, borderRadius: radius.sm,
    backgroundColor: colors.action,
    alignItems: 'center', justifyContent: 'center',
  },
});
