/**
 * Minimal PKZIP writer/reader (compression method STORED = 0).
 * Enough for Cadence portable backups without pulling in a ZIP dependency.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(dv: DataView, off: number, v: number) {
  dv.setUint16(off, v, true);
}
function u32(dv: DataView, off: number, v: number) {
  dv.setUint32(off, v, true);
}

/** Pack files into an uncompressed ZIP archive. Paths use forward slashes. */
export function zipStorePack(files: Record<string, Uint8Array>): Uint8Array {
  const names = Object.keys(files).sort();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const name of names) {
    const data = files[name];
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const dv = new DataView(local.buffer);
    u32(dv, 0, SIG_LOCAL);
    u16(dv, 6, 0); // version
    u16(dv, 8, 0); // store
    u16(dv, 26, nameBytes.length);
    u32(dv, 14, crc);
    u32(dv, 18, data.length);
    u32(dv, 22, data.length);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    locals.push(local);

    const central = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(central.buffer);
    u32(cdv, 0, SIG_CENTRAL);
    u16(cdv, 8, 0);
    u16(cdv, 10, 0);
    u16(cdv, 28, nameBytes.length);
    u32(cdv, 16, crc);
    u32(cdv, 20, data.length);
    u32(cdv, 24, data.length);
    u32(cdv, 42, offset);
    central.set(nameBytes, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  u32(edv, 0, SIG_END);
  u16(edv, 8, names.length);
  u16(edv, 10, names.length);
  u32(edv, 12, centralSize);
  u32(edv, 16, offset);

  const total =
    locals.reduce((s, l) => s + l.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const l of locals) {
    out.set(l, pos);
    pos += l.length;
  }
  for (const c of centrals) {
    out.set(c, pos);
    pos += c.length;
  }
  out.set(end, pos);
  return out;
}

/** Unpack a STORED or DEFLATE ZIP — we only write STORE; import accepts STORE entries. */
export function zipStoreUnpack(zip: Uint8Array): Record<string, Uint8Array> {
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const out: Record<string, Uint8Array> = {};
  const len = zip.byteLength;
  if (len < 22) return out;

  // Locate end-of-central-directory (scan last 64k).
  let eocd = -1;
  const scanStart = Math.max(0, len - 65557);
  for (let i = len - 22; i >= scanStart; i--) {
    if (dv.getUint32(i, true) === SIG_END) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP archive.');

  const entryCount = dv.getUint16(eocd + 10, true);
  const centralOffset = dv.getUint32(eocd + 16, true);
  let ptr = centralOffset;

  for (let e = 0; e < entryCount; e++) {
    if (ptr + 46 > len || dv.getUint32(ptr, true) !== SIG_CENTRAL) {
      throw new Error('ZIP central directory is corrupt.');
    }
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOffset = dv.getUint32(ptr + 42, true);
    const nameBytes = zip.subarray(ptr + 46, ptr + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (name.endsWith('/')) continue;

    const lptr = localOffset;
    if (dv.getUint32(lptr, true) !== SIG_LOCAL) {
      throw new Error(`ZIP local header missing for ${name}.`);
    }
    const localNameLen = dv.getUint16(lptr + 26, true);
    const localExtraLen = dv.getUint16(lptr + 28, true);
    const dataStart = lptr + 30 + localNameLen + localExtraLen;
    const comp = zip.subarray(dataStart, dataStart + compSize);
    if (method !== 0) {
      throw new Error(`Unsupported ZIP compression for ${name}. Re-export as a Cadence portable backup.`);
    }
    out[name] = comp.slice();
  }
  return out;
}
