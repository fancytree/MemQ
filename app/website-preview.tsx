import TodayScreen from './(tabs)/index';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { useEffect } from 'react';

type DevMenuPreferences = {
  getPreferencesAsync(): Promise<{ showFloatingActionButton?: boolean }>;
  setPreferencesAsync(settings: { showFloatingActionButton: boolean }): Promise<void>;
};

/** Development-only route for capturing the current UI with non-personal demo content. */
export default function WebsitePreview() {
  useEffect(() => {
    if (!__DEV__) return;
    const preferences = requireOptionalNativeModule<DevMenuPreferences>('DevMenuPreferences');
    if (!preferences) return;
    let disposed = false;
    let original: boolean | undefined;
    void (async () => {
      try {
        original = (await preferences.getPreferencesAsync()).showFloatingActionButton;
        if (disposed || original !== true) return;
        await preferences.setPreferencesAsync({ showFloatingActionButton: false });
        if (disposed) await preferences.setPreferencesAsync({ showFloatingActionButton: true });
      } catch { /* The preview remains usable when the dev menu is unavailable. */ }
    })();
    return () => {
      disposed = true;
      if (original === true) void preferences.setPreferencesAsync({ showFloatingActionButton: true }).catch(() => {});
    };
  }, []);
  return __DEV__ ? <TodayScreen demo /> : null;
}
