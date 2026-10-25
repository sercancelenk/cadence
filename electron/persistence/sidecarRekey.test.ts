import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

type Codec = {
  open: (text: string, key: Buffer) => Buffer | null;
  seal: (bytes: Buffer, key: Buffer) => string;
  sealPlain: boolean;
};
type Counts = { ok: boolean; staged: number; unchanged: number; unreadable: number; failed: string[] };

const { stageRekey, commitStaged, discardStaged, finalizeStaged } = require('./sidecarRekey.cjs') as {
  stageRekey: (files: string[], from: Buffer, to: Buffer, codec: Codec, write: (p: string, b: Buffer) => boolean) => Counts;
  commitStaged: (files: string[], to: Buffer, codec: Codec) => { ok: boolean; committed: number; failed: string[] };
  discardStaged: (files: string[]) => void;
  finalizeStaged: (files: string[], key: Buffer, codec: Codec) => { swapped: number; dropped: number };
};
const { encryptBuffer, decryptBuffer, encryptPayload, decryptPayload } = require('./dataEnvelope.cjs') as {
  encryptBuffer: (b: Buffer, k: Buffer) => string;
  decryptBuffer: (t: string, k: Buffer) => Buffer | null;
  encryptPayload: (t: string, k: Buffer) => string;
  decryptPayload: (t: string, k: Buffer) => string | null;
};

const binaryCodec: Codec = { open: decryptBuffer, seal: encryptBuffer, sealPlain: false };
const textCodec: Codec = {
  open: (t, k) => {
    const p = decryptPayload(t, k);
    return p == null ? null : Buffer.from(p, 'utf8');
  },
  seal: (b, k) => encryptPayload(b.toString('utf8'), k),
  sealPlain: true,
};

const oldKey = crypto.randomBytes(32);
const newKey = crypto.randomBytes(32);
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
let dir: string;
let file: string;

const write = (p: string, b: Buffer) => {
  fs.writeFileSync(p, b);
  return true;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-sidecar-rekey-'));
  file = path.join(dir, 'a.cadenc');
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe('stageRekey', () => {
  it('writes a copy sealed under the new key next to the file and leaves the file alone', () => {
    const original = encryptBuffer(PNG, oldKey);
    fs.writeFileSync(file, original);

    const r = stageRekey([file], oldKey, newKey, binaryCodec, write);

    expect(r).toMatchObject({ ok: true, staged: 1 });
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(decryptBuffer(fs.readFileSync(`${file}.rekey`, 'utf8'), newKey)?.equals(PNG)).toBe(true);
  });

  it('skips a file that already opens under the new key, so a retry is harmless', () => {
    fs.writeFileSync(file, encryptBuffer(PNG, newKey));
    expect(stageRekey([file], oldKey, newKey, binaryCodec, write)).toMatchObject({ ok: true, staged: 0, unchanged: 1 });
    expect(fs.existsSync(`${file}.rekey`)).toBe(false);
  });

  it('leaves plaintext images and files that open under neither key alone', () => {
    const plain = path.join(dir, 'plain.bin');
    fs.writeFileSync(plain, PNG);
    const foreign = encryptBuffer(PNG, crypto.randomBytes(32));
    fs.writeFileSync(file, foreign);

    const r = stageRekey([plain, file], oldKey, newKey, binaryCodec, write);

    expect(r).toMatchObject({ ok: true, staged: 0, unreadable: 1 });
    expect(fs.readFileSync(file, 'utf8')).toBe(foreign);
  });

  it('carries on from a copy a cut-short earlier change left behind, when another change follows before any sign-in', () => {
    const k0 = crypto.randomBytes(32);
    const k1 = crypto.randomBytes(32);
    const k2 = crypto.randomBytes(32);
    fs.writeFileSync(file, encryptBuffer(PNG, k0));
    stageRekey([file], k0, k1, binaryCodec, write); // change 1: staged, the swap never happened

    const r = stageRekey([file], k1, k2, binaryCodec, write); // change 2: the live file is still under k0

    expect(r).toMatchObject({ ok: true, staged: 1, unreadable: 0 });
    expect(commitStaged([file], k2, binaryCodec)).toMatchObject({ ok: true, committed: 1 });
    expect(decryptBuffer(fs.readFileSync(file, 'utf8'), k2)?.equals(PNG)).toBe(true);
  });

  it('seals plaintext history when the codec allows it', () => {
    const hist = path.join(dir, 'rev.json');
    fs.writeFileSync(hist, '{"body":"hello"}');
    expect(stageRekey([hist], oldKey, newKey, textCodec, write)).toMatchObject({ ok: true, staged: 1 });
    expect(decryptPayload(fs.readFileSync(`${hist}.rekey`, 'utf8'), newKey)).toBe('{"body":"hello"}');
  });

  it('reports a failed write, and nothing is changed', () => {
    const original = encryptBuffer(PNG, oldKey);
    fs.writeFileSync(file, original);
    const r = stageRekey([file], oldKey, newKey, binaryCodec, () => false);
    expect(r.ok).toBe(false);
    expect(r.failed).toEqual(['a.cadenc']);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });
});

describe('commitStaged / discardStaged', () => {
  it('swaps each staged copy in once it opens under the new key', () => {
    fs.writeFileSync(file, encryptBuffer(PNG, oldKey));
    stageRekey([file], oldKey, newKey, binaryCodec, write);

    expect(commitStaged([file], newKey, binaryCodec)).toMatchObject({ ok: true, committed: 1 });

    expect(decryptBuffer(fs.readFileSync(file, 'utf8'), newKey)?.equals(PNG)).toBe(true);
    expect(fs.existsSync(`${file}.rekey`)).toBe(false);
  });

  it('refuses to swap in a staged copy that does not open under the new key', () => {
    const original = encryptBuffer(PNG, oldKey);
    fs.writeFileSync(file, original);
    fs.writeFileSync(`${file}.rekey`, 'garbage');

    expect(commitStaged([file], newKey, binaryCodec).ok).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });

  it('discard removes the staged copies and nothing else', () => {
    const original = encryptBuffer(PNG, oldKey);
    fs.writeFileSync(file, original);
    stageRekey([file], oldKey, newKey, binaryCodec, write);

    discardStaged([file]);

    expect(fs.existsSync(`${file}.rekey`)).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe(original);
  });
});

describe('finalizeStaged', () => {
  it('finishes a swap that was cut short: the file is still under the old key, the copy is under this one', () => {
    fs.writeFileSync(file, encryptBuffer(PNG, oldKey));
    stageRekey([file], oldKey, newKey, binaryCodec, write);

    expect(finalizeStaged([file], newKey, binaryCodec)).toMatchObject({ swapped: 1 });

    expect(decryptBuffer(fs.readFileSync(file, 'utf8'), newKey)?.equals(PNG)).toBe(true);
    expect(fs.existsSync(`${file}.rekey`)).toBe(false);
  });

  it('drops a leftover copy when the file already opens under this key', () => {
    fs.writeFileSync(file, encryptBuffer(PNG, newKey));
    fs.writeFileSync(`${file}.rekey`, encryptBuffer(PNG, newKey));
    expect(finalizeStaged([file], newKey, binaryCodec)).toMatchObject({ swapped: 0, dropped: 1 });
    expect(fs.existsSync(`${file}.rekey`)).toBe(false);
  });

  it('leaves everything alone when neither the file nor the copy opens under this key', () => {
    const original = encryptBuffer(PNG, oldKey);
    fs.writeFileSync(file, original);
    const other = encryptBuffer(PNG, crypto.randomBytes(32));
    fs.writeFileSync(`${file}.rekey`, other);

    finalizeStaged([file], newKey, binaryCodec);

    expect(fs.readFileSync(file, 'utf8')).toBe(original);
    expect(fs.readFileSync(`${file}.rekey`, 'utf8')).toBe(other);
  });
});
