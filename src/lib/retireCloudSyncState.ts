/**
 * One-shot cleanup when cloud sync is product-retired.
 *
 * Clears the active sync backend pointer and Google Drive tokens/records so a
 * future accidental re-wire of auto-sync cannot pull/push against stale
 * credentials. Idempotent via a localStorage marker. Does not touch workspace
 * JSON / notes / todos.
 */
import { disconnectGDrive, setActiveBackendId } from './syncBackends';

const RETIRE_MARKER = 'cadence.sync.retired.v1';

export function retireCloudSyncState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    if (window.localStorage.getItem(RETIRE_MARKER) === '1') return;
  } catch {
    // Still attempt cleanup below if marker read fails.
  }

  try {
    setActiveBackendId(null);
  } catch {
    /* ignore */
  }
  try {
    disconnectGDrive();
  } catch {
    /* ignore */
  }

  try {
    window.localStorage.setItem(RETIRE_MARKER, '1');
  } catch {
    /* ignore — cleanup already ran; marker is best-effort */
  }
}
