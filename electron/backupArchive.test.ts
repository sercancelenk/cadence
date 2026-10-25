import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const { sweepStaleScratch } = require('./backupArchive.cjs') as {
  sweepStaleScratch: (root: string) => Promise<number>;
};

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-sweep-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('sweepStaleScratch', () => {
  it('removes every scratch folder left by an earlier run (they hold readable note history) and nothing else', async () => {
    const left = path.join(root, 'tmp-backup-1-100');
    const left2 = path.join(root, 'tmp-backup-import-2-200');
    const other = path.join(root, 'attachments');
    for (const d of [left, left2, other]) fs.mkdirSync(d);
    fs.writeFileSync(path.join(left, 'x'), 'x');
    fs.writeFileSync(path.join(root, 'tmp-backup-file'), 'not a folder');

    expect(await sweepStaleScratch(root)).toBe(2);
    expect(fs.existsSync(left)).toBe(false);
    expect(fs.existsSync(left2)).toBe(false);
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

describe('files written on Windows', () => {
  it('reads a JSON workspace that starts with a byte-order mark (Notepad and PowerShell add one)', async () => {
    const file = path.join(root, 'bom.json');
    fs.writeFileSync(file, `\uFEFF${JSON.stringify({ notes: [{ id: 'n1', title: 'T' }], teams: [], people: [], items: [], todoItems: [] })}`);
    const r = await inspectBackupFile({ filePath: file, summarize: () => null });
    expect(r.ok, r.error).toBe(true);
  });

  it('reads a ZIP whose data.json and manifest start with a byte-order mark', async () => {
    const file = path.join(root, 'bom.zip');
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.from(`\uFEFF${JSON.stringify({ notes: [], teams: [], people: [], items: [], todoItems: [] })}`));
    await w.add('manifest.json', Buffer.from(`\uFEFF${JSON.stringify({ format: 'cadence-bundle-v2', exportedAt: '2026-01-01T00:00:00.000Z' })}`));
    await w.finish();
    const r = (await inspectBackupFile({ filePath: file, summarize: () => null })) as { ok: boolean; error?: string; exportedAt?: string };
    expect(r.ok, r.error).toBe(true);
    expect(r.exportedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('does not let two image names that differ only in case overwrite each other', async () => {
    const file = path.join(root, 'case.zip');
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.from('{}'));
    await w.add('attachments/AAAAAAAA.bin', PNG_BYTES);
    await w.add('attachments/aaaaaaaa.bin', Buffer.from('another image'));
    await w.finish();
    const { d, imported } = depsFor(file);
    const r = await applyArchiveSidecars(d);
    expect(imported).toHaveLength(1);
    expect(r.attachmentsFailed).toBe(1);
  });

  it('ignores history file names that Windows reserves for devices', async () => {
    const file = path.join(root, 'reserved.zip');
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.from('{}'));
    for (const name of ['con.json', 'NUL.json', 'aux.json', 'com1.json', 'lpt9.json']) {
      await w.add(`note-history/note-reserved-001/${name}`, Buffer.from('{}'));
    }
    await w.add('note-history/note-reserved-001/index.json', Buffer.from('{}'));
    await w.finish();
    const { d, merged } = depsFor(file);
    await applyArchiveSidecars(d);
    expect(merged[0]).toEqual(['note-reserved-001']);
    expect(merged[1]).toEqual(['index.json']);
  });
});

const PNG_BYTES = Buffer.from('89504e470d0a1a0a', 'hex');
function depsFor(file: string) {
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
        const folder = fs.readdirSync(src);
        merged.push(folder);
        // The files that reached the scratch folder (reserved names must not be among them).
        merged.push(fs.readdirSync(path.join(src, folder[0] as string)).sort());
        return { incomplete: false };
      },
    },
  };
}
