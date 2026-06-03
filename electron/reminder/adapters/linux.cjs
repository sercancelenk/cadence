const { Notification } = require('electron');

/** @typedef {import('../types.cjs').ReminderSlot} ReminderSlot */

async function isAvailable() {
  return false;
}

async function requestPermission() {
  const supported = Notification.isSupported();
  return {
    ok: supported,
    granted: supported,
    error: supported ? null : 'notifications-unsupported',
  };
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

async function cancelByOsId(_osId) {
  return { ok: true, error: null };
}

async function cancelItemPrefix(_itemId) {
  return { ok: true, error: null };
}

module.exports = {
  isAvailable,
  requestPermission,
  listPendingIds,
  listDeliveredIds,
  reconcile,
  cancel,
  cancelByOsId,
  cancelItemPrefix,
};
