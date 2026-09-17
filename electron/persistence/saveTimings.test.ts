import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type SaveTimingSample = {
  label: string;
  at: string;
  totalMs: number;
  stages: { stage: string; ms: number }[];
  meta?: Record<string, unknown>;
};

const {
  RING_CAPACITY,
  setSaveTimingsEnabled,
  isSaveTimingsEnabled,
  createSaveTimer,
  summarizeSaveTimings,
  readSaveTimings,
  clearSaveTimings,
} = require('./saveTimings.cjs') as {
  RING_CAPACITY: number;
  setSaveTimingsEnabled: (next: unknown) => boolean;
  isSaveTimingsEnabled: () => boolean;
  createSaveTimer: (label: string) => {
    stage: (name: string) => void;
    done: (meta?: Record<string, unknown>) => SaveTimingSample | null;
  };
  summarizeSaveTimings: () => {
    enabled: boolean;
    sampleCount: number;
    totalMs: { p50: number; p95: number; max: number };
    stages: { stage: string; p50: number; p95: number; max: number }[];
  };
  readSaveTimings: () => SaveTimingSample[];
  clearSaveTimings: () => void;
};

afterEach(() => {
  setSaveTimingsEnabled(false);
});

describe('saveTimings', () => {
  it('is disabled by default and records nothing', () => {
    expect(isSaveTimingsEnabled()).toBe(false);

    const timer = createSaveTimer('data:save');
    timer.stage('encrypt-write');
    expect(timer.done()).toBeNull();
    expect(readSaveTimings()).toEqual([]);
  });

  it('records stage durations that add up to the total', () => {
    setSaveTimingsEnabled(true);

    const timer = createSaveTimer('data:save');
    timer.stage('size-check');
    timer.stage('empty-guard');
    timer.stage('encrypt-write');
    const sample = timer.done({ notes: 12 });

    expect(sample).not.toBeNull();
    expect(sample?.label).toBe('data:save');
    expect(sample?.meta).toEqual({ notes: 12 });
    expect(sample?.stages.map((s) => s.stage)).toEqual([
      'size-check',
      'empty-guard',
      'encrypt-write',
    ]);

    const summed = (sample?.stages ?? []).reduce((acc, s) => acc + s.ms, 0);
    expect(summed).toBeLessThanOrEqual((sample?.totalMs ?? 0) + 0.05);
  });

  it('keeps only the most recent samples', () => {
    setSaveTimingsEnabled(true);

    for (let i = 0; i < RING_CAPACITY + 10; i += 1) {
      const timer = createSaveTimer(`save-${i}`);
      timer.stage('encrypt-write');
      timer.done();
    }

    const recorded = readSaveTimings();
    expect(recorded).toHaveLength(RING_CAPACITY);
    expect(recorded[recorded.length - 1]?.label).toBe(`save-${RING_CAPACITY + 9}`);
  });

  it('summarizes per stage and sorts the slowest first', () => {
    setSaveTimingsEnabled(true);

    for (let i = 0; i < 4; i += 1) {
      const timer = createSaveTimer('data:save');
      timer.stage('fast');
      // Busy-wait so the second stage is reliably slower than the first.
      const until = performance.now() + 2;
      while (performance.now() < until) {
        /* spin */
      }
      timer.stage('slow');
      timer.done();
    }

    const summary = summarizeSaveTimings();
    expect(summary.enabled).toBe(true);
    expect(summary.sampleCount).toBe(4);
    expect(summary.stages[0]?.stage).toBe('slow');
    expect(summary.stages[0]?.p95).toBeGreaterThan(summary.stages[1]?.p95 ?? 0);
    expect(summary.totalMs.max).toBeGreaterThanOrEqual(summary.totalMs.p50);
  });

  it('discards buffered samples when disabled so stale numbers cannot be read', () => {
    setSaveTimingsEnabled(true);
    createSaveTimer('data:save').done();
    expect(readSaveTimings()).toHaveLength(1);

    setSaveTimingsEnabled(false);
    expect(readSaveTimings()).toEqual([]);
    expect(summarizeSaveTimings().sampleCount).toBe(0);
  });

  it('clearSaveTimings empties the buffer without disabling', () => {
    setSaveTimingsEnabled(true);
    createSaveTimer('data:save').done();

    clearSaveTimings();

    expect(readSaveTimings()).toEqual([]);
    expect(isSaveTimingsEnabled()).toBe(true);
  });

  it('only an actual true turns recording on', () => {
    // The value arrives over IPC. Coercing would let a mistaken "false" start
    // recording when the caller asked for the opposite.
    for (const value of ['false', 'off', 0, 1, 'yes', {}, null, undefined]) {
      expect(setSaveTimingsEnabled(value)).toBe(false);
      expect(isSaveTimingsEnabled()).toBe(false);
    }
    expect(setSaveTimingsEnabled(true)).toBe(true);
  });

  /**
   * `done` is called before `finishDataSave` returns, and the stages after the
   * commit run when the workspace is already on disk. A throw from measurement
   * must never turn a save that worked into one the renderer is told failed.
   */
  it('never throws out of the save path', () => {
    setSaveTimingsEnabled(true);
    const timer = createSaveTimer('data:save');

    // Both methods read the clock, so breaking it is the one injection that
    // reaches every line either of them runs.
    const realNow = performance.now;
    performance.now = () => {
      throw new Error('clock unavailable');
    };
    try {
      expect(() => timer.stage('encrypt-write')).not.toThrow();
      expect(() => timer.done({ notes: 1 })).not.toThrow();
    } finally {
      performance.now = realNow;
    }

    // And the failure is contained: the next save still records normally.
    const next = createSaveTimer('data:save');
    next.stage('encrypt-write');
    expect(next.done()).not.toBeNull();
  });
});
