// @ts-nocheck
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportsPwaOsSchedule } from './capabilities';

describe('supportsPwaOsSchedule', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when window is undefined (SSR)', () => {
    vi.stubGlobal('window', undefined);
    expect(supportsPwaOsSchedule()).toBe(false);
  });

  it('returns false in SSR even when scheduled-notification APIs exist on globals', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('navigator', { serviceWorker: {} });
    class FakeNotification {}
    Object.defineProperty(FakeNotification.prototype, 'showTrigger', { value: {} });
    vi.stubGlobal('Notification', FakeNotification);
    expect(supportsPwaOsSchedule()).toBe(false);
  });

  it('returns false when service worker is unavailable', () => {
    vi.stubGlobal('navigator', { serviceWorker: undefined });
    expect(supportsPwaOsSchedule()).toBe(false);
  });

  it('returns false when Notification is not on window', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    const prev = window.Notification;
    Reflect.deleteProperty(window, 'Notification');
    expect(supportsPwaOsSchedule()).toBe(false);
    window.Notification = prev;
  });

  it('returns false when showTrigger is missing from Notification.prototype', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    class FakeNotification {}
    vi.stubGlobal('Notification', FakeNotification);
    expect(supportsPwaOsSchedule()).toBe(false);
  });

  it('returns true when showTrigger is present (scheduled notifications)', () => {
    vi.stubGlobal('navigator', { serviceWorker: {} });
    class FakeNotification {}
    Object.defineProperty(FakeNotification.prototype, 'showTrigger', { value: {} });
    vi.stubGlobal('Notification', FakeNotification);
    expect(supportsPwaOsSchedule()).toBe(true);
  });
});
