import { describe, expect, it } from 'vitest';
import {
  decidePendingExternalFlush,
  shouldClearPendingOnPropsEcho,
} from './richTextExternalSync';

describe('decidePendingExternalFlush', () => {
  const base = {
    hasPending: true,
    hasFocus: false,
    hasPendingTimer: false,
    incomingSig: 'remote',
    liveSig: 'local',
    lastEmittedSig: 'local',
    queuedAtLocalGen: 3,
    localEditGen: 3,
  };

  it('waits while focused, debounce-pending, or nothing queued', () => {
    expect(
      decidePendingExternalFlush({ ...base, hasFocus: true }).action,
    ).toBe('wait');
    expect(
      decidePendingExternalFlush({ ...base, hasPendingTimer: true }).action,
    ).toBe('wait');
    expect(
      decidePendingExternalFlush({ ...base, hasPending: false }).action,
    ).toBe('wait');
  });

  it('acks when external already matches live or emitted', () => {
    expect(
      decidePendingExternalFlush({
        ...base,
        incomingSig: 'local',
        liveSig: 'local',
      }).action,
    ).toBe('ack');
    expect(
      decidePendingExternalFlush({
        ...base,
        incomingSig: 'emitted',
        lastEmittedSig: 'emitted',
        liveSig: 'other',
      }).action,
    ).toBe('ack');
  });

  it('drops stale external queued before a newer local emit (no silent revert)', () => {
    expect(
      decidePendingExternalFlush({
        ...base,
        queuedAtLocalGen: 3,
        localEditGen: 4,
      }).action,
    ).toBe('drop-stale');
  });

  it('applies when no local emit happened after queue (restore/sync while idle-focused)', () => {
    expect(decidePendingExternalFlush(base).action).toBe('apply');
  });
});

describe('shouldClearPendingOnPropsEcho', () => {
  it('keeps a diverging queued sync when parent merely echoes local edits', () => {
    expect(
      shouldClearPendingOnPropsEcho({
        hasPending: true,
        pendingSig: 'remote',
        incomingSig: 'local',
        liveSig: 'local',
        queuedAtLocalGen: 5,
        localEditGen: 5,
      }),
    ).toBe(false);
  });

  it('clears pending that matches the echo or is stale vs local gen', () => {
    expect(
      shouldClearPendingOnPropsEcho({
        hasPending: true,
        pendingSig: 'local',
        incomingSig: 'local',
        liveSig: 'local',
        queuedAtLocalGen: 5,
        localEditGen: 5,
      }),
    ).toBe(true);
    expect(
      shouldClearPendingOnPropsEcho({
        hasPending: true,
        pendingSig: 'live-match',
        incomingSig: 'other',
        liveSig: 'live-match',
        queuedAtLocalGen: 5,
        localEditGen: 5,
      }),
    ).toBe(true);
    expect(
      shouldClearPendingOnPropsEcho({
        hasPending: true,
        pendingSig: 'remote',
        incomingSig: 'local',
        liveSig: 'local',
        queuedAtLocalGen: 4,
        localEditGen: 5,
      }),
    ).toBe(true);
  });

  it('does nothing when there is no pending external', () => {
    expect(
      shouldClearPendingOnPropsEcho({
        hasPending: false,
        pendingSig: 'remote',
        incomingSig: 'local',
        liveSig: 'local',
        queuedAtLocalGen: 1,
        localEditGen: 1,
      }),
    ).toBe(false);
  });
});
