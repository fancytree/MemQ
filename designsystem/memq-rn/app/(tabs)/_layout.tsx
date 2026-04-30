import { Tabs } from 'expo-router';
import { CustomTabBar } from '@/components/CustomTabBar';

/**
 * Tab navigator. The visual chrome is fully delegated to CustomTabBar
 * so we get the elevated centered FAB. Native header is hidden — each
 * screen renders its own header in editorial style.
 */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"   options={{ title: 'Today' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
