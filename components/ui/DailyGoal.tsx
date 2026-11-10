import { colors, componentTokens, type, fonts } from '@/theme';
import { progressPercent } from '@/theme/progress';
import { StyleSheet, Text, View } from 'react-native';

/** Accurate goal summary; type and geometry based on Today, safe edge-case handling is an extension. */
export function DailyGoal({ completed, total }: { completed: number; total: number }) {
  const safeTotal = Number.isFinite(total) ? Math.max(0, total) : 0;
  const safeCompleted = Number.isFinite(completed) ? Math.max(0, completed) : 0;
  const percent = progressPercent(safeCompleted, safeTotal);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Daily goal"
      accessibilityValue={{ min: 0, max: 100, now: percent, text: `${safeCompleted} of ${safeTotal}, ${Math.round(percent)} percent` }}>
      <View style={styles.summary}>
        <Text style={styles.label}>Daily goal</Text>
        <Text style={styles.count}><Text style={styles.completed}>{safeCompleted} </Text>/ {safeTotal}</Text>
      </View>
      <View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View>
    </View>
  );
}
const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  label: { ...type.goalLabel, color: colors.text },
  count: { ...type.goalNumber, color: colors.muted },
  completed: { fontFamily: fonts.utilitySemibold, color: colors.text },
  track: { height: componentTokens.progress.height, borderRadius: componentTokens.progress.borderRadius, backgroundColor: componentTokens.progress.backgroundColor, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: componentTokens.progress.borderRadius, backgroundColor: componentTokens.progress.fill },
});
