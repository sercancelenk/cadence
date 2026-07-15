export type JwtDecodeResult =
  | {
      ok: true;
      header: unknown;
      payload: unknown;
      signature: string;
      headerRaw: string;
      payloadRaw: string;
    }
  | { ok: false; error: string };

function base64UrlToBytes(segment: string): Uint8Array {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function parseJsonSegment(segment: string, label: string): { ok: true; value: unknown; raw: string } | { ok: false; error: string } {
  try {
    const raw = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlToBytes(segment));
    return { ok: true, value: JSON.parse(raw) as unknown, raw };
  } catch {
    return { ok: false, error: `Could not decode JWT ${label} (invalid base64url or JSON).` };
  }
}

/**
 * Decode a JWT for display only. Does NOT verify the signature.
 */
export function decodeJwt(token: string): JwtDecodeResult {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: 'Paste a JWT to decode.' };
  const parts = trimmed.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1]) {
    return { ok: false, error: 'A JWT must have three segments separated by dots (header.payload.signature).' };
  }
  const header = parseJsonSegment(parts[0], 'header');
  if (!header.ok) return header;
  const payload = parseJsonSegment(parts[1], 'payload');
  if (!payload.ok) return payload;
  return {
    ok: true,
    header: header.value,
    payload: payload.value,
    signature: parts[2] ?? '',
    headerRaw: header.raw,
    payloadRaw: payload.raw,
  };
}
