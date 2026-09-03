import { router } from 'expo-router';
import { supabase } from './supabase';

/** 只取所需字段，避免依赖 @supabase/supabase-js 的 User 类型。 */
type AuthUserLike = { user_metadata?: Record<string, unknown> | null } | null | undefined;

/**
 * Navigate to the correct post-auth screen.
 *
 * - New users (no onboarding_complete metadata): → /onboarding
 * - Existing users (onboarding_complete === true): → /(tabs)
 *
 * Designed to be called right after a successful sign-in from login.tsx / signup.tsx.
 *
 * ⚠️ 从 onAuthStateChange 回调里调用时，必须传入 session.user，且用 setTimeout(…, 0) 延后。
 * 否则内部的 supabase.auth.getUser() 会与仍持有 auth 锁的事件派发形成循环等待而死锁，
 * 详见 auth/callback.tsx 的注释。传入 user 时本函数不发起任何 supabase 调用。
 */
export async function navigateAfterAuth(user?: AuthUserLike): Promise<void> {
  try {
    let meta = (user?.user_metadata ?? undefined) as Record<string, unknown> | undefined;
    if (!user) {
      const { data } = await supabase.auth.getUser();
      meta = data.user?.user_metadata as Record<string, unknown> | undefined;
    }
    if (meta?.onboarding_complete === true) {
      router.replace('/(tabs)');
    } else {
      router.replace('/onboarding');
    }
  } catch {
    // Fallback — send to tabs if we can't determine status
    router.replace('/(tabs)');
  }
}
