/**
 * Remembers what Settings → Backup & recovery learned about a snapshot file (counts of notes and tasks).
 *
 * Reading it means decrypting and parsing the whole file on the main thread, once per snapshot (up to 50) every
 * time the page opens. A snapshot is not edited after it is written, so the answer only has to be worked out
 * once, as long as the file's size and time are unchanged. Only readable files are kept: a file that could not
 * be opened (no key yet) must be tried again later.
 */
function createInspectCache(max = 200) {
  const entries = new Map();
  const stamp = (stat) => `${stat.size}:${stat.mtimeMs}`;
  return {
    get(file, stat) {
      const hit = entries.get(file);
      return hit && hit.stamp === stamp(stat) ? hit.info : undefined;
    },
    set(file, stat, info) {
      if (!info || !info.decryptable || !info.counts) return;
      entries.delete(file);
      entries.set(file, { stamp: stamp(stat), info });
      while (entries.size > max) entries.delete(entries.keys().next().value);
    },
  };
}

module.exports = { createInspectCache };
