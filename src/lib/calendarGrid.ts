/** Shared month-grid helpers for schedule popover and date-range picker. */

export const CALENDAR_WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

export function calendarStartOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function calendarSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function calendarMonthLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** Build a 6×7 Monday-first grid for `viewMonth`. */
export function buildCalendarMonthGrid(viewMonth: Date): { date: Date; inMonth: boolean }[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const dow = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - dow);
  const out: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push({ date: d, inMonth: d.getMonth() === viewMonth.getMonth() });
  }
  return out;
}

export function isDateInRange(day: Date, start: Date, end: Date): boolean {
  const t = calendarStartOfDay(day).getTime();
  const a = calendarStartOfDay(start).getTime();
  const b = calendarStartOfDay(end).getTime();
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return t >= lo && t <= hi;
}

export function formatCalendarRangeLabel(start: Date, end: Date): string {
  const a = calendarStartOfDay(start);
  const b = calendarStartOfDay(end);
  const lo = a.getTime() <= b.getTime() ? a : b;
  const hi = a.getTime() <= b.getTime() ? b : a;
  const sameYear = lo.getFullYear() === hi.getFullYear();
  const sameMonth = sameYear && lo.getMonth() === hi.getMonth();
  if (calendarSameDay(lo, hi)) {
    return lo.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }
  if (sameMonth) {
    return `${lo.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${hi.toLocaleDateString(undefined, { day: 'numeric', year: 'numeric' })}`;
  }
  if (sameYear) {
    return `${lo.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${hi.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return `${lo.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${hi.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}
