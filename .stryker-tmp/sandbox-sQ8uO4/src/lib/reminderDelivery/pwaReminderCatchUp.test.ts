// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectPwaDeliveredSlotKeys, parseReminderNotificationTag } from './pwaReminderCatchUp';

describe('parseReminderNotificationTag', () => {
  it('parses cadence SW tags', () => {
    expect(parseReminderNotificationTag('cadence:t1|2026-05-31T14:00:00.000Z')).toEqual({
      itemId: 't1',
      remindAt: '2026-05-31T14:00:00.000Z',
    });
  });

  it('rejects unknown tags', () => {
    expect(parseReminderNotificationTag('other:t1|x')).toBeNull();
  });

  it('rejects tags without separator or empty parts', () => {
    expect(parseReminderNotificationTag('cadence:only-id')).toBeNull();
    expect(parseReminderNotificationTag('cadence:|2026-01-01')).toBeNull();
    expect(parseReminderNotificationTag('cadence:id|')).toBeNull();
  });
});

describe('collectPwaDeliveredSlotKeys', () => {
  const originalNotification = globalThis.Notification;
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: originalNotification,
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: originalNavigator,
    });
  });

  function mockEnv(opts: {
    permission?: NotificationPermission;
    notifications?: Array<{ tag?: string }>;
    serviceWorker?: boolean;
    ready?: boolean;
  }) {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: opts.permission ?? 'granted' },
    });

    const getNotifications = vi.fn(async () => opts.notifications ?? []);
    const ready = opts.ready === false ? Promise.reject(new Error('no sw')) : Promise.resolve({ getNotifications });

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        serviceWorker: opts.serviceWorker === false ? undefined : { ready },
      },
    });
  }

  it('returns empty when service worker is unavailable', async () => {
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    await expect(collectPwaDeliveredSlotKeys()).resolves.toEqual([]);
  });

  it('returns empty when notification permission is not granted', async () => {
    mockEnv({ permission: 'denied' });
    await expect(collectPwaDeliveredSlotKeys()).resolves.toEqual([]);
  });

  it('returns empty when service worker is not ready', async () => {
    mockEnv({ ready: false });
    await expect(collectPwaDeliveredSlotKeys()).resolves.toEqual([]);
  });

  it('collects slot keys for past-due cadence notifications', async () => {
    mockEnv({
      notifications: [
        { tag: 'cadence:item-1|2020-01-01T10:00:00.000Z' },
        { tag: 'cadence:item-2|2030-01-01T10:00:00.000Z' },
        { tag: 'other:ignored|2020-01-01T10:00:00.000Z' },
        { tag: undefined },
      ],
    });

    const keys = await collectPwaDeliveredSlotKeys(new Date('2025-06-01T00:00:00.000Z').getTime());
    expect(keys).toEqual(['item-1\u00012020-01-01T10:00:00.000Z']);
  });

  it('ignores notifications whose remindAt is in the future', async () => {
    mockEnv({
      notifications: [{ tag: 'cadence:future|2099-01-01T10:00:00.000Z' }],
    });
    const keys = await collectPwaDeliveredSlotKeys(Date.now());
    expect(keys).toEqual([]);
  });

  it('ignores notifications with invalid remindAt timestamps', async () => {
    mockEnv({
      notifications: [{ tag: 'cadence:bad|not-a-date' }],
    });
    const keys = await collectPwaDeliveredSlotKeys(Date.now());
    expect(keys).toEqual([]);
  });
});
