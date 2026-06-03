/**
 * LAN sync as a `SyncBackend`.
 *
 * This is a thin adapter — every primitive already exists in
 * `../lanSyncClient.ts` (it predates the backend abstraction and is
 * still used directly by the Settings host card and the pair-from-URL
 * onboarding). The adapter wraps those functions so the auto-sync
 * hook and the cloud-aware Settings panel can talk to LAN through
 * the same interface they will use for Google Drive.
 *
 * What the adapter does NOT do
 * ============================
 *
 * - It does not perform end-to-end encryption (`e2eEncryption: false`).
 *   The LAN host serves over a self-signed HTTPS cert pinned by the
 *   pairing token; the payload on the wire is already protected from
 *   passive snooping. Adding a second layer of AES-GCM on top would
 *   waste CPU on every push and lock the user out if they ever lose
 *   the passphrase on a device that already had a working pair.
 *
 * - It does not auto-pair. The Settings UI (QR scan / paste host URL)
 *   and the `readPairFromUrl` boot path remain the only ways to
 *   establish a pair. `connect`/`disconnect` are intentionally not
 *   part of the interface for LAN.
 */
// @ts-nocheck


import {
  loadPair,
  pullSnapshot,
  pushSnapshot,
  recordSync,
  savePair,
  clearPair,
  type LanSyncPair,
  type PullOutcome,
  type PushOutcome,
} from '../lanSyncClient';
import type {
  SyncBackend,
  SyncPullOutcome,
  SyncPushOutcome,
  SyncRecord,
  SyncStatus,
} from './types';

/**
 * Create a LAN backend bound to the currently-persisted pair. Returns
 * null when no pair exists — the caller (typically `getActiveBackend`)
 * should treat that as "no backend selected" rather than fabricate one.
 *
 * We capture the pair lazily on each call (instead of locking the
 * instance to a single snapshot) so a Settings-driven re-pair takes
 * effect without callers having to recreate the backend.
 */
export function createLanBackend(): SyncBackend | null {
  if (!loadPair()) return null;
  return {
    id: 'lan',
    displayName: 'LAN host',
    e2eEncryption: false,

    async status(): Promise<SyncStatus> {
      const pair = loadPair();
      if (!pair) return 'auth-required';
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
      return 'ready';
    },

    async pull(priorEtag) {
      const pair = loadPair();
      if (!pair) return { kind: 'auth-required' };
      const outcome = await pullSnapshot(pair.url, pair.token, priorEtag);
      return mapPullOutcome(outcome);
    },

    async push(data, ifMatchEtag) {
      const pair = loadPair();
      if (!pair) return { kind: 'auth-required' };
      const outcome = await pushSnapshot(pair.url, pair.token, data, ifMatchEtag);
      return mapPushOutcome(outcome);
    },

    getRecord(): SyncRecord | null {
      const pair = loadPair();
      if (!pair) return null;
      return {
        etag: pair.etag,
        localFingerprint: pair.localFingerprint,
        lastSyncedAt: pair.lastSyncedAt,
      };
    },

    setRecord(record) {
      const pair = loadPair();
      if (!pair) return;
      // We merge through savePair (not recordSync) so callers can
      // clear the etag explicitly by passing undefined — recordSync
      // would have used the existing value as a fallback.
      const next: Partial<LanSyncPair> & Pick<LanSyncPair, 'url' | 'token'> = {
        url: pair.url,
        token: pair.token,
        etag: record.etag,
        localFingerprint: record.localFingerprint,
        lastSyncedAt: record.lastSyncedAt,
      };
      savePair(next);
    },

    describe(): string {
      const pair = loadPair();
      if (!pair) return 'No host paired';
      try {
        const u = new URL(pair.url);
        return u.host;
      } catch {
        return pair.url;
      }
    },
  };
}

/**
 * Convenience re-export so callers can reset a LAN pair through the
 * backend module without importing lanSyncClient directly. Not part of
 * the SyncBackend interface (Drive doesn't have a "forget pair"
 * concept — it has OAuth sign-out).
 */
export function disconnectLan(): void {
  clearPair();
}

/**
 * The LAN adapter previously updated `lastSyncedAt` even when the
 * remote returned 304 (so the badge could say "checked just now"). We
 * preserve that contract via the SyncBackend interface — callers don't
 * need to know about `recordSync`, just call `setRecord`.
 */
export function lanRecordSync(etag: string | undefined): void {
  recordSync(etag);
}

/* ------------------------------------------------------------------ */
/* Outcome mapping                                                     */
/* ------------------------------------------------------------------ */

/**
 * Both sides use very similar discriminated unions, but the LAN
 * variants ship with two LAN-only kinds (`no-session`, `unauthorised`).
 * We collapse those into the interface's `auth-required` kind — from
 * the auto-sync hook's perspective, "host rejected the bearer token"
 * and "host has no signed-in user" are both "needs user action".
 *
 * Keeping the mapping in this module means the auto-sync hook and the
 * Settings UI never have to import LAN-only types.
 */
function mapPullOutcome(outcome: PullOutcome): SyncPullOutcome {
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'ok', data: outcome.data, etag: outcome.etag };
    case 'not-modified':
      return { kind: 'not-modified' };
    case 'unauthorised':
    case 'no-session':
      return { kind: 'auth-required' };
    case 'mixed-content':
      return { kind: 'mixed-content' };
    case 'timeout':
      return { kind: 'timeout' };
    case 'http-error':
      return { kind: 'http-error', status: outcome.status, message: outcome.message };
    case 'network-error':
      return { kind: 'network-error', message: outcome.message };
  }
}

function mapPushOutcome(outcome: PushOutcome): SyncPushOutcome {
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'ok', etag: outcome.etag };
    case 'conflict':
      return {
        kind: 'conflict',
        currentEtag: outcome.currentEtag,
        message: outcome.message,
      };
    case 'unauthorised':
      return { kind: 'auth-required' };
    case 'too-large':
      return { kind: 'too-large' };
    case 'mixed-content':
      return { kind: 'mixed-content' };
    case 'timeout':
      return { kind: 'timeout' };
    case 'http-error':
      return { kind: 'http-error', status: outcome.status, message: outcome.message };
    case 'network-error':
      return { kind: 'network-error', message: outcome.message };
  }
}
