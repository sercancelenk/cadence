/**
 * A ZIP writer that streams to disk, one file at a time, for backups that can hold gigabytes of images.
 *
 * Entries are STORED (images are already compressed; history is small), so nothing is held in memory but
 * the file being written and a short record per entry for the central directory. The archive is written
 * under `<file>.partial` and renamed into place by `finish()` after an fsync, so a stopped export never
 * leaves something that looks like a finished backup.
 *
 * Plain ZIP only: an archive that would need ZIP64 (65,535 entries or 4 GiB) is refused with a clear error
 * and the caller offers the folder export instead.
 */

const fs = require('fs');
const path = require('path');

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;
const ZIP_MAX_ENTRIES = 65534;
const ZIP_MAX_BYTES = 0xfffffff0;
const UTF8_FLAG = 0x0800;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function isValidEntryName(name) {
  if (typeof name !== 'string' || !name || name.length > 1024) return false;
  if (name.includes('\\') || name.includes('\0') || name.startsWith('/')) return false;
  return !name.split('/').some((segment) => segment === '..' || segment === '');
}

/**
 * @param {string} file final path of the archive
 * @param {{ maxEntries?: number }} [options] `maxEntries` exists so tests need not write 65,534 files
 */
async function createZipWriter(file, { maxEntries = ZIP_MAX_ENTRIES } = {}) {
  const partial = `${file}.partial`;
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const handle = await fs.promises.open(partial, 'w');
  const central = [];
  const seen = new Set();
  let offset = 0;
  let closed = false;
  const stamp = dosDateTime(new Date());

  const closeQuietly = async () => {
    if (closed) return;
    closed = true;
    try {
      await handle.close();
    } catch {
      /* already closed */
    }
  };

  async function write(buf) {
    let done = 0;
    while (done < buf.length) {
      const { bytesWritten } = await handle.write(buf, done, buf.length - done, null);
      done += bytesWritten;
    }
    offset += buf.length;
  }

  return {
    async add(name, bytes) {
      if (!isValidEntryName(name)) throw new Error(`Invalid entry name in backup: ${JSON.stringify(name)}`);
      if (seen.has(name)) throw new Error(`Duplicate entry in backup: ${name}`);
      if (central.length >= Math.min(maxEntries, ZIP_MAX_ENTRIES)) throw new Error('This library has too many files for a single ZIP.');
      if (bytes.length > ZIP_MAX_BYTES || offset + bytes.length + 1024 > ZIP_MAX_BYTES) {
        throw new Error('This library is too large for a single ZIP.');
      }
      seen.add(name);
      const nameBytes = Buffer.from(name, 'utf8');
      const crc = crc32(bytes);
      const local = Buffer.alloc(30 + nameBytes.length);
      local.writeUInt32LE(SIG_LOCAL, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(UTF8_FLAG, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt16LE(stamp.time, 10);
      local.writeUInt16LE(stamp.day, 12);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(bytes.length, 18);
      local.writeUInt32LE(bytes.length, 22);
      local.writeUInt16LE(nameBytes.length, 26);
      nameBytes.copy(local, 30);
      central.push({ nameBytes, crc, size: bytes.length, offset });
      await write(local);
      await write(bytes);
    },

    async finish() {
      const centralStart = offset;
      for (const e of central) {
        const rec = Buffer.alloc(46 + e.nameBytes.length);
        rec.writeUInt32LE(SIG_CENTRAL, 0);
        rec.writeUInt16LE(20, 4);
        rec.writeUInt16LE(20, 6);
        rec.writeUInt16LE(UTF8_FLAG, 8);
        rec.writeUInt16LE(0, 10);
        rec.writeUInt16LE(stamp.time, 12);
        rec.writeUInt16LE(stamp.day, 14);
        rec.writeUInt32LE(e.crc, 16);
        rec.writeUInt32LE(e.size, 20);
        rec.writeUInt32LE(e.size, 24);
        rec.writeUInt16LE(e.nameBytes.length, 28);
        rec.writeUInt32LE(e.offset, 42);
        e.nameBytes.copy(rec, 46);
        await write(rec);
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(SIG_END, 0);
      end.writeUInt16LE(central.length, 8);
      end.writeUInt16LE(central.length, 10);
      end.writeUInt32LE(offset - centralStart, 12);
      end.writeUInt32LE(centralStart, 16);
      await write(end);
      await handle.sync();
      await closeQuietly();
      await fs.promises.rename(partial, file);
      return { entries: central.length, bytes: offset };
    },

    async abort() {
      await closeQuietly();
      await fs.promises.rm(partial, { force: true });
    },
  };
}

module.exports = { createZipWriter, ZIP_MAX_ENTRIES, ZIP_MAX_BYTES, crc32 };
