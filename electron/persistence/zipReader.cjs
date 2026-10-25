/**
 * Reads a backup ZIP from disk without loading it whole: the central directory is read once, and an
 * entry is read (and inflated) only when asked for.
 *
 * Accepts STORED entries (what Cadence writes) and DEFLATE ones (what the operating system's "Compress"
 * command makes when someone zips an older backup folder). Everything else is refused with a plain
 * message. An archive is untrusted input, so: names that could leave the folder are left out, a duplicate
 * name is an error (it could shadow `data.json`), sizes are checked before and after inflating, and every
 * entry must match its checksum.
 */

const fs = require('fs');
const zlib = require('zlib');
const { crc32 } = require('./zipWriter.cjs');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const DEFAULT_MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 200000;
const DEFAULT_MAX_TOTAL_BYTES = 16 * 1024 * 1024 * 1024;
/** Deflate cannot expand more than about 1032:1; allow a margin, and a small constant for tiny entries. */
const MAX_DEFLATE_RATIO = 1100;
const DATA_FILE = 'data.json';

/** Ignore system metadata and anything that could leave the backup folder. */
function isSafeEntryName(name) {
  if (!name || name.includes('\\') || name.includes('\0')) return false;
  if (name.startsWith('/') || name.includes('../') || name.endsWith('/..') || name === '..') return false;
  if (name.startsWith('__MACOSX/') || name.includes('/__MACOSX/')) return false;
  if (name.startsWith('.')) return false;
  return true;
}

/** `data.json` at the top, or inside the single top-level folder a zipped backup folder lives in. */
function resolveBundleRoot(names) {
  const safe = names.filter(isSafeEntryName);
  if (safe.includes(DATA_FILE)) return '';
  const candidates = new Set();
  for (const p of safe) {
    if (p.endsWith(`/${DATA_FILE}`)) {
      const prefix = p.slice(0, -`/${DATA_FILE}`.length);
      if (prefix && !prefix.includes('/')) candidates.add(prefix);
    }
  }
  return candidates.size === 1 ? `${[...candidates][0]}/` : '';
}

async function readAt(handle, position, length) {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const { bytesRead } = await handle.read(buf, done, length - done, position + done);
    if (bytesRead === 0) break;
    done += bytesRead;
  }
  return done === length ? buf : buf.subarray(0, done);
}

/**
 * @param {string} file
 * @param {{ maxEntryBytes?: number, maxEntries?: number, maxTotalBytes?: number }} [limits]
 */
async function openZip(file, limits = {}) {
  const maxEntryBytes = limits.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES;
  const maxEntries = limits.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = limits.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size: fileSize } = await handle.stat();
    if (fileSize < 22) throw new Error('Not a valid ZIP archive.');
    const tailLen = Math.min(fileSize, 65557);
    const tail = await readAt(handle, fileSize - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i -= 1) {
      if (tail.readUInt32LE(i) === SIG_END) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('Not a valid ZIP archive.');
    const count = tail.readUInt16LE(eocd + 10);
    const centralSize = tail.readUInt32LE(eocd + 12);
    const centralOffset = tail.readUInt32LE(eocd + 16);
    if (count === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
      throw new Error('This ZIP is too large (ZIP64). Use a backup folder instead.');
    }
    if (count > maxEntries) throw new Error('This backup has too many files.');
    if (centralOffset + centralSize > fileSize) throw new Error('ZIP central directory is corrupt.');

    const central = await readAt(handle, centralOffset, centralSize);
    const byName = new Map();
    const seen = new Set();
    /** Where each entry's bytes sit, to make sure no two entries share any. */
    const extents = [];
    let totalBytes = 0;
    let ptr = 0;
    for (let i = 0; i < count; i += 1) {
      if (ptr + 46 > central.length || central.readUInt32LE(ptr) !== SIG_CENTRAL) {
        throw new Error('ZIP central directory is corrupt.');
      }
      const flags = central.readUInt16LE(ptr + 8);
      const method = central.readUInt16LE(ptr + 10);
      const crc = central.readUInt32LE(ptr + 16);
      const compSize = central.readUInt32LE(ptr + 20);
      const size = central.readUInt32LE(ptr + 24);
      const nameLen = central.readUInt16LE(ptr + 28);
      const extraLen = central.readUInt16LE(ptr + 30);
      const commentLen = central.readUInt16LE(ptr + 32);
      const offset = central.readUInt32LE(ptr + 42);
      const name = central.toString('utf8', ptr + 46, ptr + 46 + nameLen);
      ptr += 46 + nameLen + extraLen + commentLen;

      if (name.endsWith('/')) continue;
      if (seen.has(name)) throw new Error(`ZIP contains a duplicate entry for ${name}.`);
      seen.add(name);
      if (compSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) {
        throw new Error('This ZIP is too large (ZIP64). Use a backup folder instead.');
      }
      if (flags & 1) throw new Error(`ZIP entry ${name} is password-protected; Cadence backups are not.`);
      if (method !== 0 && method !== 8) {
        throw new Error(`Unsupported ZIP compression for ${name}. Re-export the backup from Cadence.`);
      }
      if (method === 8 && size > compSize * MAX_DEFLATE_RATIO + 65536) {
        throw new Error(`ZIP entry ${name} has an inconsistent size or is corrupt.`);
      }
      totalBytes += size;
      if (totalBytes > maxTotalBytes) throw new Error('This backup is too large to import.');
      const start = offset;
      const end = offset + 30 + nameLen + compSize;
      if (end > centralOffset) throw new Error(`ZIP entry ${name} is truncated or corrupt.`);
      extents.push([start, end, name]);
      if (!isSafeEntryName(name)) continue;
      byName.set(name, { name, size, compSize, method, crc, offset });
    }
    // Overlapping entries let a few kilobytes stand for gigabytes (one deflate stream read many times).
    extents.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < extents.length; i += 1) {
      if (extents[i][0] < extents[i - 1][1]) {
        throw new Error(`ZIP entries ${extents[i - 1][2]} and ${extents[i][2]} overlap; the archive is corrupt.`);
      }
    }

    return {
      entries: [...byName.values()].map(({ name, size }) => ({ name, size })),

      async read(name) {
        const e = byName.get(name);
        if (!e) throw new Error(`Backup has no ${name}.`);
        if (e.size > maxEntryBytes) throw new Error(`${name} is too large to import.`);
        const head = await readAt(handle, e.offset, 30);
        if (head.length < 30 || head.readUInt32LE(0) !== SIG_LOCAL) throw new Error(`ZIP local header missing for ${name}.`);
        const dataStart = e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
        if (dataStart + e.compSize > fileSize) throw new Error(`ZIP entry ${name} is truncated.`);
        const raw = await readAt(handle, dataStart, e.compSize);
        if (raw.length !== e.compSize) throw new Error(`ZIP entry ${name} is truncated.`);
        let data = raw;
        if (e.method === 8) {
          try {
            data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(1, e.size) });
          } catch {
            throw new Error(`ZIP entry ${name} has an inconsistent size or is corrupt.`);
          }
        }
        if (data.length !== e.size) throw new Error(`ZIP entry ${name} has an inconsistent size.`);
        if (crc32(data) !== e.crc) throw new Error(`ZIP entry ${name} failed its checksum (corrupt backup).`);
        return data;
      },

      async close() {
        await handle.close();
      },
    };
  } catch (err) {
    await handle.close().catch(() => undefined);
    throw err;
  }
}

module.exports = { openZip, resolveBundleRoot, isSafeEntryName, DATA_FILE };
