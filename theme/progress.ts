/** Data, not reference geometry: 6/20 is always 30%, never the drawn 57/236 ratio. */
export function progressPercent(completed: number, total: number): number {
  if (!Number.isFinite(completed) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, (completed / total) * 100));
}
