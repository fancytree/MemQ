import { supabase } from '@/lib/supabase';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

const CALLBACK_TIMEOUT_MS = 12_000;

export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  }>();

  useEffect(() => {
    let cancelled = false;

    // ── Primary: navigate as soon as a session is established ──
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        router.replace('/(tabs)');
      }
    });

    // ── Secondary: exchange the code / set tokens ──
    const handleCallback = async () => {
      try {
        const errorDescription =
          (typeof params.error_description === 'string' && params.error_description) ||
          (typeof params.error === 'string' && params.error) ||
          '';
        if (errorDescription) {
          if (!cancelled) router.replace('/login');
          return;
        }

        const code = typeof params.code === 'string' ? params.code : null;
        const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
        const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;

        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }

        // onAuthStateChange fires first; this is just a safety net
        if (!cancelled) {
          const { data } = await supabase.auth.getSession();
          if (!cancelled) {
            router.replace(data.session ? '/(tabs)' : '/login');
          }
        }
      } catch {
        if (!cancelled) router.replace('/login');
      }
    };

    handleCallback();

    // ── Timeout: never spin forever ──
    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) router.replace(data.session ? '/(tabs)' : '/login');
      } catch {
        if (!cancelled) router.replace('/login');
      }
    }, CALLBACK_TIMEOUT_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.access_token, params.code, params.error, params.error_description, params.refresh_token]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#0a7ea4" />
      <Text style={styles.text}>Signing you in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    color: '#4B5563',
  },
});
