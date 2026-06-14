/**
 * Content fingerprint for the sync layer.
 *
 * The auto-sync hook compares a hash of the local snapshot against the
 * fingerprint recorded at the last successful round-trip to answer "did the
 * user edit anything since we last synced?" WITHOUT a network call. This is
 * backend-agnostic — every `SyncBackend` (currently Google Drive) reuses it.
 *
 * The formula mirrors the historical LAN host's etag so existing records stay
 * comparable across the LAN-removal migration:
 *
 *   etag = `"` + sha256(JSON.stringify({ ok: true, data })).slice(0, 16) + `"`
 *
 * `JSON.stringify` iterates own string-keyed properties in insertion order
 * (ECMAScript 2015+), which V8 and JavaScriptCore both honour, so the bytes
 * are stable for a given logical workspace shape.
 */
export async function computeLocalEtag(data: unknown): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    // Pure-Node fallback (Electron renderer always has subtle, but tests /
    // SSR might not). Returning an unstable string here is fine because the
    // auto-sync hook also gates on the recorded fingerprint being non-empty.
    return '"unavailable"';
  }
  const json = JSON.stringify({ ok: true, data });
  const buf = new TextEncoder().encode(json);
  const hash = await window.crypto.subtle.digest('SHA-256', buf);
  const bytes = Array.from(new Uint8Array(hash));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `"${hex.slice(0, 16)}"`;
}
