import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Platform, TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

// ── Editorial Design Tokens ──────────────────────────────────────
const ED = {
  surf: '#FFFFFF',
  bg: '#FAFAF8',
  border: '#E5E3DE',
  accent: '#1A8A72',
  accentShadow: 'rgba(26, 138, 114, 0.28)',
  accentShadowLg: 'rgba(26, 138, 114, 0.40)',
  text: '#1A1916',
  muted: '#9B9790',
};

const MONO = Platform.select({
  ios: 'Courier New',
  default: 'monospace',
});

// ── Tab icon config ───────────────────────────────────────────────
const TAB_CONFIG: Record<string, { label: string; icon: string }> = {
  index:    { label: 'Today',   icon: 'home' },
  lessons:  { label: 'Library', icon: 'book-open' },
  settings: { label: 'You',     icon: 'user' },
};

// ── Custom Editorial Tab Bar ─────────────────────────────────────
function EditorialTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  const leftRoutes  = state.routes.filter(r => ['index', 'lessons'].includes(r.name));
  const rightRoutes = state.routes.filter(r => ['settings'].includes(r.name));
  const createRoute = state.routes.find(r => r.name === 'create');
  const isCreateFocused = state.routes[state.index]?.name === 'create';

  const renderTab = (route: (typeof state.routes)[0]) => {
    const cfg = TAB_CONFIG[route.name];
    if (!cfg) return null;
    const isFocused = state.routes[state.index]?.key === route.key;
    const color = isFocused ? ED.text : ED.muted;
    const fontWeight = isFocused ? '700' : '500';

    const onPress = () => {
      const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route.name);
    };

    return (
      <TouchableOpacity key={route.key} onPress={onPress} style={styles.tab} activeOpacity={0.7}>
        <Feather name={cfg.icon as any} size={20} color={color} />
        <Text style={[styles.tabLabel, { color, fontWeight }]}>{cfg.label}</Text>
      </TouchableOpacity>
    );
  };

  const onCreatePress = () => {
    if (!createRoute) return;
    const event = navigation.emit({ type: 'tabPress', target: createRoute.key, canPreventDefault: true });
    if (!isCreateFocused && !event.defaultPrevented) navigation.navigate('create');
  };

  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Left side tabs */}
      <View style={styles.side}>{leftRoutes.map(renderTab)}</View>

      {/* Center: elevated Create FAB */}
      <View style={styles.centerSlot}>
        <TouchableOpacity onPress={onCreatePress} style={[styles.fab, isCreateFocused && styles.fabActive]} activeOpacity={0.85}>
          <View style={styles.plusH} />
          <View style={styles.plusV} />
        </TouchableOpacity>
        <Text style={[styles.tabLabel, styles.createLabel, isCreateFocused && styles.createLabelActive]}>
          Create
        </Text>
      </View>

      {/* Right side tabs */}
      <View style={styles.side}>{rightRoutes.map(renderTab)}</View>
    </View>
  );
}

// ── Layout ───────────────────────────────────────────────────────
export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <EditorialTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="lessons" />
      <Tabs.Screen name="create" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

// ── Styles ───────────────────────────────────────────────────────
const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: ED.surf,
    borderTopWidth: 1,
    borderTopColor: ED.border,
    overflow: 'visible',
    minHeight: 64,
  },
  side: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingBottom: 0,
  },
  tab: {
    flex: 1,
    paddingTop: 8,
    alignItems: 'center',
    gap: 3,
  },
  tabLabel: {
    fontFamily: MONO,
    fontSize: 10,
    letterSpacing: 0.3,
  },
  centerSlot: {
    flex: 1,
    alignItems: 'center',
    position: 'relative',
    paddingTop: 0,
  },
  fab: {
    position: 'absolute',
    top: -22,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ED.accent,
    borderWidth: 3,
    borderColor: ED.bg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ED.accentShadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  fabActive: {
    shadowColor: ED.accentShadowLg,
    shadowRadius: 14,
    elevation: 10,
  },
  plusH: {
    position: 'absolute',
    width: 18,
    height: 2.2,
    borderRadius: 1.1,
    backgroundColor: '#fff',
  },
  plusV: {
    position: 'absolute',
    width: 2.2,
    height: 18,
    borderRadius: 1.1,
    backgroundColor: '#fff',
  },
  createLabel: {
    marginTop: 36,
    color: ED.text,
    fontWeight: '600',
  },
  createLabelActive: {
    color: ED.accent,
    fontWeight: '700',
  },
});
