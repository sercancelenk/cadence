/**
 * Tests for the sync backend registry — active-backend selection,
 * localStorage persistence, and cross-tab / same-tab subscriptions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncBackend } from './types';

const ACTIVE_BACKEND_KEY = 'cadence.sync.activeBackend.v1';
const CHANGE_EVENT = 'cadence:sync-backend-changed';

const { createLanBackend, createGDriveBackend } = vi.hoisted(() => ({
  createLanBackend: vi.fn<() => SyncBackend | null>(),
  createGDriveBackend: vi.fn<() => SyncBackend | null>(),
}));

vi.mock('./lan', () => ({
  createLanBackend,
  disconnectLan: vi.fn(),
}));

vi.mock('./gdrive', () => ({
  createGDriveBackend,
  disconnectGDrive: vi.fn(),
}));

import {
  getActiveBackend,
  getActiveBackendId,
  setActiveBackendId,
  subscribeActiveBackend,
} from './index';

function fakeBackend(id: 'lan' | 'gdrive'): SyncBackend {
  return {
    id,
    displayName: id,
    e2eEncryption: id === 'gdrive',
    async status() {
      return 'ready';
    },
    async pull() {
      return { kind: 'not-modified' };
    },
    async push() {
      return { kind: 'ok', etag: '1' };
    },
    getRecord() {
      return null;
    },
    setRecord() {},
    describe() {
      return id;
    },
  };
}

describe('syncBackends registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    createLanBackend.mockReturnValue(null);
    createGDriveBackend.mockReturnValue(null);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('getActiveBackendId', () => {
    it('returns explicit lan selection from localStorage', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'lan');
      expect(getActiveBackendId()).toBe('lan');
    });

    it('returns explicit gdrive selection from localStorage', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'gdrive');
      expect(getActiveBackendId()).toBe('gdrive');
    });

    it('falls back to lan when a pair exists but no explicit selection', () => {
      createLanBackend.mockReturnValue(fakeBackend('lan'));
      expect(getActiveBackendId()).toBe('lan');
      expect(createLanBackend).toHaveBeenCalled();
    });

    it('returns null when nothing is configured', () => {
      expect(getActiveBackendId()).toBeNull();
    });

    it('ignores invalid localStorage values and falls back', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'dropbox');
      createLanBackend.mockReturnValue(fakeBackend('lan'));
      expect(getActiveBackendId()).toBe('lan');
    });
  });

  describe('setActiveBackendId', () => {
    it('persists the backend id and dispatches a change event', () => {
      const listener = vi.fn();
      window.addEventListener(CHANGE_EVENT, listener);

      setActiveBackendId('gdrive');
      expect(window.localStorage.getItem(ACTIVE_BACKEND_KEY)).toBe('gdrive');
      expect(listener).toHaveBeenCalledTimes(1);

      window.removeEventListener(CHANGE_EVENT, listener);
    });

    it('removes the key when clearing selection', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'lan');
      setActiveBackendId(null);
      expect(window.localStorage.getItem(ACTIVE_BACKEND_KEY)).toBeNull();
    });
  });

  describe('getActiveBackend', () => {
    it('instantiates the LAN backend when lan is active', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'lan');
      const lan = fakeBackend('lan');
      createLanBackend.mockReturnValue(lan);
      expect(getActiveBackend()).toBe(lan);
    });

    it('instantiates the GDrive backend when gdrive is active', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'gdrive');
      const drive = fakeBackend('gdrive');
      createGDriveBackend.mockReturnValue(drive);
      expect(getActiveBackend()).toBe(drive);
    });

    it('returns null when no backend is active', () => {
      expect(getActiveBackend()).toBeNull();
    });

    it('returns null when lan is selected but pair was cleared', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'lan');
      createLanBackend.mockReturnValue(null);
      expect(getActiveBackend()).toBeNull();
    });
  });

  describe('subscribeActiveBackend', () => {
    it('fires on setActiveBackendId in the same tab', () => {
      const cb = vi.fn();
      const unsub = subscribeActiveBackend(cb);

      setActiveBackendId('lan');
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      setActiveBackendId('gdrive');
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('fires on storage events for the active-backend key', () => {
      const cb = vi.fn();
      const unsub = subscribeActiveBackend(cb);

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: ACTIVE_BACKEND_KEY,
          newValue: 'gdrive',
          storageArea: window.localStorage,
        }),
      );
      expect(cb).toHaveBeenCalledTimes(1);

      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'other-key',
          newValue: 'x',
          storageArea: window.localStorage,
        }),
      );
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
    });
  });
});
