/** Tarayıcı / geliştirme ortamı için parola özeti (Electron ana süreçten farklı; yalnızca dev hesaplarında kullanılır). */
// @ts-nocheck


function toB64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export async function pbkdf2HashPassword(password: string): Promise<{ saltB64: string; hashB64: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return { saltB64: toB64(salt.buffer), hashB64: toB64(bits) };
}

export async function pbkdf2VerifyPassword(password: string, saltB64: string, hashB64: string): Promise<boolean> {
  const salt = new Uint8Array(fromB64(saltB64));
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  const want = new Uint8Array(fromB64(hashB64));
  const got = new Uint8Array(bits);
  if (want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ got[i];
  return diff === 0;
}
