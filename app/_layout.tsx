import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import React, { useEffect } from 'react';
import 'react-native-reanimated';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';

import LoadingScreen from '@/components/LoadingScreen';
import PaywallModal from '@/components/PaywallModal';
import { LoadingProvider, useLoading } from '@/context/LoadingContext';
import { SubscriptionProvider, useSubscription } from '@/context/SubscriptionContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';

export const unstable_settings = {
  anchor: '(tabs)',
};

// 内部组件
function extractHashParams(url: string): Record<string, string> {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const hash = url.substring(hashIndex + 1);
  const params: Record<string, string> = {};
  hash.split('&').forEach(pair => {
    const [key, value] = pair.split('=');
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value);
  });
  return params;
}

async function handleAuthUrl(url: string) {
  const params = extractHashParams(url);
  const accessToken = params['access_token'];
  const refreshToken = params['refresh_token'];
  const type = params['type'];

  if (accessToken && refreshToken && type === 'recovery') {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) {
      router.replace('/reset-password');
    } else if (__DEV__) {
      console.error('Failed to set session from deep link:', error);
    }
  }
}

function AppContent() {
  const colorScheme = useColorScheme();
  const { isLoading } = useLoading();
  const { showPaywallModal, setShowPaywallModal } = useSubscription();

  useEffect(() => {
    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('reset-password') && url.includes('access_token')) {
        handleAuthUrl(url);
      }
    });

    // Handle deep link when app is opened from closed state
    Linking.getInitialURL().then(url => {
      if (url && url.includes('reset-password') && url.includes('access_token')) {
        handleAuthUrl(url);
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none', // 禁用所有页面切换动画
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen 
          name="lessons" 
          options={{ 
            headerShown: false,
            presentation: 'card',
            animation: 'none',
          }} 
        />
        <Stack.Screen name="add-terms" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="learn" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="study" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="login" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="signup" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="reset-password" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen 
          name="unlock-pro" 
          options={{ 
            headerShown: false,
            presentation: 'card',
            animation: 'slide_from_bottom',
            gestureEnabled: true,
            gestureDirection: 'vertical',
          }} 
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', animation: 'none' }} />
      </Stack>
      <StatusBar style="dark" />
      <LoadingScreen visible={isLoading} />
      {/* 全局 PaywallModal - 可以在任何页面显示 */}
      <PaywallModal 
        visible={showPaywallModal} 
        onClose={() => setShowPaywallModal(false)} 
      />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <LoadingProvider>
      <SubscriptionProvider>
        <AppContent />
      </SubscriptionProvider>
    </LoadingProvider>
  );
}
