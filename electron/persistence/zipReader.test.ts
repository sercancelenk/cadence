import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Entry = { name: string; size: number };
type Zip = { entries: Entry[]; read: (name: string) => Promise<Buffer>; close: () => Promise<void> };
const { openZip, resolveBundleRoot } = require('./zipReader.cjs') as {
  openZip: (file: string, limits?: { maxEntryBytes?: number; maxEntries?: number; maxTotalBytes?: number }) => Promise<Zip>;
  resolveBundleRoot: (names: string[]) => string;
};
const { createZipWriter, crc32 } = require('./zipWriter.cjs') as {
  createZipWriter: (f: string) => Promise<{ add: (n: string, b: Buffer) => Promise<void>; finish: () => Promise<unknown> }>;
  crc32: (b: Buffer) => number;
};

let dir: string;
let file: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-zipr-'));
  file = path.join(dir, 'in.zip');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

type Raw = { name: string; data: Buffer; method?: 0 | 8; crc?: number; sizeInHeader?: number; flags?: number };

/** A hand-built archive, so the tests can make shapes our own writer never would (deflate, lies, ZIP64 markers). */
function buildZip(entries: Raw[], opts: { zip64?: boolean } = {}): Buffer {
  const parts: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const method = e.method ?? 0;
    const stored = method === 8 ? zlib.deflateRawSync(e.data) : e.data;
    const nameBytes = Buffer.from(e.name, 'utf8');
    const crc = e.crc ?? crc32(e.data);
    const size = e.sizeInHeader ?? e.data.length;
    const local = Buffer.alloc(30 + nameBytes.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(e.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(e.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(opts.zip64 ? 0xffffffff : size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    parts.push(local, stored);
    centrals.push(central);
    offset += local.length + stored.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

const write = (entries: Raw[], opts?: { zip64?: boolean }) => fs.writeFileSync(file, buildZip(entries, opts));
const text = (s: string) => Buffer.from(s);

describe('zip reader', () => {
  it('reads what the writer wrote', async () => {
    const w = await createZipWriter(file);
    const img = crypto.randomBytes(3000);
    await w.add('data.json', text('{"x":1}'));
    await w.add('attachments/aaaaaaaa.bin', img);
    await w.finish();
    const zip = await openZip(file);
    expect(zip.entries.map((e) => e.name).sort()).toEqual(['attachments/aaaaaaaa.bin', 'data.json']);
    expect((await zip.read('attachments/aaaaaaaa.bin')).equals(img)).toBe(true);
    await zip.close();
  });

  it('reads a compressed archive, as made by the operating system\'s "Compress" command', async () => {
    const body = text(JSON.stringify({ notes: Array.from({ length: 200 }, (_, i) => ({ id: `n${i}`, body: 'lorem ipsum '.repeat(20) })) }));
    write([{ name: 'Backup/data.json', data: body, method: 8 }]);
    const zip = await openZip(file);
    expect((await zip.read('Backup/data.json')).equals(body)).toBe(true);
    await zip.close();
  });

  it('refuses a compression method it does not know', async () => {
    write([{ name: 'data.json', data: text('{}'), method: 0 }]);
    const raw = fs.readFileSync(file);
    raw.writeUInt16LE(14, raw.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 10);
    fs.writeFileSync(file, raw);
    await expect(openZip(file)).rejects.toThrow(/unsupported zip compression/i);
  });

  it('refuses an encrypted entry', async () => {
    write([{ name: 'data.json', data: text('{}'), flags: 1 }]);
    await expect(openZip(file)).rejects.toThrow(/password-protected|encrypted/i);
  });

  it('refuses ZIP64 with a clear message', async () => {
    write([{ name: 'data.json', data: text('{}') }], { zip64: true });
    await expect(openZip(file)).rejects.toThrow(/zip64|too large/i);
  });

  it('refuses a duplicate entry name, which could shadow data.json', async () => {
    write([
      { name: 'data.json', data: text('{"a":1}') },
      { name: 'data.json', data: text('{"a":2}') },
    ]);
    await expect(openZip(file)).rejects.toThrow(/duplicate/i);
  });

  it('detects a damaged entry by its checksum', async () => {
    write([{ name: 'data.json', data: text('{"a":1}'), crc: 12345 }]);
    const zip = await openZip(file);
    await expect(zip.read('data.json')).rejects.toThrow(/checksum/i);
    await zip.close();
  });

  it('does not inflate more than the entry says it holds (zip bomb)', async () => {
    const big = Buffer.alloc(5_000_000, 0x61);
    write([{ name: 'data.json', data: big, method: 8, sizeInHeader: 100 }]);
    const zip = await openZip(file);
    await expect(zip.read('data.json')).rejects.toThrow(/inconsistent|size|corrupt/i);
    await zip.close();
  });

  it('refuses an entry larger than the allowed size without reading it', async () => {
    write([{ name: 'attachments/aaaaaaaa.bin', data: crypto.randomBytes(2000) }]);
    const zip = await openZip(file, { maxEntryBytes: 1000 });
    await expect(zip.read('attachments/aaaaaaaa.bin')).rejects.toThrow(/too large/i);
    await zip.close();
  });

  it('refuses an archive with an absurd number of entries', async () => {
    write(Array.from({ length: 30 }, (_, i) => ({ name: `f${i}`, data: text('x') })));
    await expect(openZip(file, { maxEntries: 10 })).rejects.toThrow(/too many/i);
  });

  it('refuses entries that share the same bytes, which is how a small file claims gigabytes (zip bomb)', async () => {
    const big = Buffer.alloc(3_000_000, 0x61);
    write([
      { name: 'attachments/aaaaaaaa.bin', data: big, method: 8 },
      { name: 'attachments/bbbbbbbb.bin', data: big, method: 8 },
    ]);
    // Point the second record at the first entry's data.
    const raw = fs.readFileSync(file);
    const second = raw.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    raw.writeUInt32LE(0, second + 42);
    fs.writeFileSync(file, raw);
    await expect(openZip(file)).rejects.toThrow(/overlap|corrupt/i);
  });

  it('refuses a compressed entry that claims more than compression can produce', async () => {
    write([{ name: 'attachments/aaaaaaaa.bin', data: Buffer.alloc(100, 0x61), method: 8, sizeInHeader: 2_000_000_000 }]);
    await expect(openZip(file)).rejects.toThrow(/inconsistent|corrupt|size/i);
  });

  it('refuses an archive that claims more in total than the allowed amount', async () => {
    write([
      { name: 'a/aaaaaaaa.bin', data: crypto.randomBytes(600) },
      { name: 'a/bbbbbbbb.bin', data: crypto.randomBytes(600) },
    ]);
    await expect(openZip(file, { maxTotalBytes: 1000 })).rejects.toThrow(/too large|too much/i);
  });

  it('is not an archive', async () => {
    fs.writeFileSync(file, 'hello');
    await expect(openZip(file)).rejects.toThrow(/not a valid zip/i);
  });

  it('is truncated', async () => {
    write([{ name: 'data.json', data: text('{"a":1}') }]);
    fs.writeFileSync(file, fs.readFileSync(file).subarray(0, 40));
    await expect(openZip(file)).rejects.toThrow(/not a valid zip|corrupt|truncated/i);
  });

  it('leaves out names that would escape the folder or are system metadata', async () => {
    write([
      { name: 'data.json', data: text('{}') },
      { name: '../evil.json', data: text('{}') },
      { name: '/abs.json', data: text('{}') },
      { name: '__MACOSX/._data.json', data: text('x') },
      { name: '.DS_Store', data: text('x') },
    ]);
    const zip = await openZip(file);
    expect(zip.entries.map((e) => e.name)).toEqual(['data.json']);
    await zip.close();
  });
});

describe('bundle root', () => {
  it('is the top when data.json sits there', () => {
    expect(resolveBundleRoot(['data.json', 'attachments/a.bin'])).toBe('');
  });
  it('is the single folder a zipped backup folder lives in', () => {
    expect(resolveBundleRoot(['cadence-backup-2026/data.json', 'cadence-backup-2026/attachments/a.bin'])).toBe('cadence-backup-2026/');
  });
  it('is empty when there are several candidates', () => {
    expect(resolveBundleRoot(['a/data.json', 'b/data.json'])).toBe('');
  });
});
