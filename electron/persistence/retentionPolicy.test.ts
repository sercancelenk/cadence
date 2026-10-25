import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_MIRROR_KEEP,
  DEFAULT_ROUTINE_KEEP,
  normalizeMirrorKeep,
  normalizeRoutineKeep,
  planMirrorPrune,
  planSnapshotPrune,
  snapshotSetLabel,
  snapshotTier,
} = require('./retentionPolicy.cjs');

const ts = (n: number) => `2026-05-${String(n).padStart(2, '0')}T10-00-00-000Z`;
const set = (label: string, day: number) => ({ key: `data-${label}-${ts(day)}`, mtime: day });

describe('snapshotSetLabel / snapshotTier', () => {
  it('reads the label and splits routine from restore points', () => {
    expect(snapshotSetLabel(`data-pre-save-${ts(1)}`)).toBe('pre-save');
    expect(snapshotSetLabel(`data-pre-monthly-layout-${ts(1)}`)).toBe('pre-monthly-layout');
    expect(snapshotSetLabel('data-2026-05-01T10-00-00-000Z')).toBeNull();
    for (const l of ['pre-save', 'launch', 'post-login', 'pre-write']) {
      expect(snapshotTier(`data-${l}-${ts(1)}`)).toBe('routine');
    }
    for (const l of ['pre-import', 'pre-restore', 'pre-pwchange', 'pre-recovery', 'pre-something-new']) {
      expect(snapshotTier(`data-${l}-${ts(1)}`)).toBe('lifecycle');
    }
  });

  it('treats an unlabelled very old set as routine', () => {
    expect(snapshotTier('data-2026-05-01T10-00-00-000Z')).toBe('routine');
  });
});

describe('normalize*Keep', () => {
  it('accepts only the offered choices and falls back to the long-standing sizes', () => {
    expect(normalizeRoutineKeep(30)).toBe(30);
    expect(normalizeRoutineKeep(7)).toBe(DEFAULT_ROUTINE_KEEP);
    expect(normalizeRoutineKeep('30')).toBe(DEFAULT_ROUTINE_KEEP);
    expect(normalizeRoutineKeep(undefined)).toBe(DEFAULT_ROUTINE_KEEP);
    expect(normalizeMirrorKeep(7)).toBe(7);
    expect(normalizeMirrorKeep(2)).toBe(2);
    expect(normalizeMirrorKeep(0)).toBe(DEFAULT_MIRROR_KEEP);
    expect(normalizeMirrorKeep(null)).toBe(DEFAULT_MIRROR_KEEP);
  });
});

describe('planSnapshotPrune', () => {
  it('never lets routine sets push out a restore point', () => {
    const routine = Array.from({ length: 28 }, (_, i) => set('pre-save', i + 2));
    const sets = [set('pre-import', 1), ...routine];
    const { remove } = planSnapshotPrune(sets, { routineKeep: 10 });
    expect(remove).toHaveLength(18);
    expect(remove).not.toContain(`data-pre-import-${ts(1)}`);
  });

  it('keeps the newest N routine sets and removes the oldest first', () => {
    const sets = Array.from({ length: 12 }, (_, i) => set('launch', i + 1));
    const { remove } = planSnapshotPrune(sets, { routineKeep: 10 });
    expect(remove).toEqual([`data-launch-${ts(1)}`, `data-launch-${ts(2)}`]);
  });

  it('caps restore points with their own quota, oldest first', () => {
    const sets = Array.from({ length: 5 }, (_, i) => set('pre-restore', i + 1));
    const { remove } = planSnapshotPrune(sets, { routineKeep: 50, lifecycleKeep: 3 });
    expect(remove).toEqual([`data-pre-restore-${ts(1)}`, `data-pre-restore-${ts(2)}`]);
  });

  it('upgrade safety: any ring the old build could have left (at most 50 sets, any labels) loses nothing', () => {
    const labels = ['pre-save', 'launch', 'post-login', 'pre-import', 'pre-restore', 'pre-pwchange', 'pre-recovery', 'pre-monthly-layout', 'pre-future-thing'];
    for (const label of labels) {
      const onlyThisLabel = Array.from({ length: 50 }, (_, i) => set(label, (i % 28) + 1)).map((x, i) => ({ ...x, key: `${x.key}-${i}`, mtime: i }));
      expect(planSnapshotPrune(onlyThisLabel).remove, label).toEqual([]);
    }
    const mixed = Array.from({ length: 50 }, (_, i) => ({ key: `data-${labels[i % labels.length]}-${ts((i % 28) + 1)}`, mtime: i }));
    expect(planSnapshotPrune(mixed).remove).toEqual([]);
  });

  it('never removes a protected set, even when it is the oldest beyond the limit', () => {
    const sets = Array.from({ length: 12 }, (_, i) => set('pre-save', i + 1));
    const { remove } = planSnapshotPrune(sets, { routineKeep: 10, protect: [`data-pre-save-${ts(1)}`] });
    expect(remove).toEqual([`data-pre-save-${ts(2)}`]);
  });

  it('removes nothing when under both limits, and for an empty listing', () => {
    expect(planSnapshotPrune([set('pre-save', 1), set('pre-import', 2)]).remove).toEqual([]);
    expect(planSnapshotPrune([]).remove).toEqual([]);
  });

  it('falls back to 50 for a value that is not an offered choice', () => {
    const sets = Array.from({ length: 51 }, (_, i) => set('pre-save', i + 1));
    expect(planSnapshotPrune(sets, { routineKeep: 3 }).remove).toEqual([`data-pre-save-${ts(1)}`]);
  });

  it('is deterministic when modification times tie, and never removes the newest', () => {
    const sets = ['a', 'b', 'c'].map((x) => ({ key: `data-launch-${ts(1)}-${x}`, mtime: 5 }));
    const first = planSnapshotPrune(sets, { routineKeep: 10, lifecycleKeep: 1 });
    expect(first).toEqual(planSnapshotPrune([...sets].reverse(), { routineKeep: 10, lifecycleKeep: 1 }));
    const many = Array.from({ length: 11 }, () => 0).map((_, i) => ({ key: `data-launch-${ts(1)}-${i}`, mtime: 5 }));
    expect(planSnapshotPrune(many, { routineKeep: 10 }).remove).toHaveLength(1);
  });
});

describe('planMirrorPrune', () => {
  const folder = (day: number, complete = true) => ({
    name: `cadence-daily-aaaaaaaa-2026-05-${String(day).padStart(2, '0')}`,
    dateKey: `2026-05-${String(day).padStart(2, '0')}`,
    complete,
  });

  it('keeps the newest N complete folders and removes the older ones oldest first', () => {
    const folders = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => folder(d));
    const { remove } = planMirrorPrune(folders, 7);
    expect(remove).toEqual([folder(1).name, folder(2).name, folder(3).name]);
  });

  it('counts calendar gaps as nothing: 3 complete folders stay 3 even if a week apart', () => {
    const folders = [folder(1), folder(8), folder(20)];
    expect(planMirrorPrune(folders, 3).remove).toEqual([]);
  });

  it('ignores incomplete folders: they neither take a place nor get removed', () => {
    const folders = [folder(1), folder(2), folder(3, false), folder(4, false), folder(5)];
    const { remove } = planMirrorPrune(folders, 3);
    expect(remove).toEqual([]);
    const two = planMirrorPrune(folders, 3);
    expect(two.remove).not.toContain(folder(3).name);
  });

  it('with a single complete folder and the smallest setting removes nothing', () => {
    expect(planMirrorPrune([folder(9), folder(8, false)], 3).remove).toEqual([]);
    expect(planMirrorPrune([], 3).remove).toEqual([]);
  });

  it('falls back to 30 for a value that is not an offered choice', () => {
    const folders = Array.from({ length: 31 }, (_, i) => ({
      name: `f${i}`,
      dateKey: `2026-05-${String(i + 1).padStart(2, '0')}`,
      complete: true,
    }));
    expect(planMirrorPrune(folders, 5).remove).toEqual(['f0']);
  });
});
