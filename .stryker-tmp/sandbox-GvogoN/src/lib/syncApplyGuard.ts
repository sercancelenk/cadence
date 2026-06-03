/**
 * Broadcast before auto-sync (or manual pull) applies a remote snapshot.
 * Rich-text editors listen and flush debounced onChange so in-flight edits
 * are committed to AppData before fingerprint checks / replaceAll.
 */
// @ts-nocheck

export const SYNC_BEFORE_APPLY = 'cadence:before-sync-apply';

export async function prepareForRemoteApply(): Promise<void> {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_BEFORE_APPLY));
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
