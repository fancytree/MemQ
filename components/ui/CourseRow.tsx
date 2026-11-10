import { colors, componentTokens, elevation } from '@/theme';
import { ReactNode } from 'react';
import { Pressable, PressableProps, StyleSheet, Text, View } from 'react-native';
import { DesignAsset } from '../DesignAsset';

type CourseRowProps = Omit<PressableProps, 'children'> & {
  title: string;
  metadata: string;
  illustration?: ReactNode;
};
/** Open white course row. Supply approved artwork, never generate a replacement mascot. */
export function CourseRow({ title, metadata, illustration, style, ...props }: CourseRowProps) {
  return (
    <Pressable {...props} accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? `${title}. ${metadata}`}
      style={(state) => [styles.row, state.pressed && styles.pressed, typeof style === 'function' ? style(state) : style]}>
      {illustration && <View accessible={false} style={styles.illustration}>{illustration}</View>}
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.metadata}>{metadata}</Text>
      </View>
      <View accessible={false} style={styles.disclosure}>
        <DesignAsset name="chevron" />
      </View>
    </Pressable>
  );
}
const t = componentTokens.course;
const styles = StyleSheet.create({
  row: { ...elevation.none, minHeight: t.minHeight, flexDirection: 'row', alignItems: 'center', gap: t.gap, backgroundColor: colors.bg },
  pressed: { backgroundColor: colors.surfaceSubtle },
  illustration: { width: t.illustrationSize, height: t.illustrationSize },
  copy: { flex: 1, paddingVertical: 12, gap: t.textGap },
  title: { ...t.title, color: colors.text },
  metadata: { ...t.meta, color: colors.muted },
  disclosure: { width: t.disclosureWidth, minHeight: t.disclosureMinHeight, alignItems: 'flex-end', justifyContent: 'center' },
});
