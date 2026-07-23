import { describe, expect, it } from 'vitest';
import {
  convertDurationAll,
  formatDurationValue,
  fromMilliseconds,
  parseDurationAmount,
  toMilliseconds,
} from './durationConvert';

describe('durationConvert', () => {
  it('parses amounts and rejects junk', () => {
    expect(parseDurationAmount('90')).toEqual({ ok: true, value: 90 });
    expect(parseDurationAmount('1,234.5')).toEqual({ ok: true, value: 1234.5 });
    expect(parseDurationAmount('')).toMatchObject({ ok: false });
    expect(parseDurationAmount('abc')).toMatchObject({ ok: false });
  });

  it('converts exact SI multiples through milliseconds', () => {
    expect(toMilliseconds(1, 's')).toBe(1000);
    expect(toMilliseconds(1, 'min')).toBe(60_000);
    expect(toMilliseconds(1, 'h')).toBe(3_600_000);
    expect(toMilliseconds(1, 'd')).toBe(86_400_000);
    expect(toMilliseconds(1, 'w')).toBe(604_800_000);
    expect(fromMilliseconds(90_000, 'min')).toBe(1.5);
  });

  it('round-trips hours → all units for a clean amount', () => {
    const r = convertDurationAll(2, 'h');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ms).toBe(7_200_000);
    const byUnit = Object.fromEntries(r.rows.map((row) => [row.unit, row.display]));
    expect(byUnit.ms).toBe('7200000');
    expect(byUnit.s).toBe('7200');
    expect(byUnit.min).toBe('120');
    expect(byUnit.h).toBe('2');
    expect(byUnit.d).toBe(formatDurationValue(2 / 24));
  });

  it('marks month and year as approximate and uses mean Gregorian factors', () => {
    const r = convertDurationAll(1, 'y');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const year = r.rows.find((row) => row.unit === 'y');
    const month = r.rows.find((row) => row.unit === 'mo');
    const days = r.rows.find((row) => row.unit === 'd');
    expect(year?.approximate).toBe(true);
    expect(month?.approximate).toBe(true);
    expect(days?.approximate).toBe(false);
    expect(year?.display).toBe('1');
    // 12 mean months in a mean year
    expect(Number(month?.display)).toBeCloseTo(12, 10);
    expect(Number(days?.display)).toBeCloseTo(365.2425, 6);
  });

  it('rejects magnitudes beyond safe integer milliseconds', () => {
    const r = convertDurationAll(Number.MAX_SAFE_INTEGER, 'd');
    expect(r.ok).toBe(false);
  });
});
