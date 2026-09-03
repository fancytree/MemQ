/**
 * AI usage quota helpers.
 *
 * Uses the `ai_usage` table in Supabase to track per-user usage.
 * Free-tier limits are defined here; Pro users are always allowed.
 *
 * Table required (run once in Supabase SQL editor):
 *   create table ai_usage (
 *     id         uuid primary key default gen_random_uuid(),
 *     user_id    uuid not null references auth.users(id) on delete cascade,
 *     feature    text not null,
 *     created_at timestamptz not null default now()
 *   );
 *   create index ai_usage_user_feature_idx on ai_usage(user_id, feature, created_at);
 *   alter table ai_usage enable row level security;
 *   create policy "Users can read own usage"   on ai_usage for select using (auth.uid() = user_id);
 *   create policy "Users can insert own usage" on ai_usage for insert with check (auth.uid() = user_id);
 */

import { supabase } from '@/lib/supabase';

export type AIFeature = 'generate_terms' | 'ai_chat';

export const AI_LIMITS: Record<AIFeature, { free: number; period: 'month' | 'day' }> = {
  generate_terms: { free: 3, period: 'month' },
  ai_chat:        { free: 10, period: 'day' },
};

/** Returns the UTC start of the current period (today or this month). */
function getPeriodStart(period: 'month' | 'day'): Date {
  const d = new Date();
  if (period === 'month') {
    d.setUTCDate(1);
  }
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** How many times has `userId` used `feature` in the current period? */
export async function getAIUsageCount(feature: AIFeature, userId: string): Promise<number> {
  const since = getPeriodStart(AI_LIMITS[feature].period);
  const { count, error } = await supabase
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('feature', feature)
    .gte('created_at', since.toISOString());
  if (error) return 0; // fail open — don't block the user on a query error
  return count ?? 0;
}

/** 写入一条使用记录；在 AI 请求成功后再调用。返回 false 表示写入失败（可配合本地计数回滚）。 */
export async function recordAIUsage(feature: AIFeature, userId: string): Promise<boolean> {
  const { error } = await supabase.from('ai_usage').insert({ user_id: userId, feature });
  if (error) {
    console.warn('[aiUsage] Failed to record usage:', error.message);
    return false;
  }
  return true;
}

export interface QuotaResult {
  allowed: boolean;
  used: number;
  limit: number;
  remaining: number;
}

/**
 * Check if the user is allowed to make one more AI call.
 * Pro users always get `allowed: true` without hitting the DB.
 */
export async function checkAIQuota(
  feature: AIFeature,
  userId: string,
  isPro: boolean,
): Promise<QuotaResult> {
  if (isPro) {
    return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };
  }
  const limit = AI_LIMITS[feature].free;
  const used = await getAIUsageCount(feature, userId);
  return {
    allowed: used < limit,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}
