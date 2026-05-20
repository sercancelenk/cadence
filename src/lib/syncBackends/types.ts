/**
 * Provider-agnostic interface for a sync backend.
 *
 * Background
 * ==========
 *
 * Cadence's first sync surface was LAN-only — a small HTTPS server
 * inside the Electron host, paired via a QR code. That covered the
 * "two devices on the same Wi-Fi" case extremely well, but it
 * couldn't help users who wanted their workspace to survive a laptop
 * being closed, or who needed to read their notes from a phone on
 * cellular.
 *
 * Rather than glue a Google Drive call into the existing LAN code
 * path and duplicate it again for the next provider, this interface
 * defines the **single shape** any backend has to honour. The
 * provider-specific code (auth flow, network requests, etag header
 * names, encryption envelope) lives in `lan.ts`, `gdrive.ts`, … and
 * exposes the same primitives. The auto-sync hook
 * (`useSyncAutoSync`) and the Settings UI talk to this interface,
 * not to any backend directly.
 *
 * Why discriminated unions
 * ========================
 *
 * Sync failure modes are wildly different:
 *
 *   - LAN: mixed-content (HTTPS PWA hitting an HTTP host), DNS
 *     unreachable, certificate untrusted, host paused.
 *   - Cloud: OAuth token expired, scope insufficient, monthly quota
 *     hit, ETag mismatch, blob rejected by encryption (wrong
 *     passphrase).
 *
 * Returning a single `Result<T, Error>` would collapse all of these
 * into "something went wrong", which is exactly the message users
 * hate. The unions below let the UI render specific calls to action
 * ("Reconnect", "Enter passphrase", "Check Wi-Fi") with confidence
 * that we'll never end up in a generic-error fallback in practice.
 */

export type SyncBackendId = 'lan' | 'gdrive';

export type SyncStatus =
  | 'ready'           // signed in / paired, last probe succeeded
  | 'auth-required'   // user action needed: pair, OAuth flow, re-enter password
  | 'offline'         // navigator.onLine === false, or last probe failed cleanly
  | 'error';          // probe threw — backend is misconfigured

export type SyncPullOutcome =
  | { kind: 'ok'; data: unknown; etag?: string; remoteUpdatedAt?: string }
  | { kind: 'not-modified' }
  | { kind: 'no-snapshot' }              // backend healthy but no snapshot has been uploaded yet
  | { kind: 'auth-required' }
  | { kind: 'wrong-password' }           // E2E encryption layer rejected the snapshot
  | { kind: 'unsupported-version'; version?: number }
  | { kind: 'mixed-content' }            // HTTPS page tried to hit an HTTP host
  | { kind: 'timeout' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message: string };

export type SyncPushOutcome =
  | { kind: 'ok'; etag?: string; remoteUpdatedAt?: string }
  | { kind: 'conflict'; currentEtag?: string; message?: string }
  | { kind: 'auth-required' }
  | { kind: 'too-large' }
  | { kind: 'mixed-content' }
  | { kind: 'timeout' }
  | { kind: 'http-error'; status: number; message?: string }
  | { kind: 'network-error'; message: string };

/**
 * Persisted summary of the last successful sync for the active
 * backend.
 *
 * Three distinct fingerprints
 * ---------------------------
 *
 * - `etag` — the REMOTE provider's concurrency token (LAN: SHA-256
 *   echoed by the host; Drive: the file's `version` integer). Used
 *   for `If-None-Match` / `If-Match`-style conditional requests on
 *   the wire.
 *
 * - `localFingerprint` — a hash of the local snapshot at the moment
 *   of the last successful round-trip. Used by the auto-sync hook
 *   to answer "did the user edit anything since we last synced?"
 *   WITHOUT making a network call. We can't derive this from `etag`
 *   for cloud backends because Drive's `version` field is just a
 *   monotonic counter unrelated to content.
 *
 * - `lastSyncedAt` — ISO timestamp, shown in the Settings UI as
 *   "synced 4 min ago".
 *
 * Backends own their own storage (different localStorage keys, ideally
 * — LAN uses one, Drive uses another) so multiple backends can coexist
 * without stepping on each other's records.
 */
export type SyncRecord = {
  etag?: string;
  localFingerprint?: string;
  lastSyncedAt?: string;
};

export interface SyncBackend {
  readonly id: SyncBackendId;
  /** Human-readable name for UI ("LAN host", "Google Drive"). */
  readonly displayName: string;
  /**
   * `true` means the backend serialises the snapshot through
   * `snapshotCrypto.wrapSnapshot` before upload (cloud providers).
   * `false` means transport security is sufficient (LAN runs over
   * the device-local HTTPS cert that already prevents passive
   * snooping). The Settings UI uses this to decide whether to
   * prompt for / surface an E2E passphrase.
   */
  readonly e2eEncryption: boolean;

  /** Probe whether the backend is reachable + authenticated. */
  status(): Promise<SyncStatus>;

  /**
   * Pull the remote snapshot. `priorEtag` enables `If-None-Match`
   * short-circuiting — the backend returns `not-modified` if its
   * snapshot hasn't moved since we last saw it.
   */
  pull(priorEtag?: string): Promise<SyncPullOutcome>;

  /**
   * Push the local snapshot. `ifMatchEtag` enables optimistic
   * concurrency: the backend returns `conflict` if its snapshot has
   * changed since we pulled, instead of clobbering the remote.
   */
  push(data: unknown, ifMatchEtag?: string): Promise<SyncPushOutcome>;

  /** Read the last-successful-sync record for this backend (or null). */
  getRecord(): SyncRecord | null;

  /** Persist a new sync record. Backends may merge against the existing record. */
  setRecord(record: SyncRecord): void;

  /** Short human description for the Settings card ("leeadman.local:9787", "you@gmail.com"). */
  describe(): string;
}
