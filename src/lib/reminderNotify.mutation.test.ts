import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearReminderNotifyKeys,
  isReminderSlotNotified,
  reminderNotifyEntryId,
  reminderNotifyKey,
} from './reminderNotify';

describe('reminderNotify — mutation-hardened edge cases', () => {
  const id = 'item-abc';
  const remindAt = '2026-06-15T14:00:00.000Z';

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('builds slot keys with the internal separator', () => {
    const key = reminderNotifyKey(id, remindAt);
    expect(key).toBe(`${id}\u0001${remindAt}`);
    expect(key).not.toContain(`${id}:${remindAt}`);
    expect(key.length).toBe(id.length + 1 + remindAt.length);
  });

  it('extracts entry id from composite and legacy keys', () => {
    const key = reminderNotifyKey(id, remindAt);
    expect(reminderNotifyEntryId(key)).toBe(id);
    expect(reminderNotifyEntryId(id)).toBe(id);
    expect(reminderNotifyEntryId('')).toBe('');
  });

  it('detects exact slot keys', () => {
    const key = reminderNotifyKey(id, remindAt);
    expect(isReminderSlotNotified([key], id, remindAt)).toBe(true);
    expect(isReminderSlotNotified([], id, remindAt)).toBe(false);
    expect(isReminderSlotNotified([key], id, '2026-06-15T15:00:00.000Z')).toBe(false);
    expect(isReminderSlotNotified([key], 'other', remindAt)).toBe(false);
  });

  it('treats legacy id-only markers as notified only for past slots', () => {
    const legacy = [id];
    expect(isReminderSlotNotified(legacy, id, '2020-01-01T10:00:00.000Z')).toBe(true);
    expect(isReminderSlotNotified(legacy, id, remindAt)).toBe(false);
    expect(isReminderSlotNotified(legacy, id, '2099-01-01T10:00:00.000Z')).toBe(false);
  });

  it('treats legacy id-only markers as notified when remindAt equals now', () => {
    const atNow = '2026-06-15T12:00:00.000Z';
    expect(isReminderSlotNotified([id], id, atNow)).toBe(true);
  });

  it('does not treat legacy id-only markers as notified for invalid remindAt', () => {
    expect(isReminderSlotNotified([id], id, 'not-a-date')).toBe(false);
  });

  it('clears legacy id entries and composite keys for the same item', () => {
    const key = reminderNotifyKey(id, remindAt);
    const otherKey = reminderNotifyKey('other', '2026-01-01T00:00:00.000Z');
    const notified = [id, key, otherKey];
    expect(clearReminderNotifyKeys(notified, id)).toEqual([otherKey]);
  });

  it('preserves unrelated legacy ids when clearing a different item', () => {
    const notified = ['other-id', reminderNotifyKey(id, remindAt)];
    expect(clearReminderNotifyKeys(notified, 'someone-else')).toEqual(notified);
  });

  it('removes bare entries whose string equals the cleared id even when entryId differs', () => {
    const compositeId = `prefix${'\u0001'}suffix`;
    expect(clearReminderNotifyKeys([compositeId], compositeId)).toEqual([]);
  });
});
