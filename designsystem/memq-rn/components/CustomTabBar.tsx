import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { colors, fonts } from '@/theme';
import { Icon, type IconName } from './Icon';

interface TabSpec {
  name: string;       // route name in (tabs)
  label: string;
  icon: IconName;
}

const TABS_LEFT: TabSpec[] = [
  { name: 'index',   label: 'Today',   icon: 'home' },
  { name: 'library', label: 'Library', icon: 'library' },
];

const TABS_RIGHT: TabSpec[] = [
  { name: 'explore', label: 'Explore', icon: 'explore' },
  { name: 'profile', label: 'You',     icon: 'profile' },
];

/**
 * Custom tab bar. 4 standard tabs + a centered, elevated Create FAB
 * that pushes /create on the parent stack rather than switching tabs.
 *
 * Active state lights the icon + label in colors.text; inactive uses
 * colors.muted. The FAB is always teal — it doesn't reflect a tab
 * (Create lives on the stack, not in the tabs).
 */
export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const activeRouteName = state.routes[state.index]?.name;

  const renderTab = (t: TabSpec) => {
    const isActive = activeRouteName === t.name;
    const color = isActive ? colors.text : colors.muted;
    return (
      <Pressable
        key={t.name}
        onPress={() => navigation.navigate(t.name)}
        style={styles.tab}
        accessibilityRole="button"
        accessibilityLabel={t.label}
      >
        <Icon name={t.icon} color={color} size={20} />
        <Text style={[styles.tlabel, { color, fontWeight: isActive ? '700' : '500' }]}>
          {t.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.bar}>
      {TABS_LEFT.map(renderTab)}

      {/* Create slot — column reserves the FAB's footprint */}
      <View style={styles.fabSlot}>
        <Pressable
          onPress={() => router.push('/create')}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel="Create"
        >
          <Icon name="plus" color="#fff" size={22} strokeWidth={2.4} />
        </Pressable>
        <Text style={styles.fabLabel}>Create</Text>
      </View>

      {TABS_RIGHT.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 64,
    paddingTop: 0,
    paddingBottom: 14,
    backgroundColor: colors.surf,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 8,
    gap: 3,
  },
  tlabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
  },
  fab: {
    position: 'absolute',
    top: -22,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    // Cross-platform shadow for the FAB
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: 0.2,
    marginTop: 36,
    fontWeight: '600',
    color: colors.text,
  },
});
