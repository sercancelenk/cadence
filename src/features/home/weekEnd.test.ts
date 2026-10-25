import { describe, expect, it } from 'vitest';
import { isWeekEnd } from './weekEnd';

describe('isWeekEnd', () => {
  it('is true on Friday, Saturday and Sunday (local time) and false Monday to Thursday', () => {
    // 2026-10-25 is a Sunday.
    const day = (n: number) => new Date(2026, 9, 25 + n, 12);
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => isWeekEnd(day(n)))).toEqual([true, false, false, false, false, true, true]);
  });
});
