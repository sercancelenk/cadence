import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORAGE_PREFIX, STORAGE_PREFIX_LEGACY } from './appBranding';
import { migrateLegacyStorage } from './legacyStorageMigration';

const MIGRATION_MARKER = `${STORAGE_PREFIX}:legacy-storage-migrated:v1`;

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('migrateLegacyStorage', () => {
  let local: Storage;
  let session: Storage;

  beforeEach(() => {
    local = makeStorage();
    session = makeStorage();
    vi.stubGlobal('window', {
      localStorage: local,
      sessionStorage: session,
    });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('copies legacy localStorage keys with dash, colon, and dot separators', () => {
    local.setItem(`${STORAGE_PREFIX_LEGACY}-theme`, 'dark');
    local.setItem(`${STORAGE_PREFIX_LEGACY}:session`, 'abc');
    local.setItem(`${STORAGE_PREFIX_LEGACY}.pair`, 'token');

    migrateLegacyStorage();

    expect(local.getItem(`${STORAGE_PREFIX}-theme`)).toBe('dark');
    expect(local.getItem(`${STORAGE_PREFIX}:session`)).toBe('abc');
    expect(local.getItem(`${STORAGE_PREFIX}.pair`)).toBe('token');
    expect(local.getItem(MIGRATION_MARKER)).toBe('1');
  });

  it('copies legacy sessionStorage keys', () => {
    session.setItem(`${STORAGE_PREFIX_LEGACY}-collapse`, '1');

    migrateLegacyStorage();

    expect(session.getItem(`${STORAGE_PREFIX}-collapse`)).toBe('1');
    expect(local.getItem(MIGRATION_MARKER)).toBe('1');
  });

  it('does not overwrite an existing new key', () => {
    local.setItem(`${STORAGE_PREFIX_LEGACY}-theme`, 'legacy-dark');
    local.setItem(`${STORAGE_PREFIX}-theme`, 'new-dark');

    migrateLegacyStorage();

    expect(local.getItem(`${STORAGE_PREFIX}-theme`)).toBe('new-dark');
  });

  it('is idempotent when the marker is already set', () => {
    local.setItem(MIGRATION_MARKER, '1');
    local.setItem(`${STORAGE_PREFIX_LEGACY}-theme`, 'dark');

    migrateLegacyStorage();

    expect(local.getItem(`${STORAGE_PREFIX}-theme`)).toBeNull();
  });

  it('logs when keys were migrated', () => {
    local.setItem(`${STORAGE_PREFIX_LEGACY}-theme`, 'dark');
    migrateLegacyStorage();
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('migrated 1 localStorage'),
    );
  });

  it('does not mark migration complete when a key copy fails, so it retries next launch', () => {
    let failNext = true;
    const flakyLocal: Storage = {
      get length() {
        return local.length;
      },
      clear: () => local.clear(),
      getItem: (key: string) => local.getItem(key),
      key: (index: number) => local.key(index),
      removeItem: (key: string) => local.removeItem(key),
      setItem(key: string, value: string) {
        // Fail only the legacy-key copy (quota/ITP), not the marker write.
        if (failNext && key.startsWith(`${STORAGE_PREFIX}-`)) {
          failNext = false;
          throw new Error('quota exceeded');
        }
        local.setItem(key, value);
      },
    };
    vi.stubGlobal('window', { localStorage: flakyLocal, sessionStorage: session });
    local.setItem(`${STORAGE_PREFIX_LEGACY}-theme`, 'dark');

    migrateLegacyStorage();

    // First attempt failed -> marker not set.
    expect(local.getItem(MIGRATION_MARKER)).toBeNull();

    // Second launch retries and succeeds (idempotent copy), then sets marker.
    migrateLegacyStorage();
    expect(local.getItem(`${STORAGE_PREFIX}-theme`)).toBe('dark');
    expect(local.getItem(MIGRATION_MARKER)).toBe('1');
  });

  it('no-ops when window is undefined', () => {
    vi.stubGlobal('window', undefined);
    expect(() => migrateLegacyStorage()).not.toThrow();
  });

  it('returns early when reading the marker throws', () => {
    const throwingLocal = {
      ...local,
      getItem: () => {
        throw new Error('blocked');
      },
    };
    vi.stubGlobal('window', { localStorage: throwingLocal, sessionStorage: session });
    local.setItem(`${STORAGE_PREFIX_LEGACY}-theme`, 'dark');
    migrateLegacyStorage();
    expect(local.getItem(`${STORAGE_PREFIX}-theme`)).toBeNull();
  });
});
