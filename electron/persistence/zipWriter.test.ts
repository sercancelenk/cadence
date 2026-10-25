import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipStoreUnpack } from '../../src/lib/backupBundle/zipStore';

type Writer = {
  add: (name: string, bytes: Buffer) => Promise<void>;
  finish: () => Promise<{ entries: number; bytes: number }>;
  abort: () => Promise<void>;
};
const { createZipWriter, ZIP_MAX_ENTRIES } = require('./zipWriter.cjs') as {
  createZipWriter: (file: string, options?: { maxEntries?: number }) => Promise<Writer>;
  ZIP_MAX_ENTRIES: number;
};

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-zipw-'));
  file = path.join(dir, 'out.zip');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('streaming zip writer', () => {
  it('writes an archive that the app\'s own reader opens, byte for byte', async () => {
    const w = await createZipWriter(file);
    const png = crypto.randomBytes(5000);
    await w.add('data.json', Buffer.from('{"a":1}'));
    await w.add('attachments/aaaaaaaa.bin', png);
    await w.add('note-history/n1/index.json', Buffer.from('[]'));
    const done = await w.finish();
    expect(done.entries).toBe(3);

    const out = zipStoreUnpack(new Uint8Array(fs.readFileSync(file)));
    expect(Object.keys(out).sort()).toEqual(['attachments/aaaaaaaa.bin', 'data.json', 'note-history/n1/index.json']);
    expect(Buffer.from(out['attachments/aaaaaaaa.bin']!).equals(png)).toBe(true);
    expect(new TextDecoder().decode(out['data.json'])).toBe('{"a":1}');
  });

  it('writes an empty file entry and non-ASCII names', async () => {
    const w = await createZipWriter(file);
    await w.add('empty.txt', Buffer.alloc(0));
    await w.add('note-history/not-çğş/index.json', Buffer.from('x'));
    await w.finish();
    const out = zipStoreUnpack(new Uint8Array(fs.readFileSync(file)));
    expect(out['empty.txt']).toHaveLength(0);
    expect(Object.keys(out)).toContain('note-history/not-çğş/index.json');
  });

  it('refuses a name it cannot store safely', async () => {
    const w = await createZipWriter(file);
    for (const bad of ['../x', '/abs', 'a\\b', '', 'a/../b']) {
      await expect(w.add(bad, Buffer.from('x'))).rejects.toThrow(/entry name/i);
    }
    await w.abort();
  });

  it('refuses a duplicate name rather than writing an archive readers reject', async () => {
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.from('1'));
    await expect(w.add('data.json', Buffer.from('2'))).rejects.toThrow(/duplicate/i);
    await w.abort();
  });

  it('stops with a clear error instead of writing a ZIP that needs ZIP64', async () => {
    expect(ZIP_MAX_ENTRIES).toBe(65534);
    const w = await createZipWriter(file, { maxEntries: 40 });
    for (let i = 0; i < 40; i += 1) await w.add(`f/${i}`, Buffer.alloc(0));
    await expect(w.add('one-too-many', Buffer.alloc(0))).rejects.toThrow(/too many files/i);
    await w.abort();
  });

  it('abort leaves no partial file behind', async () => {
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.from('1'));
    await w.abort();
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('writes under a temporary name and only finish() puts the real file in place', async () => {
    const w = await createZipWriter(file);
    await w.add('data.json', Buffer.from('1'));
    expect(fs.existsSync(file)).toBe(false);
    await w.finish();
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readdirSync(dir)).toEqual(['out.zip']);
  });
});
