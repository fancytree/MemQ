import { colors } from '@/theme';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
const SAFE_AREA_FACTOR = 0.35;

/**
 * Custom tab bar with standard tabs.
 */
export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.round(insets.bottom * SAFE_AREA_FACTOR);
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
    <View
      style={[
        styles.bar,
        {
          height: 64 + bottomInset,
          paddingBottom: 14 + bottomInset,
        },
      ]}
    >
      {TABS_LEFT.map(renderTab)}
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
    fontFamily: 'JetBrainsMono_500',
    fontSize: 10,
    letterSpacing: 0.05,
  },
});
