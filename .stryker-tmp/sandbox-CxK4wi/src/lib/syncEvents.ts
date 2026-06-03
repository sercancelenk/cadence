/**
 * Tiny pub-sub for sync status visibility.
 *
 * Background sync runs without a UI of its own — the auto-sync hook
 * silently pushes and pulls. That worked fine when LAN was the only
 * backend (the Settings host card carried enough status by itself),
 * but with cloud sync there's a new failure surface that the user
 * needs to know about: refresh-token revoked, snapshot too large,
 * Google API rate-limit, etc. We don't want toasts every 30 seconds,
 * but we DO want Settings → Cloud sync to show "last error: X" if
 * something went wrong while the page wasn't visible.
 *
 * This module is the single broadcast channel for that. The auto-sync
 * hook publishes outcomes; the Settings UI subscribes and shows the
 * most recent one. Process-local only — sync events are never
 * persisted, so a refresh clears them.
 */
// @ts-nocheck


import type { SyncBackendId, SyncPullOutcome, SyncPushOutcome } from './syncBackends/types';

export type SyncEventKind = 'success' | 'error' | 'info';

export type SyncEvent = {
  kind: SyncEventKind;
  backendId: SyncBackendId | null;
  /** Short user-facing message. */
  text: string;
  /** Optional machine-readable code so the UI can render call-to-action buttons. */
  code?: string;
  at: number;
};

const EVENT_NAME = 'cadence:sync-event';

let last: SyncEvent | null = null;

export function publishSyncEvent(event: Omit<SyncEvent, 'at'>): void {
  last = { ...event, at: Date.now() };
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent<SyncEvent>(EVENT_NAME, { detail: last }));
  } catch {
    /* swallow */
  }
}

export function getLastSyncEvent(): SyncEvent | null {
  return last;
}

export function subscribeSyncEvents(cb: (event: SyncEvent) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SyncEvent>).detail;
    if (detail) cb(detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

/* ------------------------------------------------------------------ */
/* Pretty-printers used by both auto-sync and manual button handlers   */
/* ------------------------------------------------------------------ */

export function describePullOutcomeForLog(
  outcome: SyncPullOutcome,
): { kind: SyncEventKind; text: string; code?: string } {
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'success', text: 'Pulled new snapshot from remote.' };
    case 'not-modified':
      return { kind: 'success', text: 'Remote matches local — nothing to pull.' };
    case 'no-snapshot':
      return { kind: 'info', text: 'No snapshot on remote yet.' };
    case 'auth-required':
      return {
        kind: 'error',
        code: 'auth-required',
        text: 'Sync session expired — sign in again.',
      };
    case 'wrong-password':
      return {
        kind: 'error',
        code: 'wrong-password',
        text: 'Sync passphrase does not open the remote snapshot.',
      };
    case 'unsupported-version':
      return {
        kind: 'error',
        code: 'unsupported-version',
        text: 'Remote snapshot was written by a newer Cadence build. Update this device.',
      };
    case 'mixed-content':
      return {
        kind: 'error',
        code: 'mixed-content',
        text: 'HTTPS page cannot reach an HTTP host.',
      };
    case 'timeout':
      return { kind: 'error', code: 'timeout', text: 'Remote took too long to respond.' };
    case 'http-error':
      return {
        kind: 'error',
        code: 'http-error',
        text: `Remote returned HTTP ${outcome.status}${outcome.message ? `: ${outcome.message}` : ''}.`,
      };
    case 'network-error':
      return {
        kind: 'error',
        code: 'network-error',
        text: `Network error: ${outcome.message || 'unknown'}.`,
      };
  }
}

export function describePushOutcomeForLog(
  outcome: SyncPushOutcome,
): { kind: SyncEventKind; text: string; code?: string } {
  switch (outcome.kind) {
    case 'ok':
      return { kind: 'success', text: 'Snapshot pushed to remote.' };
    case 'conflict':
      return {
        kind: 'error',
        code: 'conflict',
        text: 'Remote moved on since your last pull — conflict detected.',
      };
    case 'auth-required':
      return {
        kind: 'error',
        code: 'auth-required',
        text: 'Sync session expired — sign in again.',
      };
    case 'too-large':
      return { kind: 'error', code: 'too-large', text: 'Snapshot is too large to upload.' };
    case 'mixed-content':
      return {
        kind: 'error',
        code: 'mixed-content',
        text: 'HTTPS page cannot reach an HTTP host.',
      };
    case 'timeout':
      return { kind: 'error', code: 'timeout', text: 'Remote took too long to respond.' };
    case 'http-error':
      return {
        kind: 'error',
        code: 'http-error',
        text: `Remote returned HTTP ${outcome.status}${outcome.message ? `: ${outcome.message}` : ''}.`,
      };
    case 'network-error':
      return {
        kind: 'error',
        code: 'network-error',
        text: `Network error: ${outcome.message || 'unknown'}.`,
      };
  }
}
