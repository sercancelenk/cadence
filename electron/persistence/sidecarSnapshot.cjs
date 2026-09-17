/**
 * Snapshotting the attachment and note-history sidecars into `backups/`.
 *
 * These trees used to be copied byte-for-byte before every save. A single
 * 220 KB image therefore got rewritten to disk on every autosave and again in
 * every one of the 50 retained snapshots.
 *
 * We hardlink instead. A hardlink is a second directory entry for the same
 * inode: creating one costs a directory write regardless of file size, and the
 * bytes are shared rather than duplicated.
 *
 * WHY THIS IS SAFE — the invariant it depends on:
 *   Every writer of these files writes to a temp file and `rename()`s it into
 *   place (`writeBinaryFile` in main.cjs, `writeJsonAtomic` in noteHistory.cjs).
 *   A rename swaps the directory entry and leaves the old inode untouched, so a
 *   snapshot's hardlink keeps pointing at exactly the bytes that existed when
 *   the snapshot was taken. Deleting the live file (attachment GC, prune) only
 *   drops a reference; the snapshot keeps the content alive.
 *
 *   If a writer is ever changed to modify one of these files in place, this
 *   module MUST go back to copying, or snapshots would silently mutate.
 *
 * Filesystems that cannot hardlink (cross-device targets, FAT, some network
 * mounts) fall back to a copy, so correctness never depends on link support.
 */

/**
 * Hardlink `src` to `dest`, copying instead when the filesystem refuses.
 *
 * @param {typeof import('fs')} fs
 * @param {string} src
 * @param {string} dest
 * @returns {'link' | 'copy'}
 */
function linkOrCopyFileSync(fs, src, dest) {
  try {
    fs.linkSync(src, dest);
    return 'link';
  } catch (err) {
    // EEXIST would mean we are re-snapshotting into a directory that already
    // has this entry; every other error means links are unavailable here.
    if (err && err.code === 'EEXIST') {
      fs.rmSync(dest, { force: true });
      try {
        fs.linkSync(src, dest);
        return 'link';
      } catch {
        /* fall through to copy */
      }
    }
    fs.copyFileSync(src, dest);
    return 'copy';
  }
}

/**
 * Recreate `srcDir` at `destDir`, hardlinking every file.
 *
 * Symlinks are skipped rather than followed: nothing we snapshot creates them,
 * and following one would let a link escape the tree.
 *
 * @param {typeof import('fs')} fs
 * @param {typeof import('path')} path
 * @param {string} srcDir
 * @param {string} destDir
 * @returns {{ files: number; linked: number; copied: number }}
 */
function cloneTreeSync(fs, path, srcDir, destDir) {
  const stats = { files: 0, linked: 0, copied: 0 };
  fs.mkdirSync(destDir, { recursive: true });

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      const nested = cloneTreeSync(fs, path, from, to);
      stats.files += nested.files;
      stats.linked += nested.linked;
      stats.copied += nested.copied;
    } else if (entry.isFile()) {
      const how = linkOrCopyFileSync(fs, from, to);
      stats.files += 1;
      if (how === 'link') stats.linked += 1;
      else stats.copied += 1;
    }
  }

  return stats;
}

module.exports = {
  linkOrCopyFileSync,
  cloneTreeSync,
};
