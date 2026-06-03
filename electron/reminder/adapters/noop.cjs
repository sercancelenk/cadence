/** @typedef {import('../types.cjs').ReminderSlot} ReminderSlot */

async function isAvailable() {
  return false;
}

async function requestPermission() {
  return { ok: false, granted: false, error: 'unsupported-platform' };
}

async function listDeliveredIds() {
  return [];
}

async function listPendingIds() {
  return [];
}

/** @param {ReminderSlot[]} desired */
async function reconcile(desired) {
  return {
    ok: true,
    cancelled: 0,
    scheduled: 0,
    pendingOs: 0,
    error: null,
  };
}

async function cancel(_slot) {
  return { ok: true, error: null };
}

module.exports = {
  isAvailable,
  requestPermission,
  listPendingIds,
  listDeliveredIds,
  reconcile,
  cancel,
};
