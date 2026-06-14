/**
 * Broadcast before auto-sync (or manual pull) applies a remote snapshot.
 * Rich-text editors listen and flush debounced onChange so in-flight edits
 * are committed to AppData before fingerprint checks / replaceAll.
 */
export const SYNC_BEFORE_APPLY = 'cadence:before-sync-apply';

import { runBeforeFlushHooks } from './pendingSaveFlush';

export async function prepareForRemoteApply(): Promise<void> {
  if (typeof window === 'undefined') return;
  await runBeforeFlushHooks();
  window.dispatchEvent(new CustomEvent(SYNC_BEFORE_APPLY));
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
