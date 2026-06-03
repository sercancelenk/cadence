import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSyncPassphrase,
  getSyncPassphrase,
  hasSyncPassphrase,
  setSyncPassphrase,
  subscribeSyncPassphrase,
} from './syncSession';

const SESSION_KEY = 'cadence.sync.passphrase.v1';

describe('syncSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSyncPassphrase();
  });

  afterEach(() => {
    sessionStorage.clear();
    clearSyncPassphrase();
    vi.restoreAllMocks();
  });

  it('returns null when no passphrase is set', () => {
    expect(getSyncPassphrase()).toBeNull();
    expect(hasSyncPassphrase()).toBe(false);
  });

  it('stores passphrase in memory and sessionStorage by default', () => {
    setSyncPassphrase('secret');
    expect(getSyncPassphrase()).toBe('secret');
    expect(sessionStorage.getItem(SESSION_KEY)).toBe('secret');
    expect(hasSyncPassphrase()).toBe(true);
  });

  it('keeps in-memory passphrase when remember is false', () => {
    setSyncPassphrase('temp', false);
    expect(getSyncPassphrase()).toBe('temp');
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('clearSyncPassphrase removes memory and storage', () => {
    setSyncPassphrase('gone');
    clearSyncPassphrase();
    expect(getSyncPassphrase()).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('hydrates memo from sessionStorage on first read', () => {
    sessionStorage.setItem(SESSION_KEY, 'from-tab');
    expect(getSyncPassphrase()).toBe('from-tab');
  });

  it('notifies subscribers when passphrase changes', () => {
    const cb = vi.fn();
    const unsub = subscribeSyncPassphrase(cb);
    setSyncPassphrase('x');
    clearSyncPassphrase();
    unsub();
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('refreshes memo on cross-tab storage events', () => {
    const cb = vi.fn();
    const unsub = subscribeSyncPassphrase(cb);
    sessionStorage.setItem(SESSION_KEY, 'other-tab');
    window.dispatchEvent(
      new StorageEvent('storage', { key: SESSION_KEY, newValue: 'other-tab' }),
    );
    unsub();
    expect(getSyncPassphrase()).toBe('other-tab');
    expect(cb).toHaveBeenCalled();
  });

  it('returns null when sessionStorage.getItem throws', () => {
    clearSyncPassphrase();
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(getSyncPassphrase()).toBeNull();
    getItem.mockRestore();
  });

  it('keeps passphrase in memory when sessionStorage.setItem throws', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    setSyncPassphrase('still-here', true);
    expect(getSyncPassphrase()).toBe('still-here');
    setItem.mockRestore();
  });
});
