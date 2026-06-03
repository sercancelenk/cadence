// @ts-nocheck
import type { ReminderSlot } from './types';

const REMINDER_SYNC = 'REMINDER_SYNC';
const REMINDER_CANCEL_ITEM = 'REMINDER_CANCEL_ITEM';

export async function postReminderSyncToServiceWorker(slots: ReminderSlot[]): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg?.active) return;
  reg.active.postMessage({ type: REMINDER_SYNC, slots });
}

export async function postReminderCancelItem(itemId: string): Promise<void> {
  if (!itemId || !('serviceWorker' in navigator)) return;
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg?.active) return;
  reg.active.postMessage({ type: REMINDER_CANCEL_ITEM, itemId });
}
