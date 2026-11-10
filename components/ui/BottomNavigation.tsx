import { colors, componentTokens, type } from '@/theme';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DesignAsset } from '../DesignAsset';
import { Icon } from '../Icon';

export const destinations = [
  { id: 'today', label: 'Today' },
  { id: 'create', label: 'Create' },
  { id: 'library', label: 'Library' },
] as const;
export type Destination = typeof destinations[number]['id'];

/** Today 96:704 geometry for the two tab destinations. Create keeps the product's
 * prominent centre action instead of the reference frame's flat third item.
 */
export function BottomNavigation({ active, onNavigate }: { active: Destination; onNavigate: (id: Destination) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(8, insets.bottom) }]}>
      {destinations.map((item) => {
        const selected = active === item.id;
        if (item.id === 'create') return (
          <View key={item.id} style={styles.createSlot}>
            <Pressable accessibilityRole="button" accessibilityLabel="Create a new lesson"
              onPress={() => onNavigate('create')}
              style={({ pressed }) => [styles.create, pressed && styles.createPressed]}>
              <Icon name="plus" size={24} strokeWidth={1.8} color={colors.onAction} />
            </Pressable>
          </View>
        );
        return (
          <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.label}
            accessibilityState={{ selected }} onPress={() => onNavigate(item.id)}
            style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}>
            <View style={[styles.capsule, selected && styles.selected]}>
              <DesignAsset name={item.id === 'today' ? (selected ? 'today' : 'todayInactive') : (selected ? 'library' : 'libraryInactive')} />
            </View>
            <Text style={[selected ? type.navActive : type.navInactive, { color: selected ? colors.text : colors.muted }]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const t = componentTokens.navigation;
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  item: { flex: 1, minHeight: t.minItemHeight, alignItems: 'center', gap: t.gap },
  itemPressed: { backgroundColor: colors.surfaceSubtle },
  capsule: { width: t.capsuleWidth, minHeight: t.capsuleMinHeight, borderRadius: componentTokens.primaryAction.borderRadius, alignItems: 'center', justifyContent: 'center' },
  selected: { backgroundColor: t.backgroundColor },
  createSlot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  create: { ...componentTokens.createNavigation, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  createPressed: { backgroundColor: colors.actionPressed },
});
