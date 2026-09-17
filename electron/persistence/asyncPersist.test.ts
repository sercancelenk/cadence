import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * End-to-end scenarios for the out-of-process save, modelled the way
 * `main.cjs` composes it: the worker stages bytes into tmp files, and only the
 * main process renames them into place.
 *
 * Each test is a way the split can go wrong. The bar for all of them is the
 * same and it is absolute: the workspace on disk is either the state before
 * the save or the state after it, never a mixture, and never older than a
 * write that already succeeded.
 */

const require = createRequire(import.meta.url);

type Document = { path: string; json: string };
type Staged = { path: string; tmp: string };
type Request = { id: number; documents: Document[]; token: string; keyHex: string | null };
type Response =
  | { id: number; ok: true; staged: Staged[] }
  | { id: number; ok: false; failure: { path: string; reason: string; error: string } };
type BatchResult =
  | { ok: true; staged: Staged[] }
  | { ok: false; failure: { path: string; reason: string; error: string } }
  | { ok: false; reason: 'unavailable' };

const { createStagedWriter } = require('./stagedWrite.cjs') as {
  createStagedWriter: (deps: { fs: typeof fs; path: typeof path }) => {
    stage: (
      p: string,
      text: string,
      token: string,
    ) => { ok: true; tmp: string } | { ok: false; reason: string; error: string };
    commit: (tmp: string, p: string) => { ok: boolean; reason?: string; error?: string };
    discard: (tmp: string) => void;
  };
};
const { stageWriteBatch, commitWriteBatch, discardWriteBatch } = require('./writeBatch.cjs') as {
  stageWriteBatch: (o: Record<string, unknown>) => { ok: true; staged: Staged[] } | { ok: false };
  commitWriteBatch: (s: Staged[], w: unknown) => { ok: boolean };
  discardWriteBatch: (s: Staged[], w: unknown) => void;
};
const { handlePersistRequest } = require('./persistRequest.cjs') as {
  handlePersistRequest: (r: Request) => Response;
};
const { createPersistBridge } = require('./persistBridge.cjs') as {
  createPersistBridge: (o: { fork: () => Worker | null }) => {
    runBatch: (b: { documents: Document[]; keyHex: string | null }) => Promise<BatchResult>;
    dispose: () => void;
  };
};
const { encryptPayload, decryptPayload } = require('./dataEnvelope.cjs') as {
  encryptPayload: (json: string, key: Buffer) => string;
  decryptPayload: (text: string, key: Buffer) => string | null;
};

/** A worker that can be told to die at the worst possible moment. */
class Worker extends EventEmitter {
  crashAfterStaging = false;

  postMessage(request: Request) {
    const response = handlePersistRequest(request);
    if (this.crashAfterStaging) {
      // Bytes are on disk in tmp files, but the answer never arrives.
      setImmediate(() => this.emit('exit', 1));
      return;
    }
    setImmediate(() => this.emit('message', response));
  }

  kill() {
    this.emit('exit', 0);
  }
}

const KEY = crypto.randomBytes(32);

let dir: string;
let writer: ReturnType<typeof createStagedWriter>;
let tokens = 0;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-async-'));
  writer = createStagedWriter({ fs, path });
  tokens = 0;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const base = () => path.join(dir, 'workspace.json');
const shard = () => path.join(dir, 'workspace-2026-01.json');

function read(target: string) {
  return decryptPayload(fs.readFileSync(target, 'utf8'), KEY);
}

/** The in-process write `main.cjs` falls back to, and uses for the exit flush. */
function writeInProcess(documents: Document[]) {
  tokens += 1;
  const staged = stageWriteBatch({
    documents,
    token: `sync${tokens}`,
    writer,
    readText: (p: string) => fs.readFileSync(p, 'utf8'),
    encrypt: (json: string) => encryptPayload(json, KEY),
    decrypt: (text: string) => decryptPayload(text, KEY),
  });
  expect(staged.ok).toBe(true);
  if (!staged.ok) return;
  expect(commitWriteBatch(staged.staged, writer).ok).toBe(true);
}

function orphanTmps() {
  return fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'));
}

describe('out-of-process save', () => {
  it('produces exactly the file the in-process save would', async () => {
    const bridge = createPersistBridge({ fork: () => new Worker() });
    const documents = [
      { path: base(), json: '{"notes":["one"]}' },
      { path: shard(), json: '{"notes":["two"]}' },
    ];

    const batch = await bridge.runBatch({ documents, keyHex: KEY.toString('hex') });

    expect(batch.ok).toBe(true);
    if (!batch.ok) return;
    // Still nothing visible: staging alone changes no target file.
    expect(fs.existsSync(base())).toBe(false);

    expect(commitWriteBatch(batch.staged, writer).ok).toBe(true);
    expect(read(base())).toBe('{"notes":["one"]}');
    expect(read(shard())).toBe('{"notes":["two"]}');
    expect(orphanTmps()).toEqual([]);
    bridge.dispose();
  });

  it('leaves the previous workspace intact when the worker dies mid-batch', async () => {
    writeInProcess([{ path: base(), json: '{"notes":["safe"]}' }]);

    const worker = new Worker();
    worker.crashAfterStaging = true;
    const bridge = createPersistBridge({ fork: () => worker });

    const batch = await bridge.runBatch({
      documents: [{ path: base(), json: '{"notes":["safe","new"]}' }],
      keyHex: KEY.toString('hex'),
    });

    expect(batch).toEqual({ ok: false, reason: 'unavailable' });
    // The crash cost us nothing but a tmp file nobody will ever commit.
    expect(read(base())).toBe('{"notes":["safe"]}');
    expect(orphanTmps()).toHaveLength(1);

    // The main process retries in-process, exactly as `writeUserDataAsync` does.
    writeInProcess([{ path: base(), json: '{"notes":["safe","new"]}' }]);
    expect(read(base())).toBe('{"notes":["safe","new"]}');
  });

  it('drops staged bytes rather than undo a write that landed first', async () => {
    writeInProcess([{ path: base(), json: '{"notes":["one"]}' }]);

    const bridge = createPersistBridge({ fork: () => new Worker() });
    const batch = await bridge.runBatch({
      documents: [{ path: base(), json: '{"notes":["one","typed"]}' }],
      keyHex: KEY.toString('hex'),
    });
    expect(batch.ok).toBe(true);
    if (!batch.ok) return;

    // The exit flush runs while those bytes sit staged: it is synchronous and
    // in-process, so it wins the race and its payload is the newer one.
    writeInProcess([{ path: base(), json: '{"notes":["one","typed","flushed"]}' }]);

    // Main sees its epoch moved and refuses to commit what it staged.
    discardWriteBatch(batch.staged, writer);

    expect(read(base())).toBe('{"notes":["one","typed","flushed"]}');
    expect(orphanTmps()).toEqual([]);
    bridge.dispose();
  });

  it('never lets a staged batch and a concurrent write share a tmp path', async () => {
    const bridge = createPersistBridge({ fork: () => new Worker() });

    const batch = await bridge.runBatch({
      documents: [{ path: base(), json: '{"n":"worker"}' }],
      keyHex: KEY.toString('hex'),
    });
    expect(batch.ok).toBe(true);
    if (!batch.ok) return;

    // Two live tmps for the same target, one per writer, neither disturbing
    // the other's bytes.
    tokens += 1;
    const local = stageWriteBatch({
      documents: [{ path: base(), json: '{"n":"main"}' }],
      token: 'sync-concurrent',
      writer,
      readText: (p: string) => fs.readFileSync(p, 'utf8'),
      encrypt: (json: string) => encryptPayload(json, KEY),
      decrypt: (text: string) => decryptPayload(text, KEY),
    });
    expect(local.ok).toBe(true);
    if (!local.ok) return;

    expect(orphanTmps()).toHaveLength(2);
    expect(local.staged[0]!.tmp).not.toBe(batch.staged[0]!.tmp);

    commitWriteBatch(local.staged, writer);
    discardWriteBatch(batch.staged, writer);
    expect(read(base())).toBe('{"n":"main"}');
    bridge.dispose();
  });

  it('keeps the base file ahead of its shards when a commit fails midway', async () => {
    writeInProcess([
      { path: base(), json: '{"gen":1}' },
      { path: shard(), json: '{"gen":1}' },
    ]);

    const bridge = createPersistBridge({ fork: () => new Worker() });
    const batch = await bridge.runBatch({
      documents: [
        { path: base(), json: '{"gen":2}' },
        { path: shard(), json: '{"gen":2}' },
      ],
      keyHex: KEY.toString('hex'),
    });
    expect(batch.ok).toBe(true);
    if (!batch.ok) return;

    const failing = {
      ...writer,
      commit: (tmp: string, target: string) =>
        target === shard()
          ? { ok: false, reason: 'io', error: 'disk full' }
          : writer.commit(tmp, target),
    };

    expect(commitWriteBatch(batch.staged, failing).ok).toBe(false);

    // The base file is the one older builds read on its own, so it is staged
    // and committed first: a half-committed batch never leaves a shard
    // describing a workspace the base file has not caught up to.
    expect(read(base())).toBe('{"gen":2}');
    expect(read(shard())).toBe('{"gen":1}');
    expect(orphanTmps()).toEqual([]);
    bridge.dispose();
  });
});
