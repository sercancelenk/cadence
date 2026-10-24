/**
 * Flush contract of AppDataProvider.
 *
 * Typing is written on a slow interval, so everything that must not wait for it
 * (quit, lock, sign-out, ⌘S, window blur, note switch) goes through
 * `flushPendingSave`. These tests pin that a flush persists the edit the editor
 * hands over *during* the flush, that a blocked workspace is never written, and
 * that `update` publishes its result synchronously.
 */

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeData, type AppData } from '../core/model';
import { registerBeforeFlushHook } from '../lib/pendingSaveFlush';
import { STORAGE_PREFIX } from '../lib/appBranding';

const account = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }));

vi.mock('./AccountContext', () => ({
  useAccount: () => ({ user: account.user }),
}));

import { AppDataProvider, useAppData } from './AppDataContext';

type Api = ReturnType<typeof useAppData>;
type Saved = Record<string, unknown>;

let api: Api;
let saved: Saved[];

function Probe() {
  api = useAppData();
  return null;
}

function installCadence(loadResult: Record<string, unknown>) {
  saved = [];
  (window as unknown as { cadence: unknown }).cadence = {
    loadDataResult: vi.fn(async () => loadResult),
    saveData: vi.fn(async (payload: Saved) => {
      saved.push(payload);
      return { ok: true, writeGeneration: saved.length };
    }),
  };
}

async function mountReady() {
  render(
    <AppDataProvider>
      <Probe />
    </AppDataProvider>,
  );
  await waitFor(() => expect(api.ready).toBe(true));
  // A first-run seed write is not what these tests are about.
  await act(async () => {
    await api.flushPendingSave();
  });
  saved.length = 0;
}

const healthy = () => ({ ok: true, data: normalizeData(null) as AppData, writeGeneration: 1 });
const lastSaved = () => saved[saved.length - 1] as { lastTeamId?: string } | undefined;

describe('AppDataProvider flush', () => {
  beforeEach(() => {
    account.user = { id: 'user-1' };
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { cadence?: unknown }).cadence;
  });

  it('persists the edit an editor hook hands over during the flush, without waiting for the typing timer', async () => {
    installCadence(healthy());
    await mountReady();

    const off = registerBeforeFlushHook(() => {
      api.update((d) => ({ ...d, lastTeamId: 'typed-in-editor' }), 'typing');
    }, 'editor');

    await act(async () => {
      await api.flushPendingSave();
    });
    off();

    expect(lastSaved()?.lastTeamId).toBe('typed-in-editor');
  });

  it('exposes the result of update synchronously through getLatestSnapshot', async () => {
    installCadence(healthy());
    await mountReady();

    let seen: string | undefined;
    await act(async () => {
      api.update((d) => ({ ...d, lastTeamId: 'just-now' }), 'typing');
      seen = api.getLatestSnapshot().lastTeamId;
    });

    expect(seen).toBe('just-now');
  });

  it('chains successive updates made before React renders', async () => {
    installCadence(healthy());
    await mountReady();

    await act(async () => {
      api.update((d) => ({ ...d, lastTeamId: 'first' }), 'typing');
      api.update((d) => ({ ...d, lastTeamId: `${d.lastTeamId}+second` }), 'typing');
      await api.flushPendingSave();
    });

    expect(lastSaved()?.lastTeamId).toBe('first+second');
  });

  it('never writes while the load failed and persist is blocked', async () => {
    installCadence({ ok: false, reason: 'parse', error: 'corrupt', writeGeneration: 3 });
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await waitFor(() => expect(api.ready).toBe(true));

    let accepted = true;
    await act(async () => {
      accepted = api.update((d) => ({ ...d, lastTeamId: 'must-not-persist' }), 'structural');
      await api.flushPendingSave();
    });

    expect(accepted).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('flushIfPending writes nothing when there is nothing pending', async () => {
    installCadence(healthy());
    await mountReady();

    await act(async () => {
      await api.flushIfPending();
    });

    expect(saved).toHaveLength(0);
  });

  it('flushIfPending writes the pending typing edit at once', async () => {
    installCadence(healthy());
    await mountReady();

    await act(async () => {
      api.update((d) => ({ ...d, lastTeamId: 'pending-typing' }), 'typing');
      await api.flushIfPending();
    });

    expect(saved).toHaveLength(1);
    expect(lastSaved()?.lastTeamId).toBe('pending-typing');
  });
});

describe('AppDataProvider write gates', () => {
  beforeEach(() => {
    account.user = { id: 'user-1' };
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    cleanup();
    delete (window as unknown as { cadence?: unknown }).cadence;
  });

  it('reports an edit as not applied while the workspace is still loading', async () => {
    installCadence(healthy());
    (window as unknown as { cadence: { loadDataResult: unknown } }).cadence.loadDataResult = vi.fn(
      () => new Promise(() => undefined),
    );
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );

    let accepted = true;
    await act(async () => {
      accepted = api.update((d) => ({ ...d, lastTeamId: 'too-early' }), 'typing');
      await api.flushPendingSave();
    });

    expect(accepted).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('writes nothing and rejects edits when nobody is signed in', async () => {
    account.user = null;
    installCadence(healthy());
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );

    let accepted = true;
    await act(async () => {
      accepted = api.update((d) => ({ ...d, lastTeamId: 'nobody' }), 'structural');
      await api.flushPendingSave();
      await api.flushIfPending();
    });

    expect(accepted).toBe(false);
    expect(saved).toHaveLength(0);
  });

  it('does not save an edit made while the workspace was being replaced from disk over the loaded data', async () => {
    installCadence(healthy());
    await mountReady();

    // `syncFromDisk` reads the disk twice: first the write generation, then the
    // workspace itself. Hold each read so the test controls the gap between them.
    const reads: Array<(v: Record<string, unknown>) => void> = [];
    const cadence = (window as unknown as { cadence: { loadDataResult: ReturnType<typeof vi.fn> } }).cadence;
    cadence.loadDataResult = vi.fn(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          reads.push(resolve);
        }),
    );
    const TS = '2026-01-01T00:00:00.000Z';
    const fromDisk = {
      ok: true,
      data: {
        ...normalizeData(null),
        notes: [{ id: 'disk-note', title: 'On disk', body: '', locked: false, createdAt: TS, updatedAt: TS }],
      },
      writeGeneration: 9,
    };

    let sync!: Promise<void>;
    act(() => {
      sync = api.syncFromDisk();
    });
    await waitFor(() => expect(reads).toHaveLength(1));
    reads[0]!(fromDisk);
    await waitFor(() => expect(reads).toHaveLength(2));

    // The user types while the new workspace is still being read.
    await act(async () => {
      api.update((d) => ({ ...d, lastTeamId: 'built-on-stale-snapshot' }), 'structural');
    });

    await act(async () => {
      reads[1]!(fromDisk);
      await sync;
    });
    // Longer than the structural save debounce.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    expect(api.getLatestSnapshot().notes.map((n) => n.id)).toEqual(['disk-note']);
    expect(saved.some((p) => (p as { lastTeamId?: string }).lastTeamId === 'built-on-stale-snapshot')).toBe(false);
    expect(api.hasPendingSave).toBe(false);
  });

  it('uses the synchronous flush bridge with the latest edit when the desktop app provides one', async () => {
    installCadence(healthy());
    const sync = vi.fn(() => ({ ok: true, writeGeneration: 5 }));
    (window as unknown as { cadence: { flushPendingSaveSync: unknown } }).cadence.flushPendingSaveSync = sync;
    await mountReady();
    sync.mockClear();

    const off = registerBeforeFlushHook(() => {
      api.update((d) => ({ ...d, lastTeamId: 'via-sync-bridge' }), 'typing');
    }, 'editor');
    await act(async () => {
      await api.flushPendingSave();
    });
    off();

    expect(sync).toHaveBeenCalledTimes(1);
    const [payload, uid] = sync.mock.calls[0] as unknown as [{ lastTeamId?: string }, string];
    expect(payload.lastTeamId).toBe('via-sync-bridge');
    expect(uid).toBe('user-1');
    expect(saved).toHaveLength(0);
  });

  it('keeps the latest edit in browser storage when the page is hidden', async () => {
    // No desktop bridge: the browser backend persists to localStorage.
    render(
      <AppDataProvider>
        <Probe />
      </AppDataProvider>,
    );
    await waitFor(() => expect(api.ready).toBe(true));
    await act(async () => {
      await api.flushPendingSave();
    });

    await act(async () => {
      api.update((d) => ({ ...d, lastTeamId: 'typed-before-hide' }), 'typing');
      window.dispatchEvent(new Event('pagehide'));
    });

    const raw = localStorage.getItem(`${STORAGE_PREFIX}-data-user-1`);
    expect(raw).toContain('typed-before-hide');
  });
});
