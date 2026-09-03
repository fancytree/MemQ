import { navigateAfterAuth } from '@/lib/navigation';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme';
import { useLocalSearchParams } from 'expo-router';
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
    let unmounted = false;   // 组件卸载
    let navigated = false;   // 已经跳过一次，避免重复导航

    const safeNavigate = (user?: { user_metadata?: Record<string, unknown> | null } | null) => {
      if (unmounted || navigated) return;
      navigated = true;
      void navigateAfterAuth(user);
    };

    // ── Primary: navigate as soon as a session is established ──
    // 处理两种情况：
    //   SIGNED_IN  → startGoogleOAuthInSafari 或本页面完成了 code 交换
    //   INITIAL_SESSION with session → session 在本页面挂载前已建立
    //
    // ⚠️ 回调内绝不能直接 await 任何 supabase.auth.* 方法。
    // auth-js 在派发事件时仍持有 auth 锁，且 _notifyAllSubscribers 会 await 每个订阅者回调；
    // 此时再调 getUser() 会走 _acquireLock 的重入分支去等 pendingInLock 里那个
    // “正在等我们返回”的 promise —— 循环等待，且该分支不吃 lockAcquireTimeout，会永久卡死，
    // 表现就是本页 "Signing you in..." 转圈不动。
    // 因此：把 session.user 直接传下去（navigateAfterAuth 拿到 user 就不再调 supabase），
    // 并用 setTimeout(…, 0) 让导航脱离事件派发栈。
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (unmounted || navigated) return;
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        setTimeout(() => safeNavigate(session.user), 0);
      }
    });

    // ── Secondary: exchange the code / set tokens ──
    // 若 startGoogleOAuthInSafari 已抢先交换，此处 exchangeCodeForSession 会返回错误；
    // 此时不能直接跳 /login，必须检查是否已有 session。
    const handleCallback = async () => {
      try {
        const errorDescription =
          (typeof params.error_description === 'string' && params.error_description) ||
          (typeof params.error === 'string' && params.error) ||
          '';
        if (errorDescription) {
          safeNavigate();
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
        safeNavigate();
      } catch {
        // code 可能已被 startGoogleOAuthInSafari 使用（竞态），
        // 绝对不能直接跳 /login——必须通过 navigateAfterAuth 检查 session 状态。
        safeNavigate();
      }
    };

    handleCallback();

    // ── Timeout: never spin forever ──
    const timer = setTimeout(() => safeNavigate(), CALLBACK_TIMEOUT_MS);

    return () => {
      unmounted = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.access_token, params.code, params.error, params.error_description, params.refresh_token]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={styles.text}>Signing you in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  text: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
});
