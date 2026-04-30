import { colors } from '@/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SecondaryPageNavProps {
  onBack: () => void;
  backLabel?: string;
  showDivider?: boolean;
}

export function SecondaryPageNav({
  onBack,
  backLabel = '← Profile',
  showDivider = true,
}: SecondaryPageNavProps) {
  return (
    <View style={[styles.header, showDivider && styles.headerDivider]}>
      <TouchableOpacity onPress={onBack} activeOpacity={0.7}>
        <Text style={styles.navBack}>{backLabel}</Text>
      </TouchableOpacity>
      <View style={styles.navRightSpacer} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
  },
  headerDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  navBack: {
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: -0.1,
    color: colors.muted,
    fontFamily: 'JetBrainsMono_400',
    fontWeight: '400',
  },
  navRightSpacer: {
    width: 52,
  },
});
