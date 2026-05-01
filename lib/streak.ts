/**
 * 连续打卡：基于 user_term_progress.last_reviewed_at 的日历日聚合（与 Profile 页逻辑一致）
 */

/** 从进度记录的复习时间生成活动日集合（UTC 日期键 YYYY-MM-DD） */
export function activityDaysFromProgressUpdates(
  rows: { last_reviewed_at?: string | null; updated_at?: string | null }[],
): Set<string> {
  const activityDays = new Set<string>();
  rows.forEach((p) => {
    const ts = p.last_reviewed_at ?? p.updated_at ?? null;
    if (ts) {
      activityDays.add(new Date(ts).toISOString().slice(0, 10));
    }
  });
  return activityDays;
}

/** 历史最长连续天数 */
export function computeBestStreak(activityDays: Set<string>): number {
  const sortedDays = Array.from(activityDays).sort();
  let best = 0;
  let run = 0;
  let prevTime = 0;
  sortedDays.forEach((d) => {
    const t = new Date(d).setHours(0, 0, 0, 0);
    if (prevTime && t - prevTime === 86400000) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prevTime = t;
  });
  return best;
}

/**
 * 当前连续：从今天（本地日切到 0 点）往过去数，UTC 日期键落在 activityDays 则 +1
 * 与 Profile 展示保持一致
 */
export function computeCurrentStreak(activityDays: Set<string>): number {
  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (activityDays.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return current;
}
