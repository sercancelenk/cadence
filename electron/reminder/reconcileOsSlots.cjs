const { osNotificationId } = require('./reminderNotify.cjs');

/** @typedef {import('./types.cjs').ReminderSlot} ReminderSlot */

/**
 * Reconcile desired reminder slots with OS pending notifications.
 * Always (re)schedules desired slots so title/body updates propagate.
 *
 * @param {ReminderSlot[]} desired
 * @param {{
 *   listPendingIds: () => Promise<string[]>;
 *   schedule: (slot: ReminderSlot) => Promise<{ ok: boolean; error?: string | null }>;
 *   cancelByOsId: (osId: string) => Promise<{ ok: boolean; error?: string | null }>;
 * }} plat
 */
async function reconcileOsReminderSlots(desired, plat) {
  const desiredIds = new Set(desired.map((s) => osNotificationId(s.slotKey)));
  const osPending = await plat.listPendingIds();
  let cancelled = 0;
  let scheduled = 0;
  /** @type {string | null} */
  let lastError = null;

  for (const osId of osPending) {
    if (!desiredIds.has(osId)) {
      const r = await plat.cancelByOsId(osId);
      if (r.ok) cancelled += 1;
      else lastError = r.error || lastError;
    }
  }

  for (const slot of desired) {
    const r = await plat.schedule(slot);
    if (r.ok) scheduled += 1;
    else lastError = r.error || lastError;
  }

  return {
    ok: !lastError,
    cancelled,
    scheduled,
    pendingOs: desired.length,
    error: lastError,
  };
}

module.exports = { reconcileOsReminderSlots };
