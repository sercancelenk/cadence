import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * The batch writer is the half of a save that may run outside the main
 * process. Everything here is about one promise: a batch that does not fully
 * succeed leaves the workspace byte-identical to how it found it.
 */

const require = createRequire(import.meta.url);

type Writer = {
  stage: (
    filePath: string,
    text: string,
    token: string,
  ) => { ok: true; tmp: string } | { ok: false; reason: string; error: string };
  commit: (tmp: string, filePath: string) => { ok: boolean; reason?: string; error?: string };
  discard: (tmp: string) => void;
};

const { createStagedWriter } = require('./stagedWrite.cjs') as {
  createStagedWriter: (deps: { fs: typeof fs; path: typeof path }) => Writer;
};

type StagedDocument = { path: string; tmp: string };
type BatchResult =
  | { ok: true; staged: StagedDocument[] }
  | { ok: false; failure: { path: string; reason: string; error: string } };

const { stageWriteBatch, commitWriteBatch, discardWriteBatch } = require('./writeBatch.cjs') as {
  stageWriteBatch: (options: {
    documents: { path: string; json: string }[];
    token: string;
    writer: Writer;
    encrypt?: (json: string) => string;
    decrypt?: (text: string) => string | null;
    readText: (filePath: string) => string;
  }) => BatchResult;
  commitWriteBatch: (
    staged: StagedDocument[],
    writer: Writer,
  ) =>
    | { ok: true; committed: string[] }
    | { ok: false; committed: string[]; failure: { path: string; reason: string } };
  discardWriteBatch: (staged: StagedDocument[], writer: Writer) => void;
};

const KEY = crypto.scryptSync('batch', Buffer.from('batch-salt'), 32);

function encrypt(json: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: body.toString('base64'),
  });
}

function decrypt(text: string): string | null {
  try {
    const env = JSON.parse(text) as { iv: string; tag: string; data: string };
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(env.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(env.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

let dir: string;
let writer: Writer;
const readText = (filePath: string) => fs.readFileSync(filePath, 'utf8');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-batch-'));
  writer = createStagedWriter({ fs, path });
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function file(name: string) {
  return path.join(dir, name);
}

function documents() {
  return [
    { path: file('workspace.json'), json: '{"notes":["a"]}' },
    { path: file('workspace-2026-01.json'), json: '{"notes":["b"]}' },
  ];
}

describe('stageWriteBatch', () => {
  it('leaves the target files untouched until the batch is committed', () => {
    fs.writeFileSync(file('workspace.json'), 'previous');

    const result = stageWriteBatch({
      documents: documents(),
      token: 'tok',
      writer,
      encrypt,
      decrypt,
      readText,
    });

    expect(result.ok).toBe(true);
    expect(readText(file('workspace.json'))).toBe('previous');
    expect(fs.existsSync(file('workspace-2026-01.json'))).toBe(false);

    if (!result.ok) return;
    expect(commitWriteBatch(result.staged, writer).ok).toBe(true);
    expect(decrypt(readText(file('workspace.json')))).toBe('{"notes":["a"]}');
    expect(decrypt(readText(file('workspace-2026-01.json')))).toBe('{"notes":["b"]}');
  });

  it('writes plaintext when the account has no key', () => {
    const result = stageWriteBatch({
      documents: [{ path: file('workspace.json'), json: '{"notes":[]}' }],
      token: 'tok',
      writer,
      readText,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    commitWriteBatch(result.staged, writer);
    expect(readText(file('workspace.json'))).toBe('{"notes":[]}');
  });

  it('cleans up every tmp when one document cannot be staged', () => {
    const failing: Writer = {
      ...writer,
      stage: (filePath, text, token) =>
        filePath.endsWith('workspace-2026-01.json')
          ? { ok: false, reason: 'durability', error: 'no fsync' }
          : writer.stage(filePath, text, token),
    };

    const result = stageWriteBatch({
      documents: documents(),
      token: 'tok',
      writer: failing,
      encrypt,
      decrypt,
      readText,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('durability');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('rejects the batch when a staged file does not read back as written', () => {
    const corrupting: Writer = {
      ...writer,
      stage: (filePath, text, token) => {
        const staged = writer.stage(filePath, text, token);
        if (staged.ok) fs.writeFileSync(staged.tmp, 'corrupted');
        return staged;
      },
    };

    const result = stageWriteBatch({
      documents: documents(),
      token: 'tok',
      writer: corrupting,
      encrypt,
      decrypt,
      readText,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('verify-failed');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('rejects the batch when the bytes were encrypted under a different key', () => {
    const otherKey = crypto.scryptSync('other', Buffer.from('batch-salt'), 32);
    const encryptWithOtherKey = (json: string) => {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', otherKey, iv);
      const body = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
      return JSON.stringify({
        v: 1,
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: body.toString('base64'),
      });
    };

    const result = stageWriteBatch({
      documents: documents(),
      token: 'tok',
      writer,
      encrypt: encryptWithOtherKey,
      decrypt,
      readText,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('verify-failed');
  });

  it('keeps concurrent batches for the same target apart', () => {
    const first = stageWriteBatch({
      documents: [{ path: file('workspace.json'), json: '{"n":1}' }],
      token: 'first',
      writer,
      readText,
    });
    const second = stageWriteBatch({
      documents: [{ path: file('workspace.json'), json: '{"n":2}' }],
      token: 'second',
      writer,
      readText,
    });

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.staged[0]!.tmp).not.toBe(second.staged[0]!.tmp);

    // The batch that loses the race is dropped without touching the winner.
    commitWriteBatch(second.staged, writer);
    discardWriteBatch(first.staged, writer);

    expect(readText(file('workspace.json'))).toBe('{"n":2}');
    expect(fs.readdirSync(dir)).toEqual(['workspace.json']);
  });
});

describe('commitWriteBatch', () => {
  it('reports which documents made it when a rename fails midway', () => {
    const staged = stageWriteBatch({
      documents: documents(),
      token: 'tok',
      writer,
      readText,
    });
    expect(staged.ok).toBe(true);
    if (!staged.ok) return;

    const failing: Writer = {
      ...writer,
      commit: (tmp, filePath) =>
        filePath.endsWith('workspace-2026-01.json')
          ? { ok: false, reason: 'io', error: 'rename failed' }
          : writer.commit(tmp, filePath),
    };

    const result = commitWriteBatch(staged.staged, failing);

    expect(result.ok).toBe(false);
    expect(result.committed).toEqual([file('workspace.json')]);
    // No orphan tmp files are left behind for the caller to clean up.
    expect(fs.readdirSync(dir)).toEqual(['workspace.json']);
  });
});
