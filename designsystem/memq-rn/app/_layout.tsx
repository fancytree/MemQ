import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/theme';

/**
 * Root stack. (tabs) is the main tab nav; create / quiz / deck/[id] are
 * pushed on top of it (Create is the FAB target, Quiz is a focused-mode
 * review session, Deck Detail is push-from-list).
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="create" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="quiz" options={{ animation: 'fade' }} />
        <Stack.Screen name="deck/[id]" />
      </Stack>
    </SafeAreaProvider>
  );
}
