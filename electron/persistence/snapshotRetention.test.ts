import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  listSnapshotSets,
  planSnapshotTrim,
  pruneSnapshotDir,
  readSnapshotPrefs,
  writeSnapshotPrefs,
  sidecarNames,
} = require('./snapshotRetention.cjs');

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-snap-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const ts = (n: number) => `2026-05-${String(n).padStart(2, '0')}T10-00-00-000Z`;
const keyOf = (label: string, n: number) => `data-${label}-${ts(n)}`;
/** Files and folders of one set: `data-…` files plus the `attachments-…` / `note-history-…` folders. */
const partsOf = (all: string[], label: string, n: number) => all.filter((f) => f.includes(`${label}-${ts(n)}`));

/** One snapshot set with a shard sibling and both sidecar folders. */
function makeSet(label: string, n: number) {
  const key = keyOf(label, n);
  fs.writeFileSync(path.join(dir, `${key}.json`), '{}');
  fs.writeFileSync(path.join(dir, `${key}-shard-2026-05.json`), '{}');
  for (const name of sidecarNames(key)) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'x.bin'), 'x');
  }
  const when = new Date(2026, 4, n);
  for (const f of fs.readdirSync(dir).filter((x) => x.startsWith(key))) fs.utimesSync(path.join(dir, f), when, when);
}
const names = () => fs.readdirSync(dir).sort();

describe('listSnapshotSets', () => {
  it('groups a base file with its shard files and ignores everything else', () => {
    makeSet('pre-save', 1);
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    const { sets, skipped } = listSnapshotSets({ fs, path, dir });
    expect(sets).toHaveLength(1);
    expect(sets[0].files).toHaveLength(2);
    expect(skipped).toBe(0);
    expect(listSnapshotSets({ fs, path, dir: path.join(dir, 'missing') })).toEqual({ sets: [], skipped: 0 });
  });
});

describe('pruneSnapshotDir', () => {
  it('removes the oldest routine sets with their shards and sidecars, keeps restore points', () => {
    makeSet('pre-import', 1);
    for (let n = 2; n <= 13; n += 1) makeSet('pre-save', n);

    expect(pruneSnapshotDir({ fs, path, dir, limits: { routineKeep: 10 } })).toBe(2);

    const left = names();
    expect(partsOf(left, 'pre-save', 2)).toEqual([]);
    expect(partsOf(left, 'pre-save', 3)).toEqual([]);
    expect(partsOf(left, 'pre-save', 4)).toHaveLength(4);
    expect(partsOf(left, 'pre-import', 1)).toHaveLength(4);
  });

  it('drops sidecar folders no kept set owns, but never a kept set’s own', () => {
    makeSet('launch', 5);
    fs.mkdirSync(path.join(dir, 'attachments-launch-2026-01-01T00-00-00-000Z'));
    fs.mkdirSync(path.join(dir, 'note-history-pre-save-2026-01-02T00-00-00-000Z'));
    fs.mkdirSync(path.join(dir, 'unrelated'));

    expect(pruneSnapshotDir({ fs, path, dir })).toBe(0);

    expect(names()).toEqual(
      names().filter((f) => !f.endsWith('01T00-00-00-000Z') && !f.endsWith('02T00-00-00-000Z')),
    );
    expect(fs.existsSync(path.join(dir, 'unrelated'))).toBe(true);
    expect(fs.existsSync(path.join(dir, sidecarNames(keyOf('launch', 5))[0]))).toBe(true);
  });

  it('leaves the protected set and its sidecars alone', () => {
    for (let n = 1; n <= 12; n += 1) makeSet('pre-save', n);
    const removed = pruneSnapshotDir({ fs, path, dir, limits: { routineKeep: 10, protect: [keyOf('pre-save', 1)] } });
    expect(removed).toBe(1);
    expect(partsOf(names(), 'pre-save', 1)).toHaveLength(4);
    expect(partsOf(names(), 'pre-save', 2)).toEqual([]);
  });

  it('does not sweep sidecars when a snapshot file could not be read (they may belong to it)', () => {
    makeSet('launch', 5);
    makeSet('launch', 6);
    const unreadable = path.join(dir, keyOf('launch', 5));
    const flaky = { ...fs, statSync: (p: string) => (p.startsWith(unreadable) ? failStat() : fs.statSync(p)) };
    function failStat(): never {
      throw new Error('EIO');
    }

    pruneSnapshotDir({ fs: flaky, path, dir });

    for (const sidecar of sidecarNames(keyOf('launch', 5))) expect(fs.existsSync(path.join(dir, sidecar))).toBe(true);
  });

  it('does nothing, and does not throw, when the backups folder does not exist yet', () => {
    expect(pruneSnapshotDir({ fs, path, dir: path.join(dir, 'missing') })).toBe(0);
  });

  it('keeps everything while under the limits', () => {
    for (let n = 1; n <= 5; n += 1) makeSet('pre-save', n);
    const before = names();
    expect(pruneSnapshotDir({ fs, path, dir })).toBe(0);
    expect(names()).toEqual(before);
  });
});

describe('planSnapshotTrim', () => {
  it('reports what a smaller limit would delete and deletes nothing', () => {
    for (let n = 1; n <= 12; n += 1) makeSet('launch', n);
    const before = names();
    expect(planSnapshotTrim({ fs, path, dir, limits: { routineKeep: 10 } })).toEqual([
      keyOf('launch', 1),
      keyOf('launch', 2),
    ]);
    expect(names()).toEqual(before);
  });
});

describe('snapshot prefs', () => {
  const deps = () => ({
    fs,
    path,
    userDataDir: dir,
    filePrefix: 'cadence',
    userId: 'u-1',
    writeJsonText: (f: string, t: string) => {
      fs.writeFileSync(f, t);
      return { ok: true as const };
    },
  });

  it('defaults to the long-standing 50 when there is no file or it is unreadable', () => {
    expect(readSnapshotPrefs(deps()).routineKeep).toBe(50);
    fs.writeFileSync(path.join(dir, 'cadence-snapshot-retention-u-1.json'), '{ nope');
    expect(readSnapshotPrefs(deps()).routineKeep).toBe(50);
  });

  it('round-trips an offered choice and rejects anything else', () => {
    writeSnapshotPrefs(deps(), { routineKeep: 20 });
    expect(readSnapshotPrefs(deps()).routineKeep).toBe(20);
    writeSnapshotPrefs(deps(), { routineKeep: 3 });
    expect(readSnapshotPrefs(deps()).routineKeep).toBe(50);
  });

  it('keeps accounts apart', () => {
    writeSnapshotPrefs(deps(), { routineKeep: 10 });
    expect(readSnapshotPrefs({ ...deps(), userId: 'u-2' }).routineKeep).toBe(50);
  });
});
