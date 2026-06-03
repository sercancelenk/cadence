// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { postReminderCancelItem, postReminderSyncToServiceWorker } from './pwaReminderSync';
import type { ReminderSlot } from './types';

describe('pwaReminderSync', () => {
  const postMessage = vi.fn();
  let ready: Promise<{ active: { postMessage: typeof postMessage } | null }>;

  beforeEach(() => {
    postMessage.mockClear();
    ready = Promise.resolve({ active: { postMessage } });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('postReminderSyncToServiceWorker sends REMINDER_SYNC with slots', async () => {
    const slots: ReminderSlot[] = [
      {
        slotKey: 'k1',
        itemId: 't1',
        source: 'todo',
        remindAt: '2026-06-01T10:00:00.000Z',
        title: 'Task',
        body: '',
      },
    ];
    await postReminderSyncToServiceWorker(slots);
    expect(postMessage).toHaveBeenCalledWith({ type: 'REMINDER_SYNC', slots });
  });

  it('postReminderCancelItem sends REMINDER_CANCEL_ITEM', async () => {
    await postReminderCancelItem('item-42');
    expect(postMessage).toHaveBeenCalledWith({ type: 'REMINDER_CANCEL_ITEM', itemId: 'item-42' });
  });

  it('no-ops when service worker is not registered on navigator', async () => {
    vi.stubGlobal('navigator', {});
    await postReminderCancelItem('x');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('no-ops when ready rejects or active worker is missing', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('offline')) },
    });
    await postReminderSyncToServiceWorker([]);
    expect(postMessage).not.toHaveBeenCalled();

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active: null }) },
    });
    await postReminderCancelItem('y');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('postReminderCancelItem no-ops for empty item id', async () => {
    await postReminderCancelItem('');
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('postReminderSyncToServiceWorker no-ops when service worker is not registered on navigator', async () => {
    vi.stubGlobal('navigator', {});
    await postReminderSyncToServiceWorker([]);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('postReminderSyncToServiceWorker no-ops when ready rejects without throwing', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('offline')) },
    });
    await expect(postReminderSyncToServiceWorker([])).resolves.toBeUndefined();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('postReminderCancelItem no-ops when ready resolves without active worker', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve({ active: null }) },
    });
    await expect(postReminderCancelItem('z')).resolves.toBeUndefined();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('postReminderCancelItem no-ops when ready rejects without throwing', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('offline')) },
    });
    await expect(postReminderCancelItem('reject-me')).resolves.toBeUndefined();
    expect(postMessage).not.toHaveBeenCalled();
  });
});
