/**
 * Backend registry + active-backend selection.
 *
 * The app supports a single "active" sync backend at a time (we
 * explicitly chose not to ship a multi-backend fan-out for v1 —
 * the conflict surface area is large and the typical user only
 * wants one home for their snapshot anyway). This module is the
 * single source of truth for which backend is currently active and
 * exposes a tiny event hook so the auto-sync hook re-binds when
 * the user flips the choice in Settings.
 *
 * Drive comes online only after the user explicitly connects from
 * Settings. There is no implicit default — a device with no saved
 * preference reports "no sync configured yet".
 */

import { createGDriveBackend } from './gdrive';
import type { SyncBackend, SyncBackendId } from './types';

const ACTIVE_BACKEND_KEY = 'cadence.sync.activeBackend.v1';
const CHANGE_EVENT = 'cadence:sync-backend-changed';

export function getActiveBackendId(): SyncBackendId | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const raw = window.localStorage.getItem(ACTIVE_BACKEND_KEY);
  if (raw === 'gdrive') return raw;
  // We don't auto-pick `gdrive` even if Drive tokens happen to be in
  // localStorage — the user must opt in explicitly, because Drive sync
  // needs the sync passphrase to be unlocked and we can't assume they
  // want that on every device.
  return null;
}

export function setActiveBackendId(id: SyncBackendId | null): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (id) window.localStorage.setItem(ACTIVE_BACKEND_KEY, id);
  else window.localStorage.removeItem(ACTIVE_BACKEND_KEY);
  // Custom event so same-tab listeners (the auto-sync hook lives in
  // the same JS context as the Settings UI) react without forcing a
  // reload. `storage` event would only fire on OTHER tabs.
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Build the SyncBackend object for the currently-active id. Returns
 * null if no backend is configured *or* the configured backend can't
 * be instantiated (e.g. LAN selected but the pair was cleared, Drive
 * selected but the user signed out).
 */
export function getActiveBackend(): SyncBackend | null {
  const id = getActiveBackendId();
  if (id === 'gdrive') return createGDriveBackend();
  return null;
}

/**
 * Subscribe to "active backend changed" events. The callback fires
 * on both same-tab (`setActiveBackendId`) and cross-tab
 * (`storage`) changes — the auto-sync hook uses this to swap out
 * the backend instance it's currently driving without unmounting.
 */
export function subscribeActiveBackend(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onCustom = () => cb();
  const onStorage = (e: StorageEvent) => {
    if (e.key === ACTIVE_BACKEND_KEY) cb();
  };
  window.addEventListener(CHANGE_EVENT, onCustom);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

export type { SyncBackend, SyncBackendId } from './types';
export { createGDriveBackend, disconnectGDrive } from './gdrive';
