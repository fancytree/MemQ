import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { router } from 'expo-router';
import { BottomNavigation, type Destination } from './ui/BottomNavigation';

/** Two tab destinations plus a center action opening the existing Create stack. */
export function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const active = state.routes[state.index]?.name === 'library' ? 'library' : 'today';
  const navigate = (destination: Destination) => {
    if (destination === 'create') {
      router.push('/create');
      return;
    }
    const name = destination === 'today' ? 'index' : 'library';
    const route = state.routes.find((item) => item.name === name);
    if (!route) return;
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!event.defaultPrevented && state.routes[state.index]?.key !== route.key) navigation.navigate(name);
  };
  return <BottomNavigation active={active} onNavigate={navigate} />;
}
