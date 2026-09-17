/**
 * Main-process side of the persistence utility process.
 *
 * Owns the child's lifecycle and turns it into a single promise-returning
 * call. Its whole design goal is that the child is an optimisation and never a
 * dependency: every way the child can let us down — not spawning, crashing
 * mid-batch, hanging, answering nonsense — resolves to `{ ok: false, reason:
 * 'unavailable' }`, which tells the caller to do the write in-process exactly
 * as it always has. A save is never lost because the worker had a bad day.
 *
 * A batch that genuinely failed (bad key, no disk space, verification
 * mismatch) is reported as `{ ok: false, failure }` and is a real error, kept
 * distinct from `unavailable` so the two are never confused.
 */

/** A wedged worker must not stall saves; after this we kill it and write in-process. */
const DEFAULT_BATCH_TIMEOUT_MS = 10_000;
/** After a spawn failure, stop trying for a while rather than on every keystroke. */
const DEFAULT_RESPAWN_COOLDOWN_MS = 30_000;

const UNAVAILABLE = Object.freeze({ ok: false, reason: 'unavailable' });

/**
 * Async persistence is opt-in. Absent or any value other than '1' keeps the
 * fully synchronous in-process path that has always shipped.
 * @param {Record<string, string | undefined>} env
 */
function isAsyncPersistEnabled(env) {
  return env?.CADENCE_ASYNC_PERSIST === '1';
}

/**
 * @param {object} options
 * @param {() => { postMessage: Function; kill: Function; on: Function } | null} options.fork
 *   Spawns the worker. Throwing or returning null means "no worker available".
 * @param {number} [options.batchTimeoutMs]
 * @param {number} [options.respawnCooldownMs]
 * @param {() => number} [options.now]
 */
function createPersistBridge({
  fork,
  batchTimeoutMs = DEFAULT_BATCH_TIMEOUT_MS,
  respawnCooldownMs = DEFAULT_RESPAWN_COOLDOWN_MS,
  now = Date.now,
}) {
  /** @type {{ postMessage: Function; kill: Function; on: Function } | null} */
  let child = null;
  /** @type {Map<number, { resolve: (value: unknown) => void; timer: NodeJS.Timeout }>} */
  const pending = new Map();
  let nextId = 1;
  let unavailableUntil = 0;
  let disposed = false;

  function settle(id, value) {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(value);
  }

  /** Abandon the current child and hand every in-flight batch back to the caller. */
  function dropChild({ cooldown }) {
    const dying = child;
    child = null;
    if (cooldown) unavailableUntil = now() + respawnCooldownMs;
    for (const id of [...pending.keys()]) settle(id, UNAVAILABLE);
    if (dying) {
      try {
        dying.kill();
      } catch {
        /* already gone */
      }
    }
  }

  function ensureChild() {
    if (child) return child;
    if (disposed || now() < unavailableUntil) return null;
    let spawned;
    try {
      spawned = fork();
    } catch (err) {
      console.warn('[cadence] persistence worker failed to spawn; saving in-process', err);
      unavailableUntil = now() + respawnCooldownMs;
      return null;
    }
    if (!spawned) {
      unavailableUntil = now() + respawnCooldownMs;
      return null;
    }

    spawned.on('message', (message) => {
      if (!message || typeof message.id !== 'number') return;
      settle(message.id, message);
    });
    spawned.on('exit', () => {
      if (child !== spawned) return;
      // A crash mid-batch leaves at most an orphan tmp file: the child never
      // renames anything into place. Falling back in-process is always safe.
      console.warn('[cadence] persistence worker exited; saving in-process');
      dropChild({ cooldown: true });
    });

    child = spawned;
    return child;
  }

  /**
   * Stage one batch in the worker.
   *
   * `token` names the child's tmp files. The caller supplies it so that when
   * this returns `unavailable` — a crash or a timeout, both of which can leave
   * tmps behind — the caller can delete exactly those files instead of waiting
   * for the next launch to sweep them. It must differ from the token the
   * caller uses for its own in-process retry, or the retry would collide with
   * a child that is still mid-write.
   *
   * @param {{ documents: { path: string; json: string }[]; keyHex: string | null; token?: string }} batch
   * @returns {Promise<{ ok: true; staged: { path: string; tmp: string }[] }
   *                  | { ok: false; failure: { path: string; reason: string; error: string } }
   *                  | { ok: false; reason: 'unavailable' }>}
   */
  function runBatch({ documents, keyHex, token }) {
    const worker = ensureChild();
    if (!worker) return Promise.resolve(UNAVAILABLE);

    const id = nextId;
    nextId += 1;
    const request = { id, documents, keyHex, token: token ?? `w${id}-${now()}` };

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.warn('[cadence] persistence worker timed out; saving in-process');
        // The worker may still be mid-fsync on this batch's tmp files. They are
        // uniquely named and never renamed by the child, so the in-process
        // retry cannot collide with them; they are cleaned up as orphans.
        dropChild({ cooldown: true });
      }, batchTimeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
      pending.set(id, { resolve, timer });

      try {
        worker.postMessage(request);
      } catch (err) {
        console.warn('[cadence] could not reach persistence worker; saving in-process', err);
        dropChild({ cooldown: true });
      }
    });
  }

  function dispose() {
    disposed = true;
    dropChild({ cooldown: false });
  }

  return {
    runBatch,
    dispose,
    /** Test/diagnostic view; not part of the save path. */
    isRunning: () => child !== null,
  };
}

module.exports = {
  isAsyncPersistEnabled,
  createPersistBridge,
  DEFAULT_BATCH_TIMEOUT_MS,
  DEFAULT_RESPAWN_COOLDOWN_MS,
};
