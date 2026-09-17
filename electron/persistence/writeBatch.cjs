/**
 * Encrypt, stage and verify a set of workspace documents as one unit.
 *
 * This is the expensive half of a save — AES-GCM over the whole workspace plus
 * one fsync per file — and it is the half that runs in the utility process when
 * `CADENCE_ASYNC_PERSIST` is on. Both the in-process path and the worker call
 * this same function, so the two can never drift apart in what they guarantee.
 *
 * What it guarantees when it returns `ok`:
 *   - every document's bytes are on durable storage, in a tmp file;
 *   - reading those bytes back and decrypting them reproduces exactly the JSON
 *     the caller handed over (catches truncation, a half-flushed write, and
 *     encryption under the wrong key);
 *   - nothing at any target path has changed yet.
 *
 * On any failure every tmp it created is removed, so a failed batch leaves the
 * workspace byte-identical to how it found it. Committing the staged tmps is
 * deliberately not part of this: only the main process decides what becomes
 * visible.
 */

/**
 * @typedef {{ path: string; json: string }} WriteDocument
 * @typedef {{ path: string; tmp: string }} StagedDocument
 * @typedef {{ path: string; reason: string; error: string }} BatchFailure
 * @typedef {{ ok: true; staged: StagedDocument[] } | { ok: false; failure: BatchFailure }} BatchResult
 */

/**
 * @param {object} options
 * @param {WriteDocument[]} options.documents
 * @param {string} options.token unique per batch; namespaces the tmp files
 * @param {import('./stagedWrite.cjs').createStagedWriter extends (...a: any) => infer R ? R : never} options.writer
 * @param {(json: string) => string} [options.encrypt] omitted for a plaintext account
 * @param {(text: string) => string | null} [options.decrypt] required whenever `encrypt` is given
 * @param {(filePath: string) => string} options.readText
 * @returns {BatchResult}
 */
function stageWriteBatch({ documents, token, writer, encrypt, decrypt, readText }) {
  /** @type {StagedDocument[]} */
  const staged = [];

  const abort = (failure) => {
    for (const doc of staged) writer.discard(doc.tmp);
    return { ok: false, failure };
  };

  for (const { path: filePath, json } of documents) {
    let text;
    try {
      text = encrypt ? encrypt(json) : json;
    } catch (err) {
      console.error('[cadence] failed to encrypt document', filePath, err);
      return abort({
        path: filePath,
        reason: 'encrypt',
        error: 'Could not encrypt your workspace. Nothing was written.',
      });
    }

    const result = writer.stage(filePath, text, token);
    if (!result.ok) {
      return abort({ path: filePath, reason: result.reason, error: result.error });
    }
    staged.push({ path: filePath, tmp: result.tmp });

    if (!stagedBytesMatch(result.tmp, json, { encrypt, decrypt, readText })) {
      console.error('[cadence] staged document does not match what was written', filePath);
      return abort({
        path: filePath,
        reason: 'verify-failed',
        error:
          'Save verification failed: the re-read workspace does not match what was written. Nothing was changed on disk.',
      });
    }
  }

  return { ok: true, staged };
}

/**
 * Read a staged tmp back off disk and confirm it decrypts to exactly `json`.
 * Any read or decrypt failure counts as a mismatch.
 */
function stagedBytesMatch(tmp, json, { encrypt, decrypt, readText }) {
  try {
    const text = readText(tmp);
    if (!encrypt) return text === json;
    return decrypt(text) === json;
  } catch {
    return false;
  }
}

/**
 * Make a staged batch visible, in the order it was staged.
 *
 * The first rename that fails stops the batch: earlier documents stay
 * committed and the rest are discarded. Callers roll back to the pre-save
 * state on failure, which is why the base workspace file must be staged first
 * — a half-committed batch never leaves shards ahead of the base file.
 *
 * @param {StagedDocument[]} staged
 * @param {{ commit: (tmp: string, filePath: string) => { ok: boolean; reason?: string; error?: string }; discard: (tmp: string) => void }} writer
 * @returns {{ ok: true; committed: string[] } | { ok: false; committed: string[]; failure: BatchFailure }}
 */
function commitWriteBatch(staged, writer) {
  const committed = [];
  for (let i = 0; i < staged.length; i += 1) {
    const doc = staged[i];
    const result = writer.commit(doc.tmp, doc.path);
    if (!result.ok) {
      // From the one that failed onwards, including it: `discard` is
      // idempotent, so it does not matter whether the writer already cleaned
      // up after its own failed rename.
      for (const rest of staged.slice(i)) writer.discard(rest.tmp);
      return {
        ok: false,
        committed,
        failure: {
          path: doc.path,
          reason: result.reason ?? 'io',
          error: result.error ?? 'I/O error while writing data file.',
        },
      };
    }
    committed.push(doc.path);
  }
  return { ok: true, committed };
}

/** Drop a staged batch that will never be committed. */
function discardWriteBatch(staged, writer) {
  for (const doc of staged) writer.discard(doc.tmp);
}

module.exports = {
  stageWriteBatch,
  commitWriteBatch,
  discardWriteBatch,
};
