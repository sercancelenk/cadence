import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { sweepStaleScratch } = require('./backupArchive.cjs') as {
  sweepStaleScratch: (root: string, now?: number) => Promise<number>;
};

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-sweep-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('sweepStaleScratch', () => {
  it('removes old scratch folders and leaves recent ones and everything else', async () => {
    const old = path.join(root, 'tmp-backup-1-100');
    const fresh = path.join(root, 'tmp-backup-import-2-200');
    const other = path.join(root, 'attachments');
    for (const d of [old, fresh, other]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(old, 'x'), 'x');
    const longAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    fs.utimesSync(old, longAgo, longAgo);
    fs.writeFileSync(path.join(root, 'tmp-backup-file'), 'not a folder');

    expect(await sweepStaleScratch(root)).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(fresh)).toBe(true);
    expect(fs.existsSync(other)).toBe(true);
    expect(fs.existsSync(path.join(root, 'tmp-backup-file'))).toBe(true);
  });

  it('does not fail when the folder is missing', async () => {
    expect(await sweepStaleScratch(path.join(root, 'nope'))).toBe(0);
  });
});

const { applyArchiveSidecars, inspectBackupFile } = require('./backupArchive.cjs') as {
  applyArchiveSidecars: (d: {
    filePath: string;
    tmpRoot: string;
    expectFile?: { size: number; mtimeMs: number };
    importImage: (id: string, bytes: Buffer) => 'restored' | 'skipped';
    mergeHistory: (src: string) => { incomplete: boolean };
  }) => Promise<{ attachmentsRestored: number; attachmentsSkipped: number; attachmentsFailed: number; historyIncomplete: boolean }>;
  inspectBackupFile: (d: { filePath: string; summarize: (w: object) => object | null; maxDataJsonBytes?: number }) => Promise<{ ok: boolean; error?: string }>;
};
const { createZipWriter } = require('./persistence/zipWriter.cjs') as {
  createZipWriter: (f: string) => Promise<{ add: (n: string, b: Buffer) => Promise<void>; finish: () => Promise<unknown> }>;
};

describe('applying the images and history of a ZIP', () => {
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

  async function zipWith(entries: Record<string, Buffer>) {
    const file = path.join(root, 'b.zip');
    const w = await createZipWriter(file);
    for (const [name, data] of Object.entries(entries)) await w.add(name, data);
    await w.finish();
    return file;
  }
  const deps = (file: string, over: Record<string, unknown> = {}) => {
    const imported: string[] = [];
    const merged: string[][] = [];
    return {
      imported,
      merged,
      d: {
        filePath: file,
        tmpRoot: root,
        importImage: (id: string) => {
          imported.push(id);
          return 'restored' as const;
        },
        mergeHistory: (src: string) => {
          merged.push(fs.readdirSync(src).sort());
          return { incomplete: false };
        },
        ...over,
      },
    };
  };

  it('does nothing, and says the import is incomplete, when the file is not the one that was opened', async () => {
    const file = await zipWith({ 'data.json': Buffer.from('{}'), 'attachments/aaaaaaaa.bin': PNG });
    const st = fs.statSync(file);
    const { d, imported } = deps(file, { expectFile: { size: st.size + 1, mtimeMs: st.mtimeMs } });
    const r = await applyArchiveSidecars(d);
    expect(imported).toEqual([]);
    expect(r.historyIncomplete).toBe(true);
    expect(r.attachmentsFailed).toBeGreaterThan(0);
  });

  it('works when the file is the one that was opened', async () => {
    const file = await zipWith({ 'data.json': Buffer.from('{}'), 'attachments/aaaaaaaa.bin': PNG });
    const st = fs.statSync(file);
    const { d, imported } = deps(file, { expectFile: { size: st.size, mtimeMs: st.mtimeMs } });
    const r = await applyArchiveSidecars(d);
    expect(imported).toEqual(['aaaaaaaa']);
    expect(r).toMatchObject({ attachmentsRestored: 1, attachmentsFailed: 0, historyIncomplete: false });
  });

  it('does not let two note folders that differ only by case overwrite each other, and says so', async () => {
    const file = await zipWith({
      'data.json': Buffer.from('{}'),
      'note-history/AAAAAAAA/index.json': Buffer.from('{"a":1}'),
      'note-history/aaaaaaaa/index.json': Buffer.from('{"a":2}'),
    });
    const { d, merged } = deps(file);
    const r = await applyArchiveSidecars(d);
    expect(merged[0]).toHaveLength(1);
    expect(r.historyIncomplete).toBe(true);
  });
});

describe('looking inside a ZIP', () => {
  it('refuses a data.json that is larger than a workspace can be', async () => {
    const file = path.join(root, 'big.zip');
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.alloc(5000, 0x20));
    await w.finish();
    const r = await inspectBackupFile({ filePath: file, summarize: () => null, maxDataJsonBytes: 1000 });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too large/i);
  });
});
