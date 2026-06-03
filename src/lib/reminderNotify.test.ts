import { describe, expect, it } from 'vitest';
import {
  clearReminderNotifyKeys,
  isReminderSlotNotified,
  reminderNotifyKey,
} from './reminderNotify';

describe('reminderNotify', () => {
  it('tracks notified slots by id + remindAt', () => {
    const id = 'todo-1';
    const first = '2026-05-31T10:00:00.000Z';
    const second = '2026-05-31T11:00:00.000Z';
    const notified = [reminderNotifyKey(id, first)];

    expect(isReminderSlotNotified(notified, id, first)).toBe(true);
    expect(isReminderSlotNotified(notified, id, second)).toBe(false);
  });

  it('allows a future reschedule after a legacy id-only marker', () => {
    const id = 'todo-1';
    const past = '2020-01-01T10:00:00.000Z';
    const future = '2099-01-01T10:00:00.000Z';
    const notified = [id];

    expect(isReminderSlotNotified(notified, id, past)).toBe(true);
    expect(isReminderSlotNotified(notified, id, future)).toBe(false);
  });

  it('clears all notify keys for an item id', () => {
    const id = 'todo-1';
    const notified = [id, reminderNotifyKey(id, '2026-05-31T10:00:00.000Z'), reminderNotifyKey('other', 'x')];
    expect(clearReminderNotifyKeys(notified, id)).toEqual([reminderNotifyKey('other', 'x')]);
  });
});
