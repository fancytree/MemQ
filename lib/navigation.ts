import { router } from 'expo-router';
import { supabase } from './supabase';

/**
 * Navigate to the correct post-auth screen.
 *
 * - New users (no onboarding_complete metadata): → /onboarding
 * - Existing users (onboarding_complete === true): → /(tabs)
 *
 * Designed to be called right after a successful sign-in from login.tsx / signup.tsx.
 */
export async function navigateAfterAuth(): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    const meta = data.user?.user_metadata as Record<string, unknown> | undefined;
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
