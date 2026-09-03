/**
 * 连续打卡：基于 user_term_progress.last_reviewed_at 的日历日聚合（与 Profile 页逻辑一致）
 */

/** 将时间转换为本地日期键 YYYY-MM-DD（避免 UTC 跨天误差） */
function toLocalDateKey(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 从进度记录的复习时间生成活动日集合（本地日期键 YYYY-MM-DD） */
export function activityDaysFromProgressUpdates(
  rows: { last_reviewed_at?: string | null; updated_at?: string | null }[],
): Set<string> {
  const activityDays = new Set<string>();
  rows.forEach((p) => {
    const ts = p.last_reviewed_at ?? p.updated_at ?? null;
    if (ts) {
      activityDays.add(toLocalDateKey(ts));
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
 * 当前连续：从今天（本地日切到 0 点）往过去数，本地日期键落在 activityDays 则 +1
 * 与 Profile 展示保持一致
 *
 * 规则：若今天尚未有活动，则从昨天开始数——streak 在当天结束前保持有效，
 * 避免用户今天还没学习就看到昨天的 streak 清零。
 */
export function computeCurrentStreak(activityDays: Set<string>): number {
  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  // 今天还没学习时，从昨天开始计数（streak 当天内保持）
  if (!activityDays.has(toLocalDateKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  while (activityDays.has(toLocalDateKey(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return current;
}
