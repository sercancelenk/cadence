// @ts-nocheck
const { Notification } = require('electron');
const { osNotificationId } = require('./reminderNotify.cjs');

/** @typedef {import('./types.cjs').ReminderSlot} ReminderSlot */

/**
 * Single next-fire timer while the Cadence process is alive.
 */
function createInProcessScheduler({ onFireSlot, onCancelOsSlot }) {
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timeoutId = null;
  /** @type {ReturnType<typeof setInterval> | null} */
  let safetyIntervalId = null;
  /** @type {ReminderSlot[]} */
  let futureSlots = [];

  const clearTimers = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const fireDueNow = async (nowMs) => {
    const due = futureSlots.filter((s) => Date.parse(s.remindAt) <= nowMs);
    for (const slot of due) {
      const ok = await onFireSlot(slot);
      if (ok) {
        if (onCancelOsSlot) {
          try {
            await onCancelOsSlot(slot);
          } catch {
            /* ignore */
          }
        }
        futureSlots = futureSlots.filter((s) => s.slotKey !== slot.slotKey);
      }
    }
  };

  const scheduleNext = async () => {
    clearTimers();
    const nowMs = Date.now();
    await fireDueNow(nowMs);
    const upcoming = futureSlots.filter((s) => Date.parse(s.remindAt) > nowMs);
    const overdue = futureSlots.filter((s) => Date.parse(s.remindAt) <= nowMs);
    const next = upcoming[0] || overdue[0];
    if (!next) return;
    const fireAt = Date.parse(next.remindAt);
    const delay =
      fireAt > nowMs ? Math.max(250, fireAt - nowMs + 100) : 30_000;
    timeoutId = setTimeout(() => {
      void scheduleNext();
    }, delay);
  };

  return {
    /** @param {ReminderSlot[]} slots */
    setFutureSlots(slots) {
      futureSlots = [...slots].sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt));
      void scheduleNext();
    },
    startSafetyInterval() {
      if (safetyIntervalId) return;
      safetyIntervalId = setInterval(() => {
        void scheduleNext();
      }, 30_000);
    },
    stop() {
      clearTimers();
      if (safetyIntervalId) {
        clearInterval(safetyIntervalId);
        safetyIntervalId = null;
      }
      futureSlots = [];
    },
    /** Drop all future slots for one task/item id (instant cancel before save). */
    cancelItemPrefix(itemId) {
      if (!itemId) return;
      futureSlots = futureSlots.filter((s) => s.itemId !== itemId);
      void scheduleNext();
    },
    getPendingCount() {
      return futureSlots.length;
    },
  };
}

/**
 * @param {ReminderSlot} slot
 * @param {(() => void) | undefined} [onClick]
 */
function showImmediateNotification(slot, onClick) {
  if (!Notification.isSupported()) return false;
  try {
    const n = new Notification({
      title: slot.title || 'Cadence',
      body: slot.body || '',
    });
    if (typeof onClick === 'function') {
      n.on('click', onClick);
    }
    n.show();
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  createInProcessScheduler,
  showImmediateNotification,
  osNotificationId,
};
