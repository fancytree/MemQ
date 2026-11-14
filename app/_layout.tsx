import { fontAssets } from '@/theme/font-assets';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import '@/theme/web.css';
import { SubscriptionPaywallHost } from '@/components/SubscriptionPaywallHost';
import { LoadingProvider } from '@/context/LoadingContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { DialogHost } from '@/lib/dialog';
import { colors } from '@/theme';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * Root stack. (tabs) is the main tab nav; create / quiz / deck/[id] are
 * pushed on top of it (Create opens from the center action; You opens from the Today avatar).
 */
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);
  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <LoadingProvider>
        <SubscriptionProvider>
          <SubscriptionPaywallHost />
          <DialogHost />
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: 'slide_from_right',
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="create" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="create-name" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="quiz" options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="you" />
          </Stack>
        </SubscriptionProvider>
      </LoadingProvider>
    </SafeAreaProvider>
  );
}
