export type HashDigestResult = {
  md5: string;
  sha1: string;
  sha256: string;
  sha512: string;
};

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compact pure MD5 (RFC 1321) — Web Crypto does not expose MD5. */
export function md5Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const originalLen = msg.length;
  const bitLen = BigInt(originalLen) * 8n;

  // Padding: 0x80 then zeros until length ≡ 56 (mod 64), then 8-byte LE bit length
  let paddedLen = originalLen + 1;
  while (paddedLen % 64 !== 56) paddedLen += 1;
  const padded = new Uint8Array(paddedLen + 8);
  padded.set(msg);
  padded[originalLen] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen, Number(bitLen & 0xffffffffn), true);
  view.setUint32(paddedLen + 4, Number((bitLen >> 32n) & 0xffffffffn), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14,
    20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(2 ** 32 * Math.abs(Math.sin(i + 1))) >>> 0;

  const rotl = (x: number, n: number) => (x << n) | (x >>> (32 - n));

  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i]! + M[g]!) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + rotl(F, s[i]!)) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, a0, true);
  ov.setUint32(4, b0, true);
  ov.setUint32(8, c0, true);
  ov.setUint32(12, d0, true);
  return toHex(out);
}

async function subtleHex(algo: AlgorithmIdentifier, text: string): Promise<string> {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(text));
  return toHex(buf);
}

/** Compute MD5 + SHA-1/256/512 hex digests for a UTF-8 string. */
export async function digestAllHashes(text: string): Promise<HashDigestResult> {
  const [sha1, sha256, sha512] = await Promise.all([
    subtleHex('SHA-1', text),
    subtleHex('SHA-256', text),
    subtleHex('SHA-512', text),
  ]);
  return { md5: md5Hex(text), sha1, sha256, sha512 };
}
