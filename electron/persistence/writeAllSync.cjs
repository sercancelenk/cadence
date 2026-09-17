/**
 * The one safe way to put a whole buffer into a file descriptor.
 *
 * `fs.writeSync` is a thin wrapper around POSIX `write(2)`, which is permitted
 * to write fewer bytes than it was handed and does not retry. Node does not
 * loop for us — it returns the count and leaves the rest to the caller. A short
 * write is rare but real on large payloads, on network/virtualised filesystems,
 * and when a quota or device limit is hit mid-write.
 *
 * Ignoring the count is the dangerous part: everything downstream (fsync,
 * rename, "the write succeeded") then treats a truncated file as complete, and
 * the truncated file is what the user gets back. Since our data files are
 * encrypted envelopes, a truncated one does not merely lose its tail — it fails
 * to authenticate and reads as *unreadable*.
 *
 * Every durable write in the app goes through this loop.
 */

/**
 * @param {typeof import('fs')} fs
 * @param {number} fd
 * @param {string | Buffer} data
 * @returns {number} bytes written — always the full length, or it throws
 */
function writeAllSync(fs, fd, data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');
  let written = 0;
  while (written < buffer.length) {
    const n = fs.writeSync(fd, buffer, written, buffer.length - written, written);
    // A zero-byte write with no error means the descriptor is making no
    // progress; looping forever would hang the main process.
    if (!(n > 0)) {
      throw new Error(`short write: stalled after ${written} of ${buffer.length} bytes`);
    }
    written += n;
  }
  return written;
}

module.exports = {
  writeAllSync,
};
