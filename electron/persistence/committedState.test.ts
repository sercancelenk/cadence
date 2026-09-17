import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);

type FileFingerprint = {
  path: string;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  ino: bigint;
};

const { captureFileFingerprints, fingerprintsUnchanged, unchangedPaths } = require(
  './committedState.cjs',
) as {
  captureFileFingerprints: (fsImpl: typeof fs, filePaths: string[]) => FileFingerprint[] | null;
  fingerprintsUnchanged: (
    fsImpl: typeof fs,
    recorded: FileFingerprint[] | null,
    currentPaths: string[],
  ) => boolean;
  unchangedPaths: (fsImpl: typeof fs, recorded: FileFingerprint[] | null) => Set<string>;
};

let dir: string;
let base: string;
let shard: string;

/** Same tmp+rename shape every workspace writer uses. */
function writeAtomically(filePath: string, contents: string) {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-committed-'));
  base = path.join(dir, 'data.json');
  shard = path.join(dir, 'data-2026-01.json');
  writeAtomically(base, '{"version":3}');
  writeAtomically(shard, '{"month":"2026-01"}');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('committedState', () => {
  it('reports unchanged when nothing touched the files', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    expect(fingerprintsUnchanged(fs, recorded, [base, shard])).toBe(true);
  });

  it('is order independent', () => {
    const recorded = captureFileFingerprints(fs, [shard, base]);
    expect(fingerprintsUnchanged(fs, recorded, [base, shard])).toBe(true);
  });

  it('detects a rewrite even when the size is identical', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    writeAtomically(base, '{"version":4}');

    expect(fingerprintsUnchanged(fs, recorded, [base, shard])).toBe(false);
  });

  it('detects an in-place edit that preserves the size', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    const fd = fs.openSync(base, 'r+');
    fs.writeSync(fd, '{"version":9}', 0, 'utf8');
    fs.closeSync(fd);

    expect(fingerprintsUnchanged(fs, recorded, [base, shard])).toBe(false);
  });

  it('detects a restored mtime, because ctime and inode still moved', () => {
    // `touch -d` style tampering must not be able to forge "unchanged".
    const recorded = captureFileFingerprints(fs, [base, shard]);
    const before = fs.statSync(base);
    writeAtomically(base, '{"version":4}');
    fs.utimesSync(base, before.atime, before.mtime);

    expect(fingerprintsUnchanged(fs, recorded, [base, shard])).toBe(false);
  });

  it('detects a new shard appearing', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    const extra = path.join(dir, 'data-2026-02.json');
    writeAtomically(extra, '{"month":"2026-02"}');

    expect(fingerprintsUnchanged(fs, recorded, [base, shard, extra])).toBe(false);
  });

  it('detects a shard disappearing', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    fs.rmSync(shard);

    expect(fingerprintsUnchanged(fs, recorded, [base])).toBe(false);
    expect(fingerprintsUnchanged(fs, recorded, [base, shard])).toBe(false);
  });

  it('captures nothing when a file is missing', () => {
    expect(captureFileFingerprints(fs, [base, path.join(dir, 'missing.json')])).toBeNull();
  });

  it('fails closed on a missing or empty record', () => {
    expect(fingerprintsUnchanged(fs, null, [base])).toBe(false);
    expect(fingerprintsUnchanged(fs, [], [base])).toBe(false);
  });

  it('fails closed when stat throws', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    const throwingFs = {
      ...fs,
      statSync: () => {
        throw new Error('EIO');
      },
    } as unknown as typeof fs;

    expect(fingerprintsUnchanged(throwingFs, recorded, [base, shard])).toBe(false);
  });

  it('unchangedPaths reports only the files that are still identical', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    writeAtomically(shard, '{"month":"2026-01","edited":true}');

    const unchanged = unchangedPaths(fs, recorded);

    expect(unchanged.has(base)).toBe(true);
    expect(unchanged.has(shard)).toBe(false);
  });

  it('unchangedPaths drops files that no longer exist', () => {
    const recorded = captureFileFingerprints(fs, [base, shard]);
    fs.rmSync(shard);

    const unchanged = unchangedPaths(fs, recorded);

    expect(unchanged.has(base)).toBe(true);
    expect(unchanged.has(shard)).toBe(false);
  });

  it('unchangedPaths returns empty for a missing record', () => {
    expect(unchangedPaths(fs, null).size).toBe(0);
  });
});
