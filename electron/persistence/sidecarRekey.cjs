/**
 * Moving the encrypted sidecars (images, note history) from one data key to another,
 * in a way that is safe to interrupt.
 *
 * The sealed files are tied to the password-derived key, so a password change or a
 * reset with recovery codes must carry them along. Doing that in place leaves a
 * window where some files are under the new key and the account record still holds
 * the old password. Instead:
 *
 *   1. `stageRekey`   writes a copy of each file sealed under the new key as `<file>.rekey`.
 *                     The live files are not touched, so a failure here changes nothing.
 *   2. (the caller commits the workspace and the account record)
 *   3. `commitStaged` swaps each copy in, after checking it opens under the new key.
 *   `discardStaged` throws the copies away if anything before the swap failed.
 *   `finalizeStaged` finishes a swap that was cut short; run it when a user signs in.
 *
 * Rules: a file that opens under neither key is never touched; a file that already opens
 * under the new key is left alone; every swap is a rename, so hardlinked snapshots keep
 * the bytes they had.
 */

const fs = require('fs');
const { isEncryptedEnvelope } = require('./dataEnvelope.cjs');

const STAGE_SUFFIX = '.rekey';

/**
 * @typedef {{ open: (text: string, key: Buffer) => Buffer | null,
 *             seal: (bytes: Buffer, key: Buffer) => string,
 *             sealPlain: boolean }} Codec
 *   `sealPlain`: also seal files that are not encrypted yet (history), instead of leaving them.
 */

function stagedPath(file) {
  return `${file}${STAGE_SUFFIX}`;
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/**
 * @param {string[]} files
 * @param {Buffer} fromKey
 * @param {Buffer} toKey
 * @param {Codec} codec
 * @param {(filePath: string, bytes: Buffer) => boolean} writeFile atomic writer
 */
function stageRekey(files, fromKey, toKey, codec, writeFile) {
  const result = { ok: true, staged: 0, unchanged: 0, unreadable: 0, failed: [] };
  for (const file of files) {
    const text = readText(file);
    if (text == null) {
      result.unreadable += 1;
      continue;
    }
    let plain;
    if (isEncryptedEnvelope(text)) {
      if (codec.open(text, toKey) != null) {
        result.unchanged += 1;
        continue;
      }
      plain = codec.open(text, fromKey);
      if (plain == null) {
        result.unreadable += 1;
        continue;
      }
    } else if (codec.sealPlain) {
      plain = Buffer.from(text, 'utf8');
    } else {
      continue;
    }
    let ok = false;
    try {
      ok = writeFile(stagedPath(file), Buffer.from(codec.seal(plain, toKey), 'utf8')) === true;
    } catch {
      ok = false;
    }
    if (ok) {
      result.staged += 1;
    } else {
      result.ok = false;
      result.failed.push(file.split(/[\\/]/).pop());
    }
  }
  return result;
}

/** Swap each staged copy in once it is shown to open under `toKey`. */
function commitStaged(files, toKey, codec) {
  const result = { ok: true, committed: 0, failed: [] };
  for (const file of files) {
    const staged = stagedPath(file);
    if (!fs.existsSync(staged)) continue;
    const text = readText(staged);
    if (text == null || codec.open(text, toKey) == null) {
      result.ok = false;
      result.failed.push(file.split(/[\\/]/).pop());
      continue;
    }
    try {
      fs.renameSync(staged, file);
      result.committed += 1;
    } catch {
      result.ok = false;
      result.failed.push(file.split(/[\\/]/).pop());
    }
  }
  return result;
}

function discardStaged(files) {
  for (const file of files) {
    try {
      fs.rmSync(stagedPath(file), { force: true });
    } catch {
      /* a leftover copy is harmless and is cleaned up at the next sign-in */
    }
  }
}

/**
 * Finish what a cut-short swap left behind, using the key the user just signed in with.
 * A copy that opens under it replaces the file; a copy whose file already opens under it
 * is stale and goes; anything else is left exactly as it is.
 */
function finalizeStaged(files, key, codec) {
  const result = { swapped: 0, dropped: 0 };
  for (const file of files) {
    const staged = stagedPath(file);
    if (!fs.existsSync(staged)) continue;
    const stagedText = readText(staged);
    if (stagedText != null && codec.open(stagedText, key) != null) {
      const liveText = readText(file);
      if (liveText != null && isEncryptedEnvelope(liveText) && codec.open(liveText, key) != null) {
        fs.rmSync(staged, { force: true });
        result.dropped += 1;
        continue;
      }
      try {
        fs.renameSync(staged, file);
        result.swapped += 1;
      } catch {
        /* retried at the next sign-in */
      }
      continue;
    }
    const liveText = readText(file);
    if (liveText != null && isEncryptedEnvelope(liveText) && codec.open(liveText, key) != null) {
      fs.rmSync(staged, { force: true });
      result.dropped += 1;
    }
  }
  return result;
}

module.exports = { STAGE_SUFFIX, stageRekey, commitStaged, discardStaged, finalizeStaged };
