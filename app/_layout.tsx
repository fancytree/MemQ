import { LoadingProvider } from '@/context/LoadingContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';
import { colors } from '@/theme';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// JetBrains 变量字体在部分字号/字重组合下会出现顶部轻微裁切。
// 这里统一下压 1px，避免全局文本被“切顶”。
const AnyText = Text as any;
if (!AnyText.defaultProps) {
  AnyText.defaultProps = {};
}
AnyText.defaultProps.style = [{ paddingTop: 1 }, AnyText.defaultProps.style];

/**
 * Root stack. (tabs) is the main tab nav; create / quiz / deck/[id] are
 * pushed on top of it (Create is the FAB target, Quiz is a focused-mode
 * review session, Deck Detail is push-from-list).
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    JetBrainsMono_100: require('../assets/fonts/JetBrainsMono-Thin.ttf'),
    JetBrainsMono_200: require('../assets/fonts/JetBrainsMono-ExtraLight.ttf'),
    JetBrainsMono_300: require('../assets/fonts/JetBrainsMono-Light.ttf'),
    JetBrainsMono_400: require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    JetBrainsMono_500: require('../assets/fonts/JetBrainsMono-Medium.ttf'),
    JetBrainsMono_600: require('../assets/fonts/JetBrainsMono-SemiBold.ttf'),
    JetBrainsMono_700: require('../assets/fonts/JetBrainsMono-Bold.ttf'),
    JetBrainsMono_800: require('../assets/fonts/JetBrainsMono-ExtraBold.ttf'),
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <LoadingProvider>
        <SubscriptionProvider>
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
        </SubscriptionProvider>
      </LoadingProvider>
    </SafeAreaProvider>
  );
}
