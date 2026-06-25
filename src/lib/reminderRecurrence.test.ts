import { describe, expect, it } from 'vitest';
import { advanceReminderOnce, nextReminderOccurrence } from './reminderRecurrence';

describe('advanceReminderOnce', () => {
  it('advances daily by one day', () => {
    expect(advanceReminderOnce('2030-06-15T09:00:00.000Z', 'daily')).toBe(
      '2030-06-16T09:00:00.000Z',
    );
  });

  it('advances weekly by seven days', () => {
    expect(advanceReminderOnce('2030-06-15T09:00:00.000Z', 'weekly')).toBe(
      '2030-06-22T09:00:00.000Z',
    );
  });

  it('advances monthly by one calendar month', () => {
    expect(advanceReminderOnce('2030-06-15T09:00:00.000Z', 'monthly')).toBe(
      '2030-07-15T09:00:00.000Z',
    );
  });

  it('returns null for an unparseable timestamp', () => {
    expect(advanceReminderOnce('not-a-date', 'daily')).toBeNull();
  });
});

describe('nextReminderOccurrence', () => {
  // Built from LOCAL components so the start-of-today threshold (computed in
  // local time) lines up with the fixtures regardless of the runner's TZ. All
  // dates sit inside June 2030 → no DST boundary is crossed by the rolls.
  const ref = new Date(2030, 5, 15, 12, 0, 0);
  const localIso = (y: number, m: number, d: number, h: number) =>
    new Date(y, m, d, h, 0, 0).toISOString();

  it('keeps a future timestamp untouched', () => {
    const iso = localIso(2030, 5, 20, 9);
    expect(nextReminderOccurrence(iso, 'weekly', ref)).toBe(iso);
  });

  it('keeps an earlier-today timestamp (same day counts as upcoming)', () => {
    const iso = localIso(2030, 5, 15, 8); // 08:00 today, before ref but same day
    expect(nextReminderOccurrence(iso, 'daily', ref)).toBe(iso);
  });

  it('rolls a past daily reminder forward to today', () => {
    const next = nextReminderOccurrence(localIso(2030, 5, 10, 9), 'daily', ref);
    expect(next).toBe(localIso(2030, 5, 15, 9));
  });

  it('rolls a past weekly reminder forward to the next slot on/after today', () => {
    // June 1 + 14 days = June 15 (same weekday), the first slot on/after today.
    const next = nextReminderOccurrence(localIso(2030, 5, 1, 9), 'weekly', ref);
    expect(next).toBe(localIso(2030, 5, 15, 9));
  });

  it('rolls a past monthly reminder forward by whole months', () => {
    const next = nextReminderOccurrence(localIso(2030, 2, 20, 9), 'monthly', ref);
    expect(next).toBe(localIso(2030, 5, 20, 9));
  });

  it('returns null for an unparseable timestamp', () => {
    expect(nextReminderOccurrence('nope', 'daily', ref)).toBeNull();
  });
});
