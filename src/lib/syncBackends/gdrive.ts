/**
 * Google Drive sync backend.
 *
 * Storage model
 * =============
 *
 * One file in the Drive `appdata` folder, always named
 * `snapshot.cadence`. The file is opaque ciphertext produced by
 * `snapshotCrypto.wrapSnapshot` — Google sees a 1-2 MB binary blob
 * and nothing else.
 *
 * Why `appdata`
 * -------------
 *
 * The `appDataFolder` scope (https://developers.google.com/drive/api/guides/appdata)
 * gives each app its own per-user folder that is:
 *
 *   - Invisible in the user's Drive UI (no clutter).
 *   - Inaccessible to other apps (even other apps the user uses).
 *   - Counted against the user's Drive quota (so cost-free for us).
 *   - Survives a `drive.file`-scope app being uninstalled (so the
 *     user can reinstall Cadence and keep their backup).
 *
 * It does NOT support folder-based sharing — which is exactly what we
 * want for a private backup. Workspace/team sharing happens through
 * the LAN backend or, future, a `drive.file`-scoped variant.
 *
 * Concurrency
 * ===========
 *
 * Drive v3 returns a `version` field on every file (monotonic counter
 * bumped on each write — including content updates). We use it as our
 * etag analogue:
 *
 *   - `pull(priorEtag)`: GET file metadata. If `version === priorEtag`
 *     short-circuit to `not-modified` (saves a content download AND
 *     the PBKDF2 decrypt cost).
 *   - `push(data, ifMatchEtag)`: GET file metadata first. If the
 *     server `version > ifMatchEtag`, someone else pushed since we
 *     last pulled → return `conflict`. Otherwise PATCH the content
 *     and use the new `version` as the etag for the next round.
 *
 * The 2-call push isn't optimal but it's the most predictable way to
 * get optimistic concurrency over the Drive REST API (true ETag
 * headers are inconsistently enforced for media uploads).
 */

import { wrapSnapshot, unwrapSnapshot } from '../snapshotCrypto';
import { getSyncPassphrase } from '../syncSession';
import {
  clearStoredTokens,
  getValidAccessToken,
  loadStoredTokens,
  isClientConfigured,
} from './gdriveAuth';
import type {
  SyncBackend,
  SyncPullOutcome,
  SyncPushOutcome,
  SyncRecord,
  SyncStatus,
} from './types';

const SNAPSHOT_NAME = 'snapshot.cadence';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const RECORD_KEY = 'cadence.sync.gdrive.record.v1';

/* ------------------------------------------------------------------ */
/* Retry policy                                                        */
/* ------------------------------------------------------------------ */

/**
 * Transient-failure retry policy for Drive REST calls.
 *
 * We retry on:
 *   - Network errors (`fetch` rejection — DNS blip, brief disconnect,
 *     TLS hiccup). These are by far the most common.
 *   - HTTP 429 (rate-limit) and 5xx (server transient). Both are
 *     defined by Google as safely retryable.
 *
 * We do NOT retry on:
 *   - 4xx other than 429. These are deterministic — retrying would
 *     just burn the user's API quota for the same answer.
 *   - 401. The caller maps that to `auth-required` and the UI prompts
 *     for re-auth. A blind retry would be confusing.
 *
 * Backoff is exponential with full jitter (AWS-style): the gap is a
 * uniform random in `[0, base*2^attempt]`. This avoids "thundering
 * herd" if many devices fail at the same moment (e.g. Drive partial
 * outage), without making any one device wait much longer than needed.
 */
const RETRY_MAX_ATTEMPTS = 3; // initial + 2 retries
const RETRY_BASE_DELAY_MS = 250;

/**
 * Test seam: under Vitest we collapse all retry delays to ~zero so the
 * "transient failure" test cases run in milliseconds rather than
 * seconds. The constant remains untouched in production builds (Vite
 * tree-shakes the env check via dead-code elimination on the literal).
 */
function effectiveBaseDelayMs(): number {
  if (typeof process !== 'undefined' && process.env && process.env.VITEST) return 0;
  return RETRY_BASE_DELAY_MS;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * Wrap a `fetch` call with retry + exponential backoff. The fetcher
 * is a closure so each retry can build a fresh `Request` (avoids
 * "body already consumed" issues if it ever streams the body).
 *
 * Returns the LAST Response — caller treats it as authoritative.
 * Throws only if every attempt threw at the network layer.
 */
async function fetchWithRetry(
  fetcher: () => Promise<Response>,
  opts: { maxAttempts?: number } = {},
): Promise<Response> {
  const maxAttempts = opts.maxAttempts ?? RETRY_MAX_ATTEMPTS;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const resp = await fetcher();
      if (!isRetryableStatus(resp.status)) return resp;
      // Retryable — try again unless this was the last attempt.
      if (attempt === maxAttempts - 1) return resp;
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts - 1) throw err;
    }
    const cap = effectiveBaseDelayMs() * Math.pow(2, attempt);
    await sleep(Math.random() * cap);
  }
  // Unreachable — loop always returns or throws on its last iteration.
  throw lastError ?? new Error('fetchWithRetry exhausted');
}

type DriveFile = {
  id: string;
  name: string;
  version: string; // Drive returns it as a string; we treat it as opaque
  modifiedTime?: string;
  size?: string;
  md5Checksum?: string;
};

export function createGDriveBackend(): SyncBackend | null {
  if (!isClientConfigured()) return null;
  if (!loadStoredTokens()) return null;
  return {
    id: 'gdrive',
    displayName: 'Google Drive',
    e2eEncryption: true,

    async status(): Promise<SyncStatus> {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
      const token = await getValidAccessToken();
      if (!token) return 'auth-required';
      return 'ready';
    },

    async pull(priorEtag) {
      const passphrase = getSyncPassphrase();
      if (!passphrase) return { kind: 'auth-required' };

      const tokenResult = await getValidAccessToken();
      if (!tokenResult) return { kind: 'auth-required' };

      const fileResult = await findSnapshotFile(tokenResult);
      if (fileResult.kind !== 'ok') return mapFileLookup(fileResult);
      const file = fileResult.file;
      if (!file) return { kind: 'no-snapshot' };

      if (priorEtag && priorEtag === file.version) {
        return { kind: 'not-modified' };
      }

      const blob = await downloadSnapshotContent(tokenResult, file.id);
      if (blob.kind !== 'ok') return mapDownload(blob);

      const unwrapped = await unwrapSnapshot(blob.bytes, passphrase);
      switch (unwrapped.kind) {
        case 'ok':
          return {
            kind: 'ok',
            data: unwrapped.data,
            etag: file.version,
            remoteUpdatedAt: file.modifiedTime,
          };
        case 'wrong-password':
          return { kind: 'wrong-password' };
        case 'not-snapshot':
        case 'corrupt':
          // The remote has bytes that aren't a Cadence snapshot. We
          // treat this the same as "no snapshot" for the auto-sync
          // hook: it's safe to push our local data and overwrite.
          return { kind: 'no-snapshot' };
        case 'unsupported-version':
        case 'unsupported-kdf':
          return { kind: 'unsupported-version', version: unwrapped.kind === 'unsupported-version' ? unwrapped.version : undefined };
      }
    },

    async push(data, ifMatchEtag) {
      const passphrase = getSyncPassphrase();
      if (!passphrase) return { kind: 'auth-required' };

      const token = await getValidAccessToken();
      if (!token) return { kind: 'auth-required' };

      // Probe current state so we can detect "someone else moved
      // since you pulled" before spending CPU on the encrypt step.
      const fileResult = await findSnapshotFile(token);
      if (fileResult.kind === 'auth-required') return { kind: 'auth-required' };
      if (fileResult.kind === 'network-error') return { kind: 'network-error', message: fileResult.message ?? '' };
      if (fileResult.kind === 'http-error')
        return { kind: 'http-error', status: fileResult.status ?? 0, message: fileResult.message };

      const existing = fileResult.file;
      if (existing && ifMatchEtag && existing.version !== ifMatchEtag) {
        return { kind: 'conflict', currentEtag: existing.version };
      }

      let blob: Uint8Array;
      try {
        blob = await wrapSnapshot(data, passphrase);
      } catch (err) {
        return {
          kind: 'http-error',
          status: 0,
          message: err instanceof Error ? err.message : 'encryption failed',
        };
      }

      const uploadResult = existing
        ? await replaceSnapshotContent(token, existing.id, blob)
        : await createSnapshotFile(token, blob);
      if (uploadResult.kind !== 'ok') return mapUpload(uploadResult);
      return {
        kind: 'ok',
        etag: uploadResult.file.version,
        remoteUpdatedAt: uploadResult.file.modifiedTime,
      };
    },

    getRecord(): SyncRecord | null {
      if (typeof window === 'undefined' || !window.localStorage) return null;
      try {
        const raw = window.localStorage.getItem(RECORD_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return {
          etag: typeof parsed.etag === 'string' ? parsed.etag : undefined,
          localFingerprint:
            typeof parsed.localFingerprint === 'string' ? parsed.localFingerprint : undefined,
          lastSyncedAt: typeof parsed.lastSyncedAt === 'string' ? parsed.lastSyncedAt : undefined,
        };
      } catch {
        return null;
      }
    },

    setRecord(record) {
      if (typeof window === 'undefined' || !window.localStorage) return;
      try {
        window.localStorage.setItem(RECORD_KEY, JSON.stringify(record));
      } catch {
        /* swallow */
      }
    },

    describe(): string {
      const tokens = loadStoredTokens();
      return tokens?.email || 'Connected';
    },
  };
}

/**
 * Reset both the OAuth tokens AND the per-backend sync record. Used by
 * the "Disconnect Drive" button in Settings.
 */
export function disconnectGDrive(): void {
  clearStoredTokens();
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.removeItem(RECORD_KEY);
    } catch {
      /* swallow */
    }
  }
}

/* ------------------------------------------------------------------ */
/* Drive REST helpers                                                  */
/* ------------------------------------------------------------------ */

type FileLookupResult =
  | { kind: 'ok'; file: DriveFile | null }
  | { kind: 'auth-required' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message?: string };

async function findSnapshotFile(token: string): Promise<FileLookupResult> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name='${SNAPSHOT_NAME}' and trashed=false`,
    fields: 'files(id,name,version,modifiedTime,size,md5Checksum)',
    pageSize: '1',
  });
  let resp: Response;
  try {
    resp = await fetchWithRetry(() =>
      fetch(`${DRIVE_API}/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
  if (resp.status === 401) return { kind: 'auth-required' };
  if (!resp.ok) {
    let message: string | undefined;
    try {
      const j = await resp.json();
      message = j?.error?.message;
    } catch {
      /* swallow */
    }
    return { kind: 'http-error', status: resp.status, message };
  }
  try {
    const j = (await resp.json()) as { files?: DriveFile[] };
    return { kind: 'ok', file: j.files?.[0] ?? null };
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
}

type DownloadResult =
  | { kind: 'ok'; bytes: Uint8Array }
  | { kind: 'auth-required' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message?: string };

async function downloadSnapshotContent(token: string, fileId: string): Promise<DownloadResult> {
  let resp: Response;
  try {
    resp = await fetchWithRetry(() =>
      fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
  if (resp.status === 401) return { kind: 'auth-required' };
  if (!resp.ok) return { kind: 'http-error', status: resp.status };
  try {
    const buf = await resp.arrayBuffer();
    return { kind: 'ok', bytes: new Uint8Array(buf) };
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
}

type UploadResult =
  | { kind: 'ok'; file: DriveFile }
  | { kind: 'auth-required' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message?: string };

/**
 * Multipart upload for a brand-new snapshot file. Includes the
 * metadata that pins the file inside `appDataFolder` so the user
 * never sees it in their Drive UI.
 */
async function createSnapshotFile(token: string, body: Uint8Array): Promise<UploadResult> {
  const boundary = '----CadenceUpload' + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({
    name: SNAPSHOT_NAME,
    parents: ['appDataFolder'],
    description: 'Cadence encrypted snapshot. Do not edit.',
  });
  // Build the multipart body as bytes (text + binary) so the
  // ciphertext survives unchanged.
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const merged = new Uint8Array(head.length + body.length + tail.length);
  merged.set(head, 0);
  merged.set(body, head.length);
  merged.set(tail, head.length + body.length);

  let resp: Response;
  try {
    resp = await fetchWithRetry(() =>
      fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,version,modifiedTime,size`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: merged as unknown as BodyInit,
      }),
    );
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
  if (resp.status === 401) return { kind: 'auth-required' };
  if (!resp.ok) {
    let message: string | undefined;
    try {
      const j = await resp.json();
      message = j?.error?.message;
    } catch {
      /* swallow */
    }
    return { kind: 'http-error', status: resp.status, message };
  }
  try {
    const file = (await resp.json()) as DriveFile;
    return { kind: 'ok', file };
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * PATCH-with-media to overwrite an existing snapshot file. Simpler
 * than create — no parents (Drive forbids changing them via media
 * upload) and no metadata refresh.
 */
async function replaceSnapshotContent(token: string, fileId: string, body: Uint8Array): Promise<UploadResult> {
  let resp: Response;
  try {
    resp = await fetchWithRetry(() =>
      fetch(
        `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,name,version,modifiedTime,size`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/octet-stream',
          },
          body: body as unknown as BodyInit,
        },
      ),
    );
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
  if (resp.status === 401) return { kind: 'auth-required' };
  if (resp.status === 413) return { kind: 'http-error', status: 413, message: 'snapshot too large' };
  if (!resp.ok) {
    let message: string | undefined;
    try {
      const j = await resp.json();
      message = j?.error?.message;
    } catch {
      /* swallow */
    }
    return { kind: 'http-error', status: resp.status, message };
  }
  try {
    const file = (await resp.json()) as DriveFile;
    return { kind: 'ok', file };
  } catch (err) {
    return { kind: 'network-error', message: err instanceof Error ? err.message : String(err) };
  }
}

/* ------------------------------------------------------------------ */
/* Outcome mapping                                                     */
/* ------------------------------------------------------------------ */

function mapFileLookup(r: FileLookupResult): SyncPullOutcome {
  if (r.kind === 'ok') return { kind: 'no-snapshot' };
  if (r.kind === 'auth-required') return { kind: 'auth-required' };
  if (r.kind === 'network-error') return { kind: 'network-error', message: r.message ?? '' };
  return { kind: 'http-error', status: r.status, message: r.message };
}

function mapDownload(r: DownloadResult): SyncPullOutcome {
  if (r.kind === 'ok')
    // Should never happen — caller already handles 'ok'. Keeps the
    // exhaustive switch happy.
    return { kind: 'network-error', message: 'logic error' };
  if (r.kind === 'auth-required') return { kind: 'auth-required' };
  if (r.kind === 'network-error') return { kind: 'network-error', message: r.message ?? '' };
  return { kind: 'http-error', status: r.status, message: r.message };
}

function mapUpload(r: UploadResult): SyncPushOutcome {
  if (r.kind === 'ok')
    return { kind: 'http-error', status: 0, message: 'logic error' };
  if (r.kind === 'auth-required') return { kind: 'auth-required' };
  if (r.kind === 'network-error') return { kind: 'network-error', message: r.message ?? '' };
  if (r.status === 413) return { kind: 'too-large' };
  return { kind: 'http-error', status: r.status, message: r.message };
}
