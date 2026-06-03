/**
 * In-memory + sessionStorage management for the cloud sync passphrase.
 *
 * Why a separate "sync passphrase"
 * ================================
 *
 * Cadence uses the account password to log in, but it does NOT retain
 * that password in memory after `AccountContext.login()` returns — the
 * raw bytes are verified once via PBKDF2 and discarded so a heap dump
 * during the session has nothing to recover.
 *
 * Cloud sync's encryption layer (`snapshotCrypto`) needs SOME passphrase
 * to derive a key for every push and pull. The options were:
 *
 *   1. Reuse the account password. Convenient but requires retaining it
 *      indefinitely OR re-prompting every sync — neither ideal.
 *   2. Mirror Notes' approach (per-feature passphrase) and ask the user
 *      to set a dedicated sync passphrase the first time they connect
 *      a cloud provider.
 *
 * We chose (2) because:
 *   - It makes the security boundary explicit ("this passphrase
 *     encrypts what goes to Google Drive").
 *   - Users on a new device only need this passphrase + Drive sign-in
 *     to restore their workspace — no account password needed locally.
 *   - It composes cleanly with the existing Notes lock pattern users
 *     already understand.
 *
 * Storage policy
 * ==============
 *
 * The passphrase lives in `sessionStorage` (per-tab, cleared on tab
 * close) and a process-local ref. Two reasons:
 *
 *   - sessionStorage survives a page reload (mobile users wipe tabs
 *     by accident; we don't want to re-prompt every refresh).
 *   - It does NOT survive closing the app, so a quick "lock" is to
 *     just close the tab.
 *
 * Tradeoff: an attacker with brief physical access to an unlocked
 * device can read sessionStorage. Same threat as a logged-in laptop
 * left open — out of scope for this feature.
 *
 * If the user wants stronger guarantees they can avoid setting a
 * "remember on this device" toggle (TODO: surface this in Settings)
 * and re-enter the passphrase per session.
 */
// @ts-nocheck


const SESSION_KEY = 'cadence.sync.passphrase.v1';
const EVENT_CHANGED = 'cadence:sync-passphrase-changed';

let memo: string | null = null;

function readSession(): string | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    return window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

function writeSession(value: string | null): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    if (value === null) window.sessionStorage.removeItem(SESSION_KEY);
    else window.sessionStorage.setItem(SESSION_KEY, value);
  } catch {
    // QuotaExceeded or disabled-storage; the in-memory ref still works.
  }
}

/**
 * Return the current sync passphrase, or null if the user hasn't
 * unlocked yet this session.
 */
export function getSyncPassphrase(): string | null {
  if (memo !== null) return memo;
  const fromSession = readSession();
  if (fromSession !== null) {
    memo = fromSession;
    return fromSession;
  }
  return null;
}

/**
 * Set (or clear) the sync passphrase. Persists to sessionStorage when
 * `remember` is true (the default) so a page reload keeps the session
 * unlocked.
 */
export function setSyncPassphrase(value: string | null, remember = true): void {
  memo = value;
  if (remember) writeSession(value);
  else writeSession(null);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(EVENT_CHANGED));
  }
}

export function clearSyncPassphrase(): void {
  setSyncPassphrase(null, true);
}

/**
 * Subscribe to passphrase changes (set / cleared). The Settings UI uses
 * this to keep its "locked / unlocked" badge in sync with what the
 * auto-sync hook sees, and to clear the "Enter passphrase" modal when
 * unlocking happens from another path.
 */
export function subscribeSyncPassphrase(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === SESSION_KEY) {
      // Cross-tab change: refresh our memo.
      memo = readSession();
      cb();
    }
  };
  window.addEventListener(EVENT_CHANGED, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT_CHANGED, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * `true` when the user has at least one passphrase value cached this
 * session. Settings reads this to choose between the "unlock" and
 * "manage" UI variants.
 */
export function hasSyncPassphrase(): boolean {
  return getSyncPassphrase() !== null;
}
