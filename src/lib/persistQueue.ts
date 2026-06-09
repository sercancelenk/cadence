/**
 * Serializes async persist calls so a slower write cannot overwrite a newer
 * in-memory snapshot on disk (out-of-order IPC completion).
 */

export type PersistOk = { ok: true };
export type PersistFail = { ok: false; reason: string; error?: string; writeGeneration?: number };
export type PersistResult = PersistOk | PersistFail;

export type PersistQueue<T> = {
  enqueue: (payload: T) => Promise<PersistResult>;
  flush: () => Promise<void>;
  /** Drop queued results from in-flight jobs (does not cancel IPC already sent). */
  cancelPending: () => void;
  /** Latest sequence number accepted (for tests/diagnostics). */
  latestSeq: () => number;
};

export function createPersistQueue<T>(
  write: (payload: T) => Promise<PersistResult>,
): PersistQueue<T> {
  let tail: Promise<void> = Promise.resolve();
  let seq = 0;
  let latestSeq = 0;

  return {
    latestSeq: () => latestSeq,

    enqueue(payload: T): Promise<PersistResult> {
      const jobSeq = ++seq;
      latestSeq = jobSeq;

      const run = async (): Promise<PersistResult> => {
        const result = await write(payload);
        if (jobSeq < latestSeq) {
          return { ok: true };
        }
        return result;
      };

      const p = tail.then(run, run);
      tail = p.then(
        () => undefined,
        () => undefined,
      );
      return p;
    },

    async flush(): Promise<void> {
      await tail;
    },

    cancelPending(): void {
      latestSeq = ++seq;
    },
  };
}
