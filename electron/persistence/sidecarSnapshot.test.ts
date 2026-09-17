import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { linkOrCopyFileSync, cloneTreeSync } = require('./sidecarSnapshot.cjs') as {
  linkOrCopyFileSync: (fsImpl: typeof fs, src: string, dest: string) => 'link' | 'copy';
  cloneTreeSync: (
    fsImpl: typeof fs,
    pathImpl: typeof path,
    srcDir: string,
    destDir: string,
  ) => { files: number; linked: number; copied: number };
};

let root: string;
let live: string;
let backup: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-sidecar-'));
  live = path.join(root, 'attachments');
  backup = path.join(root, 'backups', 'snapshot-1');
  fs.mkdirSync(live, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** Mirrors how attachments and note revisions are actually written. */
function writeAtomically(filePath: string, contents: Buffer | string) {
  const tmp = `${filePath}.tmp`;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, filePath);
}

describe('sidecarSnapshot', () => {
  it('hardlinks a file instead of copying its bytes', () => {
    const src = path.join(live, 'a.cadenc');
    const dest = path.join(backup, 'a.cadenc');
    writeAtomically(src, crypto.randomBytes(1024));
    fs.mkdirSync(backup, { recursive: true });

    expect(linkOrCopyFileSync(fs, src, dest)).toBe('link');
    expect(fs.statSync(dest).ino).toBe(fs.statSync(src).ino);
    expect(fs.readFileSync(dest).equals(fs.readFileSync(src))).toBe(true);
  });

  it('falls back to a copy when the filesystem refuses to link', () => {
    const src = path.join(live, 'a.cadenc');
    const dest = path.join(backup, 'a.cadenc');
    const bytes = crypto.randomBytes(512);
    writeAtomically(src, bytes);
    fs.mkdirSync(backup, { recursive: true });

    const noLinkFs = {
      ...fs,
      linkSync: () => {
        const err = new Error('EXDEV: cross-device link not permitted');
        (err as NodeJS.ErrnoException).code = 'EXDEV';
        throw err;
      },
    } as unknown as typeof fs;

    expect(linkOrCopyFileSync(noLinkFs, src, dest)).toBe('copy');
    expect(fs.readFileSync(dest).equals(bytes)).toBe(true);
    expect(fs.statSync(dest).ino).not.toBe(fs.statSync(src).ino);
  });

  it('replaces an existing destination entry', () => {
    const src = path.join(live, 'a.cadenc');
    const dest = path.join(backup, 'a.cadenc');
    writeAtomically(src, 'new bytes');
    writeAtomically(dest, 'stale bytes');

    expect(linkOrCopyFileSync(fs, src, dest)).toBe('link');
    expect(fs.readFileSync(dest, 'utf8')).toBe('new bytes');
  });

  it('clones a nested tree and reports what it linked', () => {
    writeAtomically(path.join(live, 'note-a', 'index.json'), '{"v":1}');
    writeAtomically(path.join(live, 'note-a', 'rev', 'r1.json'), '{"id":"r1"}');
    writeAtomically(path.join(live, 'note-b', 'index.json'), '{"v":1}');

    const stats = cloneTreeSync(fs, path, live, backup);

    expect(stats).toEqual({ files: 3, linked: 3, copied: 0 });
    expect(fs.readFileSync(path.join(backup, 'note-a', 'rev', 'r1.json'), 'utf8')).toBe(
      '{"id":"r1"}',
    );
    expect(fs.readFileSync(path.join(backup, 'note-b', 'index.json'), 'utf8')).toBe('{"v":1}');
  });

  it('keeps the snapshot byte-identical after the live file is replaced', () => {
    // The invariant the whole optimisation rests on: writers rename a new file
    // over the old one, so a hardlink cannot observe the later content.
    const src = path.join(live, 'note-a', 'index.json');
    writeAtomically(src, 'original');
    cloneTreeSync(fs, path, live, backup);

    writeAtomically(src, 'edited later');

    expect(fs.readFileSync(path.join(backup, 'note-a', 'index.json'), 'utf8')).toBe('original');
    expect(fs.readFileSync(src, 'utf8')).toBe('edited later');
  });

  it('keeps the snapshot readable after the live file is deleted', () => {
    // Attachment GC and backup pruning unlink files; a hardlink keeps the
    // content alive until the last reference is gone.
    const src = path.join(live, 'a.cadenc');
    const bytes = crypto.randomBytes(256);
    writeAtomically(src, bytes);
    cloneTreeSync(fs, path, live, backup);

    fs.rmSync(src);

    expect(fs.readFileSync(path.join(backup, 'a.cadenc')).equals(bytes)).toBe(true);
  });

  it('leaves the live tree untouched when a snapshot is pruned', () => {
    const src = path.join(live, 'a.cadenc');
    writeAtomically(src, 'live content');
    cloneTreeSync(fs, path, live, backup);

    fs.rmSync(path.dirname(backup), { recursive: true, force: true });

    expect(fs.readFileSync(src, 'utf8')).toBe('live content');
  });

  it('restores byte-identical content from a hardlinked snapshot', () => {
    const bytes = crypto.randomBytes(4096);
    writeAtomically(path.join(live, 'a.cadenc'), bytes);
    cloneTreeSync(fs, path, live, backup);

    // Restore is a real copy back into the live tree.
    const restored = path.join(root, 'restored');
    fs.mkdirSync(restored, { recursive: true });
    for (const name of fs.readdirSync(backup)) {
      fs.copyFileSync(path.join(backup, name), path.join(restored, name));
    }

    expect(fs.readFileSync(path.join(restored, 'a.cadenc')).equals(bytes)).toBe(true);
  });

  it('skips symlinks rather than following them out of the tree', () => {
    writeAtomically(path.join(root, 'outside.txt'), 'secret');
    writeAtomically(path.join(live, 'real.json'), '{}');
    fs.symlinkSync(path.join(root, 'outside.txt'), path.join(live, 'escape.txt'));

    const stats = cloneTreeSync(fs, path, live, backup);

    expect(stats.files).toBe(1);
    expect(fs.existsSync(path.join(backup, 'escape.txt'))).toBe(false);
  });
});
