import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The worker is an optimisation, never a dependency. Every test here is a way
 * the child can let us down; all of them must end in `unavailable`, which is
 * the main process's instruction to write the save in-process instead.
 */

const require = createRequire(import.meta.url);

type Document = { path: string; json: string };
type Request = { id: number; documents: Document[]; token: string; keyHex: string | null };
type Response =
  | { id: number; ok: true; staged: { path: string; tmp: string }[] }
  | { id: number; ok: false; failure: { path: string; reason: string; error: string } };
type BatchResult =
  | { ok: true; staged: { path: string; tmp: string }[] }
  | { ok: false; failure: { path: string; reason: string; error: string } }
  | { ok: false; reason: 'unavailable' };

type Bridge = {
  runBatch: (batch: { documents: Document[]; keyHex: string | null }) => Promise<BatchResult>;
  dispose: () => void;
  isRunning: () => boolean;
};

const { createPersistBridge, isAsyncPersistEnabled } = require('./persistBridge.cjs') as {
  createPersistBridge: (options: {
    fork: () => FakeWorker | null;
    batchTimeoutMs?: number;
    respawnCooldownMs?: number;
    now?: () => number;
  }) => Bridge;
  isAsyncPersistEnabled: (env: Record<string, string | undefined>) => boolean;
};

const { handlePersistRequest } = require('./persistRequest.cjs') as {
  handlePersistRequest: (request: Request) => Response;
};

/** Stands in for an Electron `UtilityProcess`, running the real worker handler. */
class FakeWorker extends EventEmitter {
  killed = false;
  answer: 'real' | 'never' | 'garbage' = 'real';

  postMessage(request: Request) {
    if (this.answer === 'never') return;
    if (this.answer === 'garbage') {
      setImmediate(() => this.emit('message', { nope: true }));
      return;
    }
    const response = handlePersistRequest(request);
    setImmediate(() => this.emit('message', response));
  }

  kill() {
    this.killed = true;
    this.emit('exit', 0);
  }

  crash() {
    this.emit('exit', 1);
  }
}

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-bridge-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

function batch(name = 'workspace.json', json = '{"notes":[]}') {
  return { documents: [{ path: path.join(dir, name), json }], keyHex: null };
}

describe('isAsyncPersistEnabled', () => {
  it('is off unless explicitly set to 1', () => {
    expect(isAsyncPersistEnabled({})).toBe(false);
    expect(isAsyncPersistEnabled({ CADENCE_ASYNC_PERSIST: '' })).toBe(false);
    expect(isAsyncPersistEnabled({ CADENCE_ASYNC_PERSIST: 'true' })).toBe(false);
    expect(isAsyncPersistEnabled({ CADENCE_ASYNC_PERSIST: '1' })).toBe(true);
  });
});

describe('createPersistBridge', () => {
  it('stages a batch in the worker without touching the target file', async () => {
    const bridge = createPersistBridge({ fork: () => new FakeWorker() });

    const result = await bridge.runBatch(batch());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fs.existsSync(path.join(dir, 'workspace.json'))).toBe(false);
    expect(fs.readFileSync(result.staged[0]!.tmp, 'utf8')).toBe('{"notes":[]}');
    bridge.dispose();
  });

  it('routes concurrent batches back to their own callers', async () => {
    const bridge = createPersistBridge({ fork: () => new FakeWorker() });

    const [first, second] = await Promise.all([
      bridge.runBatch(batch('a.json', '{"n":1}')),
      bridge.runBatch(batch('b.json', '{"n":2}')),
    ]);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.staged[0]!.path).toBe(path.join(dir, 'a.json'));
    expect(second.staged[0]!.path).toBe(path.join(dir, 'b.json'));
    bridge.dispose();
  });

  it('falls back in-process when the worker cannot be spawned', async () => {
    const bridge = createPersistBridge({
      fork: () => {
        throw new Error('utilityProcess unavailable');
      },
    });

    await expect(bridge.runBatch(batch())).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('stops trying to spawn for a cooldown after a failure', async () => {
    let attempts = 0;
    let clock = 0;
    const bridge = createPersistBridge({
      fork: () => {
        attempts += 1;
        throw new Error('nope');
      },
      respawnCooldownMs: 1000,
      now: () => clock,
    });

    await bridge.runBatch(batch());
    await bridge.runBatch(batch());
    expect(attempts).toBe(1);

    clock = 1001;
    await bridge.runBatch(batch());
    expect(attempts).toBe(2);
  });

  it('hands an in-flight batch back when the worker crashes', async () => {
    const worker = new FakeWorker();
    worker.answer = 'never';
    const bridge = createPersistBridge({ fork: () => worker });

    const inFlight = bridge.runBatch(batch());
    worker.crash();

    await expect(inFlight).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(bridge.isRunning()).toBe(false);
  });

  it('gives up on a worker that never answers', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.answer = 'never';
    const bridge = createPersistBridge({ fork: () => worker, batchTimeoutMs: 500 });

    const inFlight = bridge.runBatch(batch());
    await vi.advanceTimersByTimeAsync(500);

    await expect(inFlight).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(worker.killed).toBe(true);
  });

  it('ignores a reply it cannot make sense of', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    worker.answer = 'garbage';
    const bridge = createPersistBridge({ fork: () => worker, batchTimeoutMs: 500 });

    const inFlight = bridge.runBatch(batch());
    await vi.advanceTimersByTimeAsync(500);

    await expect(inFlight).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  it('reports a real batch failure as a failure, not as unavailable', async () => {
    const bridge = createPersistBridge({ fork: () => new FakeWorker() });

    const result = await bridge.runBatch({
      documents: [{ path: path.join(dir, 'workspace.json'), json: '{}' }],
      keyHex: 'not-a-key',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect('failure' in result && result.failure.reason).toBe('no-key');
    bridge.dispose();
  });

  it('spawns a replacement worker after a crash cooldown', async () => {
    let clock = 0;
    const workers: FakeWorker[] = [];
    const bridge = createPersistBridge({
      fork: () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      respawnCooldownMs: 1000,
      now: () => clock,
    });

    await bridge.runBatch(batch('a.json'));
    workers[0]!.crash();

    clock = 1001;
    const result = await bridge.runBatch(batch('b.json'));

    expect(workers).toHaveLength(2);
    expect(result.ok).toBe(true);
    bridge.dispose();
  });
});

describe('handlePersistRequest', () => {
  it('encrypts with the key it is handed and verifies the result', () => {
    const key = crypto.randomBytes(32);
    const target = path.join(dir, 'workspace.json');

    const response = handlePersistRequest({
      id: 7,
      documents: [{ path: target, json: '{"notes":["kept"]}' }],
      token: 'tok',
      keyHex: key.toString('hex'),
    });

    expect(response.id).toBe(7);
    expect(response.ok).toBe(true);
    if (!response.ok) return;

    const envelope = fs.readFileSync(response.staged[0]!.tmp, 'utf8');
    expect(envelope).toContain('LDMN1');
    const { decryptPayload } = require('./dataEnvelope.cjs') as {
      decryptPayload: (text: string, key: Buffer) => string | null;
    };
    expect(decryptPayload(envelope, key)).toBe('{"notes":["kept"]}');
  });

  it('refuses a key of the wrong size instead of writing plaintext', () => {
    const target = path.join(dir, 'workspace.json');

    const response = handlePersistRequest({
      id: 1,
      documents: [{ path: target, json: '{"notes":["secret"]}' }],
      token: 'tok',
      keyHex: crypto.randomBytes(8).toString('hex'),
    });

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.failure.reason).toBe('no-key');
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});
