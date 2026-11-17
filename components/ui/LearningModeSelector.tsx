import { Icon } from '@/components/ui/Icon';
import { Card } from './Card';
import { Toggle } from '@/components/ui/Toggle';
import { space, radius, type, colors, fonts } from '@/theme';
import { StyleSheet, Text, View } from 'react-native';

type LearningMode = 'knowledge' | 'language';

/** Knowledge is the default; the switch enables the language-specific flow. */
export function LearningModeSelector({ value, onChange, disabled = false }: {
  value: LearningMode;
  onChange: (value: LearningMode) => void;
  disabled?: boolean;
}) {
  const isLanguage = value === 'language';
  return (
    <Card pad="sm" gap={space[3]} faceStyle={styles.face}>
      <View style={styles.icon}><Icon name="globe" size={19} color={colors.sub} /></View>
      <Text style={styles.label}>Language</Text>
      <Toggle value={isLanguage} disabled={disabled}
        label="Language learning mode"
        hint="When off, the lesson uses Knowledge mode."
        onValueChange={(on) => onChange(on ? 'language' : 'knowledge')} />
    </Card>
  );
}

const styles = StyleSheet.create({
  face: { minHeight: 58, flexDirection: 'row', alignItems: 'center' },
  icon: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: colors.limeSurface,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { ...type.body, fontFamily: fonts.semibold, flex: 1, color: colors.text },

});
