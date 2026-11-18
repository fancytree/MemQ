import { fontAssets } from '@/theme/font-assets';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import '@/theme/web.css';
import { SubscriptionPaywallHost } from '@/components/SubscriptionPaywallHost';
import { LoadingProvider } from '@/context/LoadingContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { SoundHintHost } from '@/components/SpeakingPulse';
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
          <SoundHintHost />
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
            <Stack.Screen name="import-cards" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="credits" options={{ presentation: 'card', animation: 'slide_from_bottom' }} />
            {/* The two chat lines come up the same way as /create: stepped into and
                left, which is why they close with a cross rather than go back. */}
            {/* No swipe back out of a conversation.
                These are left by the cross at the top, which is on screen the
                whole time — and the screen under it has a deck that is dealt
                sideways and a row of attachments that scrolls sideways, either of
                which would otherwise be one stray millimetre away from throwing
                the whole conversation out. The quiz is closed off for the same
                reason: a screen you are working inside is left on purpose. */}
            <Stack.Screen name="create-chat" options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="practice-chat" options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="quiz" options={{ presentation: 'card', animation: 'slide_from_bottom', gestureEnabled: false }} />
            <Stack.Screen name="you" />
          </Stack>
        </SubscriptionProvider>
      </LoadingProvider>
    </SafeAreaProvider>
  );
}
