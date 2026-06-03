// @ts-nocheck
import { supportsPwaOsSchedule } from './capabilities';
import { postReminderCancelItem } from './pwaReminderSync';

/** Drop OS / SW pending reminders for one item before debounced save completes. */
export function cancelPendingReminderSlots(itemId: string | undefined): void {
  if (!itemId) return;
  void window.cadence?.cancelReminderSlots?.(itemId);
  if (supportsPwaOsSchedule()) {
    void postReminderCancelItem(itemId);
  }
}
