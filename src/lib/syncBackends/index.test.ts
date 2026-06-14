/**
 * Tests for the sync backend registry — active-backend selection,
 * localStorage persistence, and cross-tab / same-tab subscriptions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncBackend } from './types';

const ACTIVE_BACKEND_KEY = 'cadence.sync.activeBackend.v1';
const CHANGE_EVENT = 'cadence:sync-backend-changed';

const { createGDriveBackend } = vi.hoisted(() => ({
  createGDriveBackend: vi.fn<() => SyncBackend | null>(),
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

function fakeBackend(): SyncBackend {
  return {
    id: 'gdrive',
    displayName: 'gdrive',
    e2eEncryption: true,
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
      return 'gdrive';
    },
  };
}

describe('syncBackends registry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    createGDriveBackend.mockReturnValue(null);
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  describe('getActiveBackendId', () => {
    it('returns explicit gdrive selection from localStorage', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'gdrive');
      expect(getActiveBackendId()).toBe('gdrive');
    });

    it('returns null when nothing is configured', () => {
      expect(getActiveBackendId()).toBeNull();
    });

    it('ignores invalid localStorage values and returns null', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'dropbox');
      expect(getActiveBackendId()).toBeNull();
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
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'gdrive');
      setActiveBackendId(null);
      expect(window.localStorage.getItem(ACTIVE_BACKEND_KEY)).toBeNull();
    });
  });

  describe('getActiveBackend', () => {
    it('instantiates the GDrive backend when gdrive is active', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'gdrive');
      const drive = fakeBackend();
      createGDriveBackend.mockReturnValue(drive);
      expect(getActiveBackend()).toBe(drive);
    });

    it('returns null when no backend is active', () => {
      expect(getActiveBackend()).toBeNull();
    });

    it('returns null when gdrive is selected but the user signed out', () => {
      window.localStorage.setItem(ACTIVE_BACKEND_KEY, 'gdrive');
      createGDriveBackend.mockReturnValue(null);
      expect(getActiveBackend()).toBeNull();
    });
  });

  describe('subscribeActiveBackend', () => {
    it('fires on setActiveBackendId in the same tab', () => {
      const cb = vi.fn();
      const unsub = subscribeActiveBackend(cb);

      setActiveBackendId('gdrive');
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      setActiveBackendId(null);
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
