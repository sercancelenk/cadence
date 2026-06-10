import { describe, expect, it } from 'vitest';
import {
  buildCalendarMonthGrid,
  calendarMonthLabel,
  calendarSameDay,
  calendarStartOfDay,
  formatCalendarRangeLabel,
  isDateInRange,
} from './calendarGrid';

describe('calendarGrid', () => {
  it('normalizes dates to local midnight', () => {
    const d = calendarStartOfDay(new Date('2026-06-04T15:30:00'));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('builds a 42-cell Monday-first grid', () => {
    const view = new Date('2026-06-15T12:00:00');
    const grid = buildCalendarMonthGrid(view);
    expect(grid).toHaveLength(42);
    expect(grid.filter((c) => c.inMonth)).toHaveLength(30);
    expect(calendarMonthLabel(view)).toContain('June');
  });

  it('checks inclusive range membership', () => {
    const start = new Date('2026-06-04T08:00:00');
    const end = new Date('2026-06-10T20:00:00');
    expect(isDateInRange(new Date('2026-06-04T23:59:00'), start, end)).toBe(true);
    expect(isDateInRange(new Date('2026-06-11T00:00:00'), start, end)).toBe(false);
  });

  it('formats single-day and multi-day labels', () => {
    const day = new Date('2026-06-04T12:00:00');
    expect(formatCalendarRangeLabel(day, day)).toContain('4');
    const span = formatCalendarRangeLabel(
      new Date('2026-06-04T12:00:00'),
      new Date('2026-06-10T12:00:00'),
    );
    expect(span).toContain('4');
    expect(span).toContain('10');
    const crossYear = formatCalendarRangeLabel(
      new Date('2025-12-28T12:00:00'),
      new Date('2026-01-03T12:00:00'),
    );
    expect(crossYear).toContain('2025');
    expect(crossYear).toContain('2026');
    const sameYearDifferentMonth = formatCalendarRangeLabel(
      new Date('2026-03-04T12:00:00'),
      new Date('2026-06-10T12:00:00'),
    );
    expect(sameYearDifferentMonth).toContain('Mar');
    expect(sameYearDifferentMonth).toContain('Jun');
  });

  it('compares calendar days ignoring time', () => {
    expect(
      calendarSameDay(new Date('2026-06-04T08:00:00'), new Date('2026-06-04T22:00:00')),
    ).toBe(true);
  });
});
