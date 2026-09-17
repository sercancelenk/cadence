/**
 * The request/response contract between the main process and the persistence
 * utility process, and the handler that fulfils it.
 *
 * Kept free of any Electron import so it can be exercised directly: the worker
 * entry point (`persistWorker.cjs`) is a few lines of message plumbing around
 * `handlePersistRequest`, and the main-side bridge speaks the same shapes.
 *
 * The key travels to the child as hex on a request. That is not a weakening:
 * the utility process is a child of our own main process with no network
 * access, the key is already in main's memory, and the alternative — shipping
 * plaintext workspace bytes for the child to write — would be strictly worse.
 * The key is zeroed as soon as the batch finishes.
 */

const fs = require('node:fs');
const nodePath = require('node:path');
const { createStagedWriter } = require('./stagedWrite.cjs');
const { stageWriteBatch } = require('./writeBatch.cjs');
const { encryptPayload, decryptPayload } = require('./dataEnvelope.cjs');

/**
 * @typedef {{ id: number; documents: { path: string; json: string }[]; token: string; keyHex: string | null }} PersistRequest
 * @typedef {{ id: number; ok: true; staged: { path: string; tmp: string }[] }
 *          | { id: number; ok: false; failure: { path: string; reason: string; error: string } }} PersistResponse
 */

/**
 * Stage (encrypt + write + fsync + verify) one batch. Never throws: an
 * exception here would take the worker down mid-save, and the main process
 * would have to guess what reached disk.
 *
 * @param {PersistRequest} request
 * @param {{ writer?: ReturnType<typeof createStagedWriter>; readText?: (p: string) => string }} [deps]
 * @returns {PersistResponse}
 */
function handlePersistRequest(request, deps = {}) {
  const { id, documents, token, keyHex } = request;
  const writer = deps.writer ?? createStagedWriter({ fs, path: nodePath });
  const readText = deps.readText ?? ((filePath) => fs.readFileSync(filePath, 'utf8'));

  let key = null;
  try {
    key = keyHex ? Buffer.from(keyHex, 'hex') : null;
    if (keyHex && (!key || key.length !== 32)) {
      return {
        id,
        ok: false,
        failure: {
          path: documents[0]?.path ?? '',
          reason: 'no-key',
          error: 'The persistence worker received an unusable encryption key.',
        },
      };
    }

    const result = stageWriteBatch({
      documents,
      token,
      writer,
      readText,
      ...(key
        ? {
            encrypt: (json) => encryptPayload(json, key),
            decrypt: (text) => decryptPayload(text, key),
          }
        : {}),
    });

    return result.ok
      ? { id, ok: true, staged: result.staged }
      : { id, ok: false, failure: result.failure };
  } catch (err) {
    console.error('[cadence] persistence worker batch threw', err);
    return {
      id,
      ok: false,
      failure: {
        path: documents?.[0]?.path ?? '',
        reason: 'worker-error',
        error: 'The persistence worker failed. Nothing was written.',
      },
    };
  } finally {
    // The key lives no longer in the child than the batch that needed it.
    if (key) key.fill(0);
  }
}

module.exports = {
  handlePersistRequest,
};
