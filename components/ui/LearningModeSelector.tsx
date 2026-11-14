import { Toggle } from '@/components/ui/Toggle';
import { homeColors } from '@/theme/colors';
import { ledge } from '@/theme/ledge';
import { fonts } from '@/theme';
import { Feather } from '@expo/vector-icons';
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
    <View style={styles.row}>
      <View style={styles.face}>
        <View style={styles.icon}><Feather name="globe" size={19} color={homeColors.deep} /></View>
        <Text style={styles.label}>Language</Text>
        <Toggle value={isLanguage} disabled={disabled}
          label="Language learning mode"
          hint="When off, the lesson uses Knowledge mode."
          onValueChange={(on) => onChange(on ? 'language' : 'knowledge')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A shell with a lighter face on it, offset so a band of the shell shows along the
  // bottom edge — the same depth every other raised surface in the app carries. It
  // was a hairline outline, which is the older style.
  row: { borderRadius: 24, backgroundColor: homeColors.border, paddingBottom: ledge.raised },
  face: {
    minHeight: 64, borderRadius: 24, backgroundColor: homeColors.white,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  icon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: homeColors.selected,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { flex: 1, fontFamily: fonts.semibold, fontSize: 17, color: homeColors.darkest },

});
