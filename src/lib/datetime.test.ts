import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatDateShort,
  formatShort,
  formatTimeOnly,
  fromLocalDatetimeValue,
  isPast,
  isSameLocalDay,
  pad2,
  toLocalDatetimeValue,
} from './datetime';

describe('pad2', () => {
  it('pads single-digit numbers', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(9)).toBe('09');
  });

  it('leaves two-digit numbers unchanged', () => {
    expect(pad2(10)).toBe('10');
    expect(pad2(99)).toBe('99');
  });
});

describe('toLocalDatetimeValue', () => {
  it('returns empty for missing or invalid input', () => {
    expect(toLocalDatetimeValue()).toBe('');
    expect(toLocalDatetimeValue('')).toBe('');
    expect(toLocalDatetimeValue('not-a-date')).toBe('');
  });

  it('formats a local datetime-local value', () => {
    const local = new Date(2024, 2, 15, 14, 30);
    expect(toLocalDatetimeValue(local.toISOString())).toBe('2024-03-15T14:30');
  });
});

describe('fromLocalDatetimeValue', () => {
  it('returns undefined for blank or invalid input', () => {
    expect(fromLocalDatetimeValue('')).toBeUndefined();
    expect(fromLocalDatetimeValue('   ')).toBeUndefined();
    expect(fromLocalDatetimeValue('bad')).toBeUndefined();
  });

  it('parses a datetime-local string to ISO', () => {
    const iso = fromLocalDatetimeValue('2024-03-15T14:30');
    expect(iso).toBeDefined();
    expect(new Date(iso!).getTime()).not.toBeNaN();
  });
});

describe('formatShort', () => {
  it('returns em dash for missing or invalid dates', () => {
    expect(formatShort()).toBe('—');
    expect(formatShort('')).toBe('—');
    expect(formatShort('nope')).toBe('—');
  });

  it('formats a valid ISO date', () => {
    const out = formatShort('2024-06-15T12:00:00.000Z');
    expect(out).not.toBe('—');
    expect(out.length).toBeGreaterThan(0);
  });
});

describe('formatTimeOnly', () => {
  it('returns empty for missing or invalid dates', () => {
    expect(formatTimeOnly()).toBe('');
    expect(formatTimeOnly('bad')).toBe('');
  });

  it('formats time for a valid ISO date', () => {
    expect(formatTimeOnly('2024-06-15T14:30:00.000Z').length).toBeGreaterThan(0);
  });
});

describe('formatDateShort', () => {
  it('returns empty for missing or invalid dates', () => {
    expect(formatDateShort()).toBe('');
    expect(formatDateShort('bad')).toBe('');
  });

  it('formats a short date for valid ISO', () => {
    const out = formatDateShort('2024-06-15T12:00:00.000Z');
    expect(out).toMatch(/15/);
    expect(out.toLowerCase()).toMatch(/jun/);
  });
});

describe('isSameLocalDay', () => {
  it('returns false for invalid ISO', () => {
    expect(isSameLocalDay('invalid')).toBe(false);
  });

  it('matches when ISO falls on the reference local day', () => {
    const ref = new Date(2024, 5, 10, 15, 0);
    const iso = new Date(2024, 5, 10, 8, 30).toISOString();
    expect(isSameLocalDay(iso, ref)).toBe(true);
  });

  it('returns false for a different local day', () => {
    const ref = new Date(2024, 5, 10);
    const iso = new Date(2024, 5, 11).toISOString();
    expect(isSameLocalDay(iso, ref)).toBe(false);
  });
});

describe('isPast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false for missing or invalid ISO', () => {
    expect(isPast()).toBe(false);
    expect(isPast('')).toBe(false);
    expect(isPast('nope')).toBe(false);
  });

  it('returns true when timestamp is before now', () => {
    expect(isPast('2020-01-01T00:00:00.000Z')).toBe(true);
  });

  it('returns false when timestamp is in the future', () => {
    expect(isPast('2030-01-01T00:00:00.000Z')).toBe(false);
  });
});
