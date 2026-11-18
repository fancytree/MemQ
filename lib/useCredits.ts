/**
 * What is left of the month's AI credits, for a screen to show.
 *
 * Read when the screen comes into view, because the number moves while it is
 * away — a few messages in the chat, a PDF on another page. Between reads a
 * screen that has just spent some says so with `spend`, so the line under the
 * button is right at once rather than after the next round trip.
 *
 * Null until it is known, and null when it cannot be read: a screen draws
 * nothing rather than a guess, and the server decides.
 */

import { useSubscription } from '@/context/SubscriptionContext';
import { CREDIT_COST, creditState, type Credits } from '@/lib/aiCredits';
import { getCreditsSpent } from '@/lib/aiUsage';
import { supabase } from '@/lib/supabase';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

export function useCredits(): {
  credits: Credits | null;
  /** Read it again, after something that may have spent some. */
  refresh: () => void;
  /** Take off what a thing just cost, by the name it is filed under. */
  spend: (feature: string) => void;
} {
  const { isPro } = useSubscription();
  const [spent, setSpent] = useState<number | null>(null);

  const refresh = useCallback(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setSpent(null);
      setSpent(await getCreditsSpent(data.user.id));
    })();
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  const spend = useCallback((feature: string) => {
    setSpent((now) => (now === null ? now : now + (CREDIT_COST[feature] ?? 1)));
  }, []);

  const credits = useMemo(() => (spent === null ? null : creditState(spent, isPro)), [spent, isPro]);
  return { credits, refresh, spend };
}
