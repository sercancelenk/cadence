import { describe, expect, it } from 'vitest';
import { formatDateChipLabel, todayIsoDate } from './richTextDateChip';

describe('formatDateChipLabel', () => {
  it('formats YYYY-MM-DD for display', () => {
    const label = formatDateChipLabel('2026-05-31');
    expect(label).toBeTruthy();
    expect(label).not.toBe('2026-05-31');
  });

  it('returns raw string for invalid dates', () => {
    expect(formatDateChipLabel('not-a-date')).toBe('not-a-date');
  });
});

describe('todayIsoDate', () => {
  it('returns YYYY-MM-DD', () => {
    expect(todayIsoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
