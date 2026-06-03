import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describePullOutcomeForLog,
  describePushOutcomeForLog,
  getLastSyncEvent,
  publishSyncEvent,
  subscribeSyncEvents,
  type SyncEvent,
} from './syncEvents';
import type { SyncPullOutcome, SyncPushOutcome } from './syncBackends/types';

describe('syncEvents pub-sub', () => {
  beforeEach(() => {
    publishSyncEvent({ kind: 'info', backendId: null, text: 'reset' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stores and returns the last published event', () => {
    publishSyncEvent({ kind: 'success', backendId: 'gdrive', text: 'Synced' });
    const last = getLastSyncEvent();
    expect(last?.text).toBe('Synced');
    expect(last?.backendId).toBe('gdrive');
    expect(last?.at).toBeTypeOf('number');
  });

  it('notifies subscribers via CustomEvent', () => {
    const received: SyncEvent[] = [];
    const unsub = subscribeSyncEvents((e) => received.push(e));
    publishSyncEvent({ kind: 'error', backendId: 'lan', text: 'Failed', code: 'timeout' });
    unsub();
    expect(received).toHaveLength(1);
    expect(received[0].code).toBe('timeout');
  });
});

describe('describePullOutcomeForLog', () => {
  const cases: { outcome: SyncPullOutcome; kind: string; code?: string }[] = [
    { outcome: { kind: 'ok', data: {} }, kind: 'success' },
    { outcome: { kind: 'not-modified' }, kind: 'success' },
    { outcome: { kind: 'no-snapshot' }, kind: 'info' },
    { outcome: { kind: 'auth-required' }, kind: 'error', code: 'auth-required' },
    { outcome: { kind: 'wrong-password' }, kind: 'error', code: 'wrong-password' },
    { outcome: { kind: 'unsupported-version', version: 99 }, kind: 'error', code: 'unsupported-version' },
    { outcome: { kind: 'mixed-content' }, kind: 'error', code: 'mixed-content' },
    { outcome: { kind: 'timeout' }, kind: 'error', code: 'timeout' },
    { outcome: { kind: 'http-error', status: 503, message: 'busy' }, kind: 'error', code: 'http-error' },
    { outcome: { kind: 'network-error', message: 'offline' }, kind: 'error', code: 'network-error' },
  ];

  it.each(cases)('maps $outcome.kind', ({ outcome, kind, code }) => {
    const described = describePullOutcomeForLog(outcome);
    expect(described.kind).toBe(kind);
    if (code) expect(described.code).toBe(code);
    expect(described.text.length).toBeGreaterThan(5);
  });
});

describe('describePushOutcomeForLog', () => {
  const cases: { outcome: SyncPushOutcome; kind: string; code?: string }[] = [
    { outcome: { kind: 'ok' }, kind: 'success' },
    { outcome: { kind: 'conflict' }, kind: 'error', code: 'conflict' },
    { outcome: { kind: 'auth-required' }, kind: 'error', code: 'auth-required' },
    { outcome: { kind: 'too-large' }, kind: 'error', code: 'too-large' },
    { outcome: { kind: 'mixed-content' }, kind: 'error', code: 'mixed-content' },
    { outcome: { kind: 'timeout' }, kind: 'error', code: 'timeout' },
    { outcome: { kind: 'http-error', status: 500 }, kind: 'error', code: 'http-error' },
    { outcome: { kind: 'network-error', message: 'reset' }, kind: 'error', code: 'network-error' },
  ];

  it.each(cases)('maps $outcome.kind', ({ outcome, kind, code }) => {
    const described = describePushOutcomeForLog(outcome);
    expect(described.kind).toBe(kind);
    if (code) expect(described.code).toBe(code);
    expect(described.text.length).toBeGreaterThan(5);
  });
});
