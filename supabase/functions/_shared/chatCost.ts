/**
 * What a model call cost, and whether the day's spend is still inside the ceiling.
 *
 * Kept free of Deno and of the database so the arithmetic can be tested directly:
 * everything here is a pure function of token counts and configuration.
 *
 * Prices are micro-dollars (1e-6 USD) per token, because one practice message can
 * cost about $0.0004 and anything coarser rounds it to nothing. The figures come
 * from the third-party summaries cited in docs/AI_CHAT_SPEC.zh-CN.md §9.3 and are
 * NOT from an official price page — verify before launch.
 */

export type TokenUsage = {
  /** Total input tokens the provider billed, cached ones included. */
  prompt: number;
  /** The subset of `prompt` that hit the prompt cache. */
  cached: number;
  completion: number;
};

export type ModelPrice = { input: number; cached: number; output: number };

export const MODEL_PRICE_MICROS: Record<string, ModelPrice> = {
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6-astra': { input: 10, cached: 1, output: 50 },
};

/** The dearest price we know of. An unrecognised model is costed at this rate, so a
 *  model nobody added to the table can never quietly undercount the day's spend. */
const DEAREST: ModelPrice = Object.values(MODEL_PRICE_MICROS)
  .reduce((worst, price) => (price.output > worst.output ? price : worst));

export function priceFor(model: string): ModelPrice {
  return MODEL_PRICE_MICROS[model] ?? DEAREST;
}

/** Rounded up: the ceiling exists to stop a bill, so never report less than spent. */
export function costMicros(model: string, usage: TokenUsage): number {
  const price = priceFor(model);
  const cached = Math.max(0, Math.min(usage.cached, usage.prompt));
  const fresh = Math.max(0, usage.prompt - cached);
  const completion = Math.max(0, usage.completion);
  return Math.ceil(fresh * price.input + cached * price.cached + completion * price.output);
}

/** How much of the input was served from cache. The number to watch: if it drops
 *  well below what §9.3 assumed, the prompt prefix has stopped being stable and the
 *  bill multiplies. Undefined when nothing was sent. */
export function cacheHitRate(usage: TokenUsage): number | undefined {
  if (usage.prompt <= 0) return undefined;
  return Math.min(1, Math.max(0, usage.cached / usage.prompt));
}

/** $2 a day unless configured otherwise. Deliberately a number someone with no
 *  revenue can sleep on, not a number sized to expected traffic. */
export const DEFAULT_CEILING_MICROS = 2_000_000;

export function ceilingMicros(read: (name: string) => string | undefined): number {
  const raw = read('AI_DAILY_BUDGET_USD')?.trim();
  if (!raw) return DEFAULT_CEILING_MICROS;
  const usd = Number(raw);
  // A malformed or absurd setting must not silently mean "no ceiling".
  if (!Number.isFinite(usd) || usd <= 0) return DEFAULT_CEILING_MICROS;
  return Math.round(usd * 1_000_000);
}

export type BudgetVerdict = { allowed: true } | { allowed: false; reason: 'daily_budget' };

/** Paying callers are never stopped by the ceiling: they are the reason there is a
 *  budget at all. Free callers lose AI features for the rest of the day and fall
 *  back to adding cards by hand. */
export function budgetVerdict(spentMicros: number, ceiling: number, isPro: boolean): BudgetVerdict {
  if (isPro) return { allowed: true };
  return spentMicros < ceiling ? { allowed: true } : { allowed: false, reason: 'daily_budget' };
}
