/** Local-noon dates avoid daylight-saving transitions and keep calendar days stable. */
export function calendarCells(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0, 12).getDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= days ? new Date(year, month, day, 12) : null;
  });
}
export function sameCalendarDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function shiftCalendarMonth(month: Date, offset: number): Date {
  return new Date(month.getFullYear(), month.getMonth() + offset, 1, 12);
}
