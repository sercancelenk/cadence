/**
 * Atomic, durable write of a UTF-8 string to a file.
 *
 * Why this much ceremony for a single write?
 *   - Naïve `writeFileSync` returns when the bytes are queued in the kernel
 *     page cache, NOT when they have been persisted to the underlying
 *     storage. On macOS/Linux that delay can be 5–30 seconds.
 *   - A power loss, kernel panic, or forced reboot in that window will lose
 *     the "successful" write — exactly the failure mode the user wants to
 *     avoid ("notlarım kaybolmasın").
 *
 * What we do instead:
 *   1. Write the new content to a sibling `.tmp` file with an explicit
 *      fd open/write/fsync/close cycle. `fsync(fd)` blocks until the bytes
 *      are on durable storage.
 *   2. Atomically rename the tmp file over the target. POSIX guarantees the
 *      directory entry update is atomic, so a crash mid-rename leaves either
 *      the old file or the new file — never a torn one.
 *   3. fsync the containing directory so the rename itself survives a
 *      crash. (No-op / not supported on Windows; we swallow that error.)
 *
 * A failed `fsync` is reported as a failure and the tmp file is removed: the
 * caller must treat "could not confirm durability" as "not saved" so the
 * previous file is never assumed to be superseded.
 */

const { writeAllSync } = require('./writeAllSync.cjs');

/** @typedef {{ ok: true } | { ok: false; reason: string; error: string }} DurableWriteResult */

/**
 * @param {{ fs: typeof import('fs'); path: typeof import('path') }} deps
 * @returns {(filePath: string, text: string) => DurableWriteResult}
 */
function createDurableJsonWriter({ fs, path }) {
  return function writeJsonText(filePath, text) {
    const fail = (reason, error) => ({ ok: false, reason, error });
    let tmp;
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      tmp = `${filePath}.tmp`;
      const fd = fs.openSync(tmp, 'w');
      let fileFsyncOk = true;
      try {
        writeAllSync(fs, fd, text);
        try {
          fs.fsyncSync(fd);
        } catch (err) {
          console.error('[cadence] fsync(file) failed — refusing to commit', filePath, err);
          fileFsyncOk = false;
        }
      } finally {
        fs.closeSync(fd);
      }
      if (!fileFsyncOk) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
        return fail(
          'durability',
          'Could not confirm your data reached durable storage. Retry the save; your previous file is unchanged.',
        );
      }
      fs.renameSync(tmp, filePath);
      tmp = null;
      try {
        const dirFd = fs.openSync(path.dirname(filePath), 'r');
        try {
          fs.fsyncSync(dirFd);
        } finally {
          fs.closeSync(dirFd);
        }
      } catch {
        // Some platforms (Windows) don't allow fsync on directory fds.
        // The rename itself is still atomic; we just don't get the extra
        // crash guarantee for the directory entry.
      }
      return { ok: true };
    } catch (err) {
      if (tmp) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ignore */
        }
      }
      console.error('[cadence] failed to write', filePath, err);
      return fail('io', 'I/O error while writing data file.');
    }
  };
}

module.exports = {
  createDurableJsonWriter,
};
