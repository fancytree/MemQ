export type TermProgressRow = {
  term_id: string;
  status: string | null;
  last_reviewed_at?: string | null;
  updated_at?: string | null;
};

/**
 * 统一取每个 term 的最新学习状态，避免多条历史记录导致各页面进度不一致。
 */
export function buildLatestProgressMap(rows: TermProgressRow[]): Map<string, string | null> {
  const latest = new Map<string, { status: string | null; ts: number }>();

  rows.forEach((row) => {
    const tsSource = row.last_reviewed_at ?? row.updated_at ?? null;
    const ts = tsSource ? new Date(tsSource).getTime() : 0;
    const prev = latest.get(row.term_id);
    if (!prev || ts >= prev.ts) {
      latest.set(row.term_id, { status: row.status ?? null, ts });
    }
  });

  const statusMap = new Map<string, string | null>();
  latest.forEach((value, termId) => {
    statusMap.set(termId, value.status);
  });
  return statusMap;
}
