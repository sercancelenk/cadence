/**
 * The durable write of `durableWrite.cjs`, split into its two halves.
 *
 * `writeJsonText` does everything in one synchronous call, which is right when
 * one process owns the whole operation. When the expensive half (encrypt,
 * write, fsync) runs in a utility process, the two halves must be separable:
 *
 *   stage()   — write the bytes to a uniquely named sibling tmp and fsync it.
 *               Nothing about the target file changes; the tmp is invisible to
 *               every reader of the workspace.
 *   commit()  — rename the tmp over the target and fsync the directory. This is
 *               the only step that makes bytes visible, and it stays in the
 *               main process so that process alone decides what lands on disk.
 *   discard() — drop a staged tmp that will never be committed.
 *
 * Splitting this way is what makes an out-of-process write safe: a staged batch
 * that loses a race is simply discarded, and a crash at any point leaves either
 * the old file or an orphan tmp — never a torn workspace.
 *
 * Tmp names carry a caller-supplied token so concurrent batches for the same
 * target never fight over one `.tmp` path (the single-process writer can rely
 * on that, an overlapping one cannot).
 */

const { writeAllSync } = require('./writeAllSync.cjs');

/** @typedef {{ ok: true; tmp: string } | { ok: false; reason: string; error: string }} StageResult */
/** @typedef {{ ok: true } | { ok: false; reason: string; error: string }} CommitResult */

const DURABILITY_ERROR =
  'Could not confirm your data reached durable storage. Retry the save; your previous file is unchanged.';

/**
 * @param {{ fs: typeof import('fs'); path: typeof import('path') }} deps
 */
function createStagedWriter({ fs, path }) {
  const fail = (reason, error) => ({ ok: false, reason, error });

  /**
   * Write `text` to a tmp beside `filePath` and block until it is durable.
   * @param {string} filePath
   * @param {string} text
   * @param {string} token unique per batch; keeps concurrent stages apart
   * @returns {StageResult}
   */
  function stage(filePath, text, token) {
    let tmp;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      tmp = `${filePath}.${token}.tmp`;
      const fd = fs.openSync(tmp, 'w');
      let fsyncOk = true;
      try {
        writeAllSync(fs, fd, text);
        try {
          fs.fsyncSync(fd);
        } catch (err) {
          console.error('[cadence] fsync(file) failed — refusing to stage', filePath, err);
          fsyncOk = false;
        }
      } finally {
        fs.closeSync(fd);
      }
      if (!fsyncOk) {
        discard(tmp);
        return fail('durability', DURABILITY_ERROR);
      }
      return { ok: true, tmp };
    } catch (err) {
      if (tmp) discard(tmp);
      console.error('[cadence] failed to stage', filePath, err);
      return fail('io', 'I/O error while writing data file.');
    }
  }

  /**
   * Make a staged tmp visible at its target path.
   * @param {string} tmp
   * @param {string} filePath
   * @returns {CommitResult}
   */
  function commit(tmp, filePath) {
    try {
      fs.renameSync(tmp, filePath);
    } catch (err) {
      console.error('[cadence] failed to commit staged write', filePath, err);
      discard(tmp);
      return fail('io', 'I/O error while writing data file.');
    }
    try {
      const dirFd = fs.openSync(path.dirname(filePath), 'r');
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Windows rejects fsync on directory fds. The rename is still atomic;
      // only the extra crash guarantee for the directory entry is missing.
    }
    return { ok: true };
  }

  /** @param {string | null | undefined} tmp */
  function discard(tmp) {
    if (!tmp) return;
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* already gone, or never created */
    }
  }

  return { stage, commit, discard };
}

module.exports = {
  createStagedWriter,
};
