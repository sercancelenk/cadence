/**
 * Proof, without reading a byte of content, that the workspace files on disk
 * are still exactly what this process last wrote and verified.
 *
 * The save path used to read, decrypt and parse the whole workspace three
 * times before writing it: once for the empty-overwrite guard, once for the
 * write-generation, once for the "is the existing file readable" guard. Each
 * of those answers is already known immediately after a successful save — what
 * is not known is whether anything else touched the files in the meantime.
 * A stat is enough to answer that.
 *
 * FAIL CLOSED is the whole contract. Every uncertainty — a missing file, an
 * extra file, a stat that throws, a fingerprint that was never captured —
 * returns "changed", which sends the caller back to the full read. A false
 * "unchanged" would let a stale in-memory workspace stand in for a file that
 * something else rewrote, so the checks below are deliberately strict.
 *
 * The fingerprint uses nanosecond timestamps and the inode number:
 *   - `ino` changes whenever a file is replaced via the tmp+rename that every
 *     one of our writers uses, even if the content happens to be the same size;
 *   - `ctimeNs` is maintained by the kernel on any data or metadata change and,
 *     unlike mtime, cannot be set by `utimes`;
 *   - `size` catches the ordinary case immediately.
 */

/**
 * @typedef {{ path: string; size: bigint; mtimeNs: bigint; ctimeNs: bigint; ino: bigint }} FileFingerprint
 */

/**
 * @param {typeof import('fs')} fs
 * @param {string[]} filePaths
 * @returns {FileFingerprint[] | null} null when any file could not be stat'ed
 */
function captureFileFingerprints(fs, filePaths) {
  /** @type {FileFingerprint[]} */
  const fingerprints = [];
  try {
    for (const filePath of filePaths) {
      const st = fs.statSync(filePath, { bigint: true });
      fingerprints.push({
        path: filePath,
        size: st.size,
        mtimeNs: st.mtimeNs,
        ctimeNs: st.ctimeNs,
        ino: st.ino,
      });
    }
  } catch {
    return null;
  }
  return fingerprints.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * @param {typeof import('fs')} fs
 * @param {FileFingerprint[] | null | undefined} recorded
 * @param {string[]} currentPaths the files that exist for this user right now
 * @returns {boolean} true only when every file is provably untouched
 */
function fingerprintsUnchanged(fs, recorded, currentPaths) {
  if (!Array.isArray(recorded) || recorded.length === 0) return false;

  // A shard that appeared or disappeared means someone else reorganised the
  // workspace; the recorded content no longer describes what is on disk.
  const current = captureFileFingerprints(fs, currentPaths);
  if (!current || current.length !== recorded.length) return false;

  for (let i = 0; i < recorded.length; i += 1) {
    const a = recorded[i];
    const b = current[i];
    if (
      a.path !== b.path ||
      a.size !== b.size ||
      a.mtimeNs !== b.mtimeNs ||
      a.ctimeNs !== b.ctimeNs ||
      a.ino !== b.ino
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Which of `recorded` are provably untouched, for callers that re-verify only
 * the files they just wrote. Paths not present in `recorded` are never
 * reported as unchanged.
 *
 * @param {typeof import('fs')} fs
 * @param {FileFingerprint[] | null | undefined} recorded
 * @returns {Set<string>}
 */
function unchangedPaths(fs, recorded) {
  /** @type {Set<string>} */
  const unchanged = new Set();
  if (!Array.isArray(recorded)) return unchanged;

  for (const entry of recorded) {
    const [current] = captureFileFingerprints(fs, [entry.path]) ?? [];
    if (!current) continue;
    if (
      current.size === entry.size &&
      current.mtimeNs === entry.mtimeNs &&
      current.ctimeNs === entry.ctimeNs &&
      current.ino === entry.ino
    ) {
      unchanged.add(entry.path);
    }
  }
  return unchanged;
}

module.exports = {
  captureFileFingerprints,
  fingerprintsUnchanged,
  unchangedPaths,
};
