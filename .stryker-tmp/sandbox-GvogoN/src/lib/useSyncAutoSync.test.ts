/**
 * Tests for `runSyncCycle` — the core auto-sync algorithm extracted
 * from `useSyncAutoSync`. We exercise it against a fully scripted
 * `FakeBackend` that records every interaction, so every branch
 * (first-time pull, first-time seed, dirty push, clean pull, not-
 * modified, conflict, error, corrupt remote) is asserted explicitly.
 *
 * The hook itself is a thin wrapper that forwards into this function,
 * so testing this is testing the hook's correctness without touching
 * a React renderer.
 */
// @ts-nocheck


import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppData } from '../model';
import { runSyncCycle } from './useSyncAutoSync';
import { subscribeSyncEvents, type SyncEvent } from './syncEvents';
import type {
  SyncBackend,
  SyncPullOutcome,
  SyncPushOutcome,
  SyncRecord,
} from './syncBackends/types';

function makeData(label: string): AppData {
  // `version: 3` (= DATA_VERSION) keeps normalizeData on the modern
  // path and prevents the v1→v2 migration from rewriting team IDs.
  // Different `label`s produce different fingerprints under
  // computeLocalEtag, which is what the dirty-check tests need.
  return {
    version: 3,
    teams: [{ id: label, name: label, createdAt: '2026-05-19T00:00:00.000Z', status: 'active' }],
    people: [],
    items: [],
    notes: [],
    todoItems: [],
    todoGroups: [],
    notifiedReminderIds: [],
  } as unknown as AppData;
}

type Scripted = {
  pull?: SyncPullOutcome | ((priorEtag?: string) => SyncPullOutcome | Promise<SyncPullOutcome>);
  push?: SyncPushOutcome | ((data: AppData, ifMatchEtag?: string) => SyncPushOutcome | Promise<SyncPushOutcome>);
};

function makeFakeBackend(initialRecord: SyncRecord | null, script: Scripted) {
  const calls: { method: 'pull' | 'push'; etag?: string }[] = [];
  let record = initialRecord;
  const backend: SyncBackend = {
    id: 'gdrive',
    displayName: 'Fake Drive',
    e2eEncryption: true,
    async status() {
      return 'ready';
    },
    async pull(priorEtag) {
      calls.push({ method: 'pull', etag: priorEtag });
      if (!script.pull) throw new Error('pull not scripted');
      if (typeof script.pull === 'function') return script.pull(priorEtag);
      return script.pull;
    },
    async push(data: AppData, ifMatchEtag?: string) {
      calls.push({ method: 'push', etag: ifMatchEtag });
      if (!script.push) throw new Error('push not scripted');
      if (typeof script.push === 'function') return script.push(data, ifMatchEtag);
      return script.push;
    },
    getRecord() {
      return record;
    },
    setRecord(next) {
      record = next;
    },
    describe() {
      return 'fake';
    },
  };
  return {
    backend,
    calls,
    get record() {
      return record;
    },
  };
}

function captureEvents(): { events: SyncEvent[]; unsubscribe: () => void } {
  const events: SyncEvent[] = [];
  const unsubscribe = subscribeSyncEvents((e) => events.push(e));
  return { events, unsubscribe };
}

describe('runSyncCycle (first-time / no record)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('pulls a baseline when the remote has an existing snapshot', async () => {
    const fake = makeFakeBackend(null, {
      pull: { kind: 'ok', data: makeData('remote'), etag: 'rev-1' },
    });
    const { events, unsubscribe } = captureEvents();
    const applied: AppData[] = [];

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('baseline-pulled');
    expect(applied).toHaveLength(1);
    expect((applied[0].teams as unknown as { id: string }[])[0].id).toBe('remote');
    expect(fake.record?.etag).toBe('rev-1');
    expect(fake.record?.localFingerprint).toBeTruthy();
    expect(fake.record?.lastSyncedAt).toBeTruthy();
    expect(fake.calls).toEqual([{ method: 'pull', etag: undefined }]);
    expect(events.some((e) => e.kind === 'success')).toBe(true);
    unsubscribe();
  });

  it('seeds the remote when it has no snapshot yet', async () => {
    const fake = makeFakeBackend(null, {
      pull: { kind: 'no-snapshot' },
      push: { kind: 'ok', etag: 'rev-1' },
    });
    const { events, unsubscribe } = captureEvents();
    const applied: AppData[] = [];

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('baseline-seeded');
    expect(applied).toHaveLength(0); // we pushed, didn't apply remote
    expect(fake.record?.etag).toBe('rev-1');
    expect(fake.record?.localFingerprint).toBeTruthy();
    expect(fake.calls.map((c) => c.method)).toEqual(['pull', 'push']);
    expect(events.some((e) => e.kind === 'success')).toBe(true);
    unsubscribe();
  });

  it('reports an error if the first pull errors with http-error', async () => {
    const fake = makeFakeBackend(null, {
      pull: { kind: 'http-error', status: 500, message: 'oops' },
    });
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
    });

    expect(action).toBe('pull-error');
    expect(fake.record).toBeNull();
    expect(events.some((e) => e.kind === 'error')).toBe(true);
    unsubscribe();
  });

  it('refuses to overwrite local when the remote snapshot has corrupt shape', async () => {
    const fake = makeFakeBackend(null, {
      pull: { kind: 'ok', data: { not: 'valid' } as unknown as AppData, etag: 'rev-1' },
    });
    const { events, unsubscribe } = captureEvents();
    const applied: AppData[] = [];

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('corrupt-remote');
    expect(applied).toHaveLength(0);
    expect(fake.record).toBeNull();
    expect(events.find((e) => e.kind === 'error')?.code).toBe('corrupt');
    unsubscribe();
  });
});

describe('runSyncCycle (steady state — record exists)', () => {
  it('pushes when local data has changed since last sync (dirty)', async () => {
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: '"old-fingerprint"', lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { push: { kind: 'ok', etag: 'rev-2' } },
    );
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
    });

    expect(action).toBe('pushed');
    expect(fake.calls).toEqual([{ method: 'push', etag: 'rev-1' }]);
    expect(fake.record?.etag).toBe('rev-2');
    expect(fake.record?.localFingerprint).not.toBe('"old-fingerprint"');
    expect(events.some((e) => e.kind === 'error')).toBe(false);
    unsubscribe();
  });

  it('does a conditional pull when local is clean', async () => {
    // We need a fingerprint that matches the local data so the cycle
    // sees "clean". The easiest way to get one is to compute it from
    // the same `localData` we will pass in.
    const local = makeData('local');
    const { computeLocalEtag } = await import('./lanSyncClient');
    const fp = await computeLocalEtag(local);
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: fp, lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { pull: { kind: 'not-modified' } },
    );

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: local,
      applyRemote: () => {},
    });

    expect(action).toBe('not-modified');
    expect(fake.calls).toEqual([{ method: 'pull', etag: 'rev-1' }]);
    expect(fake.record?.localFingerprint).toBe(fp); // unchanged
  });

  it('applies remote when conditional pull returns new data', async () => {
    const local = makeData('local');
    const { computeLocalEtag } = await import('./lanSyncClient');
    const fp = await computeLocalEtag(local);
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: fp, lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { pull: { kind: 'ok', data: makeData('remote'), etag: 'rev-2' } },
    );
    const applied: AppData[] = [];

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: local,
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('pulled');
    expect(applied).toHaveLength(1);
    expect(fake.record?.etag).toBe('rev-2');
  });

  it('publishes a conflict error when push hits 412 / conflict', async () => {
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: '"old-fingerprint"', lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { push: { kind: 'conflict', currentEtag: 'rev-9' } },
    );
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
    });

    expect(action).toBe('push-error');
    // Record is NOT updated on conflict — the user resolves explicitly.
    expect(fake.record?.etag).toBe('rev-1');
    expect(events.find((e) => e.kind === 'error')?.code).toBe('conflict');
    unsubscribe();
  });

  it('publishes auth-required when push reports auth-required', async () => {
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: '"old-fingerprint"', lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { push: { kind: 'auth-required' } },
    );
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
    });

    expect(action).toBe('push-error');
    expect(events.find((e) => e.kind === 'error')?.code).toBe('auth-required');
    unsubscribe();
  });

  it('refuses to apply corrupt remote on a conditional pull', async () => {
    const local = makeData('local');
    const { computeLocalEtag } = await import('./lanSyncClient');
    const fp = await computeLocalEtag(local);
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: fp, lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { pull: { kind: 'ok', data: 42 as unknown as AppData, etag: 'rev-2' } },
    );
    const applied: AppData[] = [];

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: local,
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('corrupt-remote');
    expect(applied).toHaveLength(0);
    expect(fake.record?.etag).toBe('rev-1'); // unchanged
  });

  it('skips pull when local fingerprint changes during apply guard', async () => {
    const local = makeData('local');
    const { computeLocalEtag } = await import('./lanSyncClient');
    const fp = await computeLocalEtag(local);
    let current = local;
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: fp, lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { pull: { kind: 'ok', data: makeData('remote'), etag: 'rev-2' } },
    );
    const applied: AppData[] = [];
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: local,
      getLocalData: () => current,
      flushLocal: async () => {
        current = makeData('local-edited');
      },
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('local-changed-during-pull');
    expect(applied).toHaveLength(0);
    expect(fake.record?.etag).toBe('rev-1');
    expect(events.some((e) => e.code === 'local-edits')).toBe(true);
    unsubscribe();
  });
});

describe('runSyncCycle (additional branches)', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports push-error when baseline seed push fails', async () => {
    const fake = makeFakeBackend(null, {
      pull: { kind: 'no-snapshot' },
      push: { kind: 'http-error', status: 500, message: 'fail' },
    });
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
    });

    expect(action).toBe('push-error');
    expect(fake.record).toBeNull();
    expect(events.some((e) => e.kind === 'error')).toBe(true);
    unsubscribe();
  });

  it('reports pull-error on steady-state conditional pull failure', async () => {
    const local = makeData('local');
    const { computeLocalEtag } = await import('./lanSyncClient');
    const fp = await computeLocalEtag(local);
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: fp, lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { pull: { kind: 'network-error', message: 'offline' } },
    );
    const { events, unsubscribe } = captureEvents();

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: local,
      applyRemote: () => {},
    });

    expect(action).toBe('pull-error');
    expect(events.some((e) => e.kind === 'error')).toBe(true);
    unsubscribe();
  });

  it('skips baseline apply when local edits appear during first pull', async () => {
    const fake = makeFakeBackend(null, {
      pull: { kind: 'ok', data: makeData('remote'), etag: 'rev-1' },
    });
    let current = makeData('local');
    const applied: AppData[] = [];

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: current,
      getLocalData: () => current,
      flushLocal: async () => {
        current = makeData('local-edited');
      },
      applyRemote: (d) => applied.push(d),
    });

    expect(action).toBe('local-changed-during-pull');
    expect(applied).toHaveLength(0);
    expect(fake.record).toBeNull();
  });

  it('syncs LAN attachments after a successful push on lan backend', async () => {
    const syncSpy = vi.spyOn(await import('./lanAttachmentSync'), 'syncLanAttachments');
    const lanBackend: SyncBackend = {
      id: 'lan',
      displayName: 'LAN',
      e2eEncryption: false,
      async status() {
        return 'ready';
      },
      async pull() {
        return { kind: 'not-modified' };
      },
      async push() {
        return { kind: 'ok', etag: 'rev-2' };
      },
      getRecord() {
        return { etag: 'rev-1', localFingerprint: '"old-fingerprint"', lastSyncedAt: '2026-05-19T00:00:00.000Z' };
      },
      setRecord() {},
      describe() {
        return 'lan';
      },
    };

    const local = makeData('local');
    await runSyncCycle({
      backend: lanBackend,
      localData: local,
      applyRemote: () => {},
      userId: 'user-1',
    });

    expect(syncSpy).toHaveBeenCalledWith(local, 'user-1');
    syncSpy.mockRestore();
  });

  it('does not sync LAN attachments for gdrive backend', async () => {
    const syncSpy = vi.spyOn(await import('./lanAttachmentSync'), 'syncLanAttachments');
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: '"old-fingerprint"', lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { push: { kind: 'ok', etag: 'rev-2' } },
    );

    await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
      userId: 'user-1',
    });

    expect(syncSpy).not.toHaveBeenCalled();
    syncSpy.mockRestore();
  });

  it('continues when computeLocalEtag throws (safe fingerprint fallback)', async () => {
    vi.spyOn(await import('./lanSyncClient'), 'computeLocalEtag').mockRejectedValue(new Error('no crypto'));
    const fake = makeFakeBackend(
      { etag: 'rev-1', localFingerprint: 'fp-old', lastSyncedAt: '2026-05-19T00:00:00.000Z' },
      { pull: { kind: 'not-modified' } },
    );

    const action = await runSyncCycle({
      backend: fake.backend,
      localData: makeData('local'),
      applyRemote: () => {},
    });

    expect(action).toBe('not-modified');
    vi.restoreAllMocks();
  });
});
