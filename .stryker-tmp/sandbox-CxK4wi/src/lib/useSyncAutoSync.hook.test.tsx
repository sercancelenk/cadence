// @ts-nocheck
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../model';
import type { SyncBackend } from './syncBackends/types';

const mocks = vi.hoisted(() => ({
  replaceAll: vi.fn(),
  flushPendingSave: vi.fn(async () => undefined),
  savePair: vi.fn(),
  stripPairFromUrl: vi.fn(),
  backend: null as SyncBackend | null,
  backendSubscriber: null as (() => void) | null,
}));

vi.mock('../AccountContext', () => ({
  useAccount: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('../AppDataContext', () => ({
  useAppData: () => ({
    replaceAll: mocks.replaceAll,
    flushPendingSave: mocks.flushPendingSave,
    data: { version: 3 } as AppData,
  }),
}));

vi.mock('./lanSyncClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lanSyncClient')>();
  return {
    ...actual,
    readPairFromUrl: () => ({ host: '192.168.1.10', token: 'abc' }),
    savePair: mocks.savePair,
    stripPairFromUrl: mocks.stripPairFromUrl,
  };
});

vi.mock('./syncBackends', () => ({
  getActiveBackend: () => mocks.backend,
  subscribeActiveBackend: (fn: () => void) => {
    mocks.backendSubscriber = fn;
    return () => {
      mocks.backendSubscriber = null;
    };
  },
}));

import { useSyncAutoSync } from './useSyncAutoSync';

function makeBackend() {
  const pull = vi.fn(async () => ({ kind: 'no-snapshot' as const }));
  const backendImpl: SyncBackend = {
    id: 'gdrive',
    displayName: 'Fake',
    e2eEncryption: true,
    status: async () => 'ready',
    pull,
    push: async () => ({ kind: 'ok', etag: '1' }),
    getRecord: () => null,
    setRecord: () => undefined,
    describe: () => 'fake',
  };
  return { backend: backendImpl, pull };
}

describe('useSyncAutoSync hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.replaceAll.mockReset();
    mocks.flushPendingSave.mockClear();
    mocks.savePair.mockClear();
    mocks.stripPairFromUrl.mockClear();
    const fake = makeBackend();
    mocks.backend = fake.backend;
  });

  afterEach(() => {
    vi.useRealTimers();
    mocks.backend = null;
    mocks.backendSubscriber = null;
  });

  it('does not register listeners when disabled', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    renderHook(() => useSyncAutoSync({ enabled: false }));
    expect(addSpy).not.toHaveBeenCalledWith('focus', expect.any(Function));
    addSpy.mockRestore();
  });

  it('adopts LAN pair params and runs an initial sync when enabled', async () => {
    const fake = makeBackend();
    mocks.backend = fake.backend;
    renderHook(() => useSyncAutoSync({ enabled: true }));

    expect(mocks.savePair).toHaveBeenCalledWith({ host: '192.168.1.10', token: 'abc' });
    expect(mocks.stripPairFromUrl).toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });

    expect(fake.pull).toHaveBeenCalled();
  });

  it('cleans up listeners on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useSyncAutoSync({ enabled: true }));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    removeSpy.mockRestore();
  });
});
