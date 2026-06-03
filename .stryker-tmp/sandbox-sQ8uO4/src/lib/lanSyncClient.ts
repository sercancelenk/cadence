/**
 * LAN sync client — persistence + helpers shared between the Settings UI
 * and the app-level auto-pull hook.
 *
 * Design notes
 * ============
 *
 * 1. We persist pair info in `localStorage` (per-origin), not in the
 *    encrypted app data file. The pair token is sensitive but it only
 *    grants access to the host you've already approved, and the device
 *    that loaded this PWA is implicitly trusted. Encrypting it inside
 *    the app data file would defeat the purpose (we'd need to be
 *    unlocked to even know we can sync).
 *
 * 2. We only store ONE pair at a time. Power users syncing with more
 *    than one host can re-pair manually. Keeping the model "one host
 *    per device" prevents a class of UX bugs around "which host did I
 *    just push to?".
 *
 * 3. ETag tracking is opt-in but on by default — every successful
 *    pull/push updates `etag`, and subsequent calls send it back
 *    (`If-None-Match` on GET, `If-Match` on POST) so the host can
 *    cheaply return 304 or refuse a stale push.
 */
// @ts-nocheck


const STORAGE_KEY = 'cadence.lanSync.pair.v1';
const PAIR_QUERY_PARAM = 'pair';

export interface LanSyncPair {
  url: string;
  token: string;
  etag?: string;
  /**
   * Fingerprint of local data at the last successful sync. Used by the
   * provider-agnostic auto-sync hook to detect "dirty since last push"
   * INDEPENDENTLY of whatever scheme the remote uses for its etag. For
   * LAN the two are likely identical (both are content hashes), but
   * keeping them separate avoids cross-coupling.
   */
  localFingerprint?: string;
  /** ISO timestamp of the last successful pull or push. */
  lastSyncedAt?: string;
  /** ISO timestamp when this pair was first stored. */
  pairedAt: string;
}

/**
 * Read the saved pair, or `null` if this browser hasn't paired yet.
 * Tolerates corrupt JSON — we don't want a single bad write to brick
 * sync forever; just discard and let the user re-pair.
 */
export function loadPair(): LanSyncPair | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LanSyncPair> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string') return null;
    return {
      url: parsed.url,
      token: parsed.token,
      etag: typeof parsed.etag === 'string' ? parsed.etag : undefined,
      localFingerprint:
        typeof parsed.localFingerprint === 'string' ? parsed.localFingerprint : undefined,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : undefined,
      pairedAt: typeof parsed.pairedAt === 'string' ? parsed.pairedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Persist a pair. We don't validate — that's the caller's job. We do
 * stamp `pairedAt` if it's missing, so the host card can always show
 * "paired N days ago" later.
 */
export function savePair(pair: Partial<LanSyncPair> & Pick<LanSyncPair, 'url' | 'token'>): LanSyncPair {
  const existing = loadPair();
  const merged: LanSyncPair = {
    url: pair.url,
    token: pair.token,
    etag: pair.etag ?? existing?.etag,
    localFingerprint: pair.localFingerprint ?? existing?.localFingerprint,
    lastSyncedAt: pair.lastSyncedAt ?? existing?.lastSyncedAt,
    pairedAt: pair.pairedAt ?? existing?.pairedAt ?? new Date().toISOString(),
  };
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // localStorage can throw QuotaExceededError or be disabled in
      // private mode. We swallow because a non-persisted pair is still
      // useful for the current session.
    }
  }
  return merged;
}

/** Remove the saved pair (manual disconnect from Settings). */
export function clearPair() {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* swallow */
    }
  }
}

/**
 * Update just the ETag and `lastSyncedAt` after a successful round-trip.
 * Returns the new merged pair so callers can immediately reflect it
 * in React state without re-reading localStorage.
 */
export function recordSync(etag: string | undefined, lastSyncedAt = new Date().toISOString()): LanSyncPair | null {
  const existing = loadPair();
  if (!existing) return null;
  return savePair({ ...existing, etag, lastSyncedAt });
}

/**
 * Accepts the common ways a user might type a host URL and returns a
 * canonical form, or `''` if it doesn't look usable.
 *
 *   "192.168.1.5"            → "https://192.168.1.5:9787"
 *   "192.168.1.5:9787"       → "https://192.168.1.5:9787"
 *   "https://192.168.1.5"    → "https://192.168.1.5:9787"
 *   "http://192.168.1.5:9787/" → kept as http (legacy peers)
 *   "leeadman.local"         → "https://leeadman.local:9787"
 *
 * The default protocol is HTTPS (matches the cert-protected sync
 * server). Anything starting with `http://` is preserved verbatim so
 * a pre-HTTPS peer can still be reached during the transition window,
 * but new pairings default to https.
 *
 * The default port matches the host's `SYNC_DEFAULT_PORT`. We mirror
 * this constant in code rather than importing from `electron/` because
 * the PWA bundle doesn't have access to Electron files.
 */
export const SYNC_DEFAULT_PORT = 9787;

export function normalizeHostUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const withProto = trimmed.match(/^https?:\/\//i) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withProto);
    if (!u.port) u.port = String(SYNC_DEFAULT_PORT);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/**
 * Build the QR payload the host card shows. We deliberately encode it
 * as a full URL so the mobile camera app can open it directly — that's
 * the magic UX moment.
 *
 * The URL lives on the host's own LAN address (e.g.
 * `http://192.168.1.5:9787/?pair=<base64url(token)>`), which means
 * when the mobile browser opens it:
 *   1. It loads the PWA bundle served by the host (no mixed-content
 *      issue: both pages are http://).
 *   2. The PWA reads `?pair=` on boot, decodes the token, and pairs
 *      against `window.location.origin` — which IS the host. No
 *      typing required.
 */
export function buildPairUrl(hostUrl: string, token: string, basePath = '/'): string {
  const cleanHost = normalizeHostUrl(hostUrl);
  if (!cleanHost) return '';
  const encoded = toBase64Url(token);
  const path = basePath.startsWith('/') ? basePath : `/${basePath}`;
  return `${cleanHost}${path}?${PAIR_QUERY_PARAM}=${encoded}`;
}

/**
 * Inspect the current page URL for a `?pair=` parameter. If present,
 * decode the token and return the pair info, paired against
 * `window.location.origin`. The intent is for callers to invoke this
 * once on app start and, if non-null, persist the pair + remove the
 * param from the URL so a reload doesn't keep showing the QR
 * confirmation banner.
 */
export function readPairFromUrl(): { url: string; token: string } | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = params.get(PAIR_QUERY_PARAM);
  if (!raw) return null;
  const token = fromBase64Url(raw);
  if (!token) return null;
  // The host bundled the PWA at its own origin, so origin === host URL.
  // For non-mobile users hitting `https://cadence.app/?pair=...` we just
  // store this as a placeholder — the UI will reject it as mixed-content
  // if the page is HTTPS and the host is HTTP, which is the right
  // failure mode.
  return { url: window.location.origin, token };
}

/**
 * Remove the `?pair=` parameter from the URL bar without reloading the
 * page. Browsers without `history.replaceState` (very old) just keep
 * the param; not worth crashing over.
 */
export function stripPairFromUrl() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(PAIR_QUERY_PARAM)) return;
    url.searchParams.delete(PAIR_QUERY_PARAM);
    const search = url.searchParams.toString();
    const next = `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
    window.history.replaceState(window.history.state, '', next);
  } catch {
    /* swallow */
  }
}

/**
 * Compute the ETag the host *would* return for our current local data,
 * if we asked it to GET right now. We mirror the host's formula
 * exactly:
 *
 *   etag = `"` + sha256(JSON.stringify({ ok: true, data })).slice(0, 16) + `"`
 *
 * The point is to compare against `pair.etag` (what the host last
 * confirmed it had) without making a network round-trip — this is how
 * the auto-sync hook decides "do I have local changes the host hasn't
 * seen yet?".
 *
 * Caveat: `JSON.stringify` doesn't guarantee key order across runtimes
 * in the abstract, but ECMAScript 2015+ defines insertion-order
 * iteration for own string-keyed properties on plain objects, and
 * both V8 (Electron + Chromium-based browsers) and JavaScriptCore
 * (Safari) honour that. The host and client share the same logical
 * shape (`{ ok: true, data: <AppData> }`) and re-serialize through
 * the same JS engine on the round-trip, so the bytes match in
 * practice. If we ever see a false-positive dirty (no real change but
 * etag mismatch), the cost is one no-op push that returns the same
 * etag back — no data loss, no extra prompts.
 */
export async function computeLocalEtag(data: unknown): Promise<string> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    // Pure-Node fallback (Electron renderer always has subtle, but
    // tests / SSR might not). Returning an unstable string here is
    // fine because the auto-sync hook also gates on `pair.etag` being
    // non-empty.
    return '"unavailable"';
  }
  const json = JSON.stringify({ ok: true, data });
  const buf = new TextEncoder().encode(json);
  const hash = await window.crypto.subtle.digest('SHA-256', buf);
  const bytes = Array.from(new Uint8Array(hash));
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `"${hex.slice(0, 16)}"`;
}

function toBase64Url(s: string): string {
  if (typeof window === 'undefined') return '';
  const b64 = window.btoa(unescape(encodeURIComponent(s)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const padded = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    const decoded = window.atob(padded + pad);
    return decodeURIComponent(escape(decoded));
  } catch {
    return '';
  }
}

/**
 * Human-readable "synced 3 min ago" / "synced just now" formatter.
 * Returns `''` when there's nothing to show (never synced).
 */
export function formatRelativeSync(isoTs: string | undefined, now = Date.now()): string {
  if (!isoTs) return '';
  const t = Date.parse(isoTs);
  if (Number.isNaN(t)) return '';
  const diff = Math.max(0, now - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

/* ------------------------------------------------------------------ */
/* Network helpers — separated so React hooks can call them without
 * pulling in any UI dependencies. They return discriminated unions so
 * the caller can decide which user-facing message to show. */
/* ------------------------------------------------------------------ */

export type PullOutcome =
  | { kind: 'ok'; data: unknown; etag?: string }
  | { kind: 'not-modified' }
  | { kind: 'unauthorised' }
  | { kind: 'no-session' }
  | { kind: 'mixed-content' }
  | { kind: 'timeout' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message: string };

export type PushOutcome =
  | { kind: 'ok'; etag?: string }
  | { kind: 'conflict'; currentEtag?: string; message?: string }
  | { kind: 'unauthorised' }
  | { kind: 'too-large' }
  | { kind: 'mixed-content' }
  | { kind: 'timeout' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message: string };

function isMixedContentBlocked(hostUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  return hostUrl.startsWith('http://');
}

function fetchWithTimeout(input: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(input, { ...init, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

/**
 * Fetch a snapshot from the host. If `priorEtag` is provided we send
 * `If-None-Match` and treat a 304 as "nothing changed" — the caller
 * should then keep using its local data unchanged.
 */
export async function pullSnapshot(
  hostUrl: string,
  token: string,
  priorEtag?: string,
  timeoutMs = 12_000,
): Promise<PullOutcome> {
  if (isMixedContentBlocked(hostUrl)) return { kind: 'mixed-content' };

  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (priorEtag) headers['If-None-Match'] = priorEtag;

  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${hostUrl}/v1/snapshot`, { method: 'GET', headers }, timeoutMs);
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }

  if (resp.status === 304) return { kind: 'not-modified' };
  if (resp.status === 401) return { kind: 'unauthorised' };
  if (resp.status === 503) return { kind: 'no-session' };
  if (!resp.ok) {
    let message: string | undefined;
    try {
      const j = await resp.json();
      message = j?.error;
    } catch {
      /* swallow */
    }
    return { kind: 'http-error', status: resp.status, message };
  }

  const etag = resp.headers.get('ETag') ?? undefined;
  try {
    const json = await resp.json();
    const data = json?.data;
    if (!data || typeof data !== 'object') {
      return { kind: 'http-error', status: resp.status, message: 'host returned no data' };
    }
    return { kind: 'ok', data, etag: etag ?? json?.etag };
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Push a snapshot to the host. If `priorEtag` is provided we send
 * `If-Match` — the host returns 412 if its current snapshot has moved
 * on since we last pulled, which lets us prompt the user before
 * overwriting newer changes.
 */
export async function pushSnapshot(
  hostUrl: string,
  token: string,
  data: unknown,
  priorEtag?: string,
  timeoutMs = 15_000,
): Promise<PushOutcome> {
  if (isMixedContentBlocked(hostUrl)) return { kind: 'mixed-content' };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (priorEtag) headers['If-Match'] = priorEtag;

  let resp: Response;
  try {
    resp = await fetchWithTimeout(
      `${hostUrl}/v1/snapshot`,
      { method: 'POST', headers, body: JSON.stringify({ data }) },
      timeoutMs,
    );
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return { kind: 'timeout' };
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }

  if (resp.status === 401) return { kind: 'unauthorised' };
  if (resp.status === 413) return { kind: 'too-large' };
  if (resp.status === 412) {
    let currentEtag: string | undefined;
    let message: string | undefined;
    try {
      const j = await resp.json();
      currentEtag = j?.currentEtag;
      message = j?.error;
    } catch {
      /* swallow */
    }
    return { kind: 'conflict', currentEtag: currentEtag ?? resp.headers.get('ETag') ?? undefined, message };
  }
  if (!resp.ok) {
    let message: string | undefined;
    try {
      const j = await resp.json();
      message = j?.error;
    } catch {
      /* swallow */
    }
    return { kind: 'http-error', status: resp.status, message };
  }

  const etag = resp.headers.get('ETag') ?? undefined;
  let bodyEtag: string | undefined;
  try {
    const j = await resp.json();
    bodyEtag = j?.etag;
  } catch {
    /* swallow */
  }
  return { kind: 'ok', etag: etag ?? bodyEtag };
}

/* ------------------------------------------------------------------ */
/* Attachment sidecar sync (LAN host disk ↔ client Electron/IDB)       */
/* ------------------------------------------------------------------ */

export async function fetchAttachmentManifest(
  hostUrl: string,
  token: string,
  timeoutMs = 12_000,
): Promise<string[]> {
  if (isMixedContentBlocked(hostUrl)) return [];
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${hostUrl}/v1/attachments/manifest`, { method: 'GET', headers }, timeoutMs);
  } catch {
    return [];
  }
  if (!resp.ok) return [];
  try {
    const json = await resp.json();
    return Array.isArray(json?.ids)
      ? json.ids.filter((x: unknown): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

export async function downloadAttachment(
  hostUrl: string,
  token: string,
  attachmentId: string,
  timeoutMs = 20_000,
): Promise<Blob | null> {
  if (isMixedContentBlocked(hostUrl)) return null;
  const id = encodeURIComponent(attachmentId);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  let resp: Response;
  try {
    resp = await fetchWithTimeout(`${hostUrl}/v1/attachments/${id}`, { method: 'GET', headers }, timeoutMs);
  } catch {
    return null;
  }
  if (!resp.ok) return null;
  try {
    return await resp.blob();
  } catch {
    return null;
  }
}

export async function uploadAttachment(
  hostUrl: string,
  token: string,
  attachmentId: string,
  blob: Blob,
  timeoutMs = 25_000,
): Promise<boolean> {
  if (isMixedContentBlocked(hostUrl)) return false;
  const id = encodeURIComponent(attachmentId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': blob.type || 'application/octet-stream',
  };
  let resp: Response;
  try {
    resp = await fetchWithTimeout(
      `${hostUrl}/v1/attachments/${id}`,
      { method: 'POST', headers, body: blob },
      timeoutMs,
    );
  } catch {
    return false;
  }
  if (!resp.ok) return false;
  try {
    const json = await resp.json();
    return json?.ok !== false;
  } catch {
    return resp.ok;
  }
}
