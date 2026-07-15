/** UTF-8 safe Base64 encode/decode (browser + Node). Supports standard and URL-safe alphabets. */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Normalize whitespace / base64url (-_) into standard Base64 for atob. */
function normalizeBase64Input(input: string): string {
  let cleaned = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = cleaned.length % 4;
  if (pad === 2) cleaned += '==';
  else if (pad === 3) cleaned += '=';
  else if (pad === 1) {
    // Invalid length — leave as-is; atob will fail.
  }
  return cleaned;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Encode a Unicode string to standard Base64. */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64(bytes);
}

export type Base64DecodeResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

/** Decode standard or URL-safe Base64 (with optional whitespace) to a UTF-8 string. */
export function decodeBase64Utf8(input: string): Base64DecodeResult {
  const cleaned = normalizeBase64Input(input);
  if (!cleaned) return { ok: true, text: '' };
  try {
    const bytes = base64ToBytes(cleaned);
    return { ok: true, text: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'Invalid Base64 or the decoded bytes are not valid UTF-8.' };
  }
}
