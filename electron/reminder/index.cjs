const { collectFutureSlots, collectPastDueSlots } = require('./collectDesiredSlots.cjs');
const { reminderNotifyKey, isReminderSlotNotified, slotKeyFromOsNotificationId } = require('./reminderNotify.cjs');
const { createInProcessScheduler, showImmediateNotification } = require('./inProcessScheduler.cjs');
const { getPlatformAdapter } = require('./adapters/index.cjs');

/** @typedef {import('./types.cjs').ReminderSlot} ReminderSlot */
/** @typedef {import('./types.cjs').ReminderSyncStatus} ReminderSyncStatus */

/**
 * @param {string} iso
 * @param {'daily' | 'weekly' | 'monthly'} repeat
 */
function advanceReminder(iso, repeat) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/** @type {ReturnType<typeof createInProcessScheduler> | null} */
let scheduler = null;
/** @type {ReturnType<typeof getPlatformAdapter> | null} */
let adapter = null;
/** @type {boolean} */
let osSchedulingEnabled = false;
/** @type {string | null} */
let lastOsError = null;
/** @type {number} */
let pendingOsCount = 0;

/** @type {((url: string) => void) | null} */
let emitDeepLink = null;
/** @type {Promise<void>} */
let syncInFlight = Promise.resolve();

/** @type {{
 *   readUserData: (uid: string) => Record<string, unknown> | null;
 *   writeUserData: (uid: string, payload: Record<string, unknown>) => { ok: boolean };
 *   getSessionUserId: () => string | null;
 *   notifyRenderer: (payload: unknown) => void;
 *   emitDeepLink?: (url: string) => void;
 *   showNotification?: (slot: ReminderSlot, onClick?: () => void) => boolean;
 * } | null} */
let deps = null;

function getAdapter() {
  if (!adapter) adapter = getPlatformAdapter();
  return adapter;
}

function resolveSlotSource(data, itemId) {
  if (Array.isArray(data.todoItems) && data.todoItems.some((t) => t && t.id === itemId)) {
    return 'todo';
  }
  if (Array.isArray(data.items) && data.items.some((it) => it && it.id === itemId)) {
    return 'team-item';
  }
  return 'todo';
}

function deepLinkUrlForSlot(slot) {
  if (slot.source === 'team-item') return `cadence://item/${slot.itemId}`;
  return `cadence://todo/${slot.itemId}`;
}

/**
 * @param {Record<string, unknown>} data
 * @param {ReminderSlot} slot
 */
function applySlotFired(data, slot) {
  const notified = Array.isArray(data.notifiedReminderIds) ? [...data.notifiedReminderIds] : [];
  const key = reminderNotifyKey(slot.itemId, slot.remindAt);
  if (!notified.includes(key)) notified.push(key);

  let items = Array.isArray(data.items) ? data.items : [];
  let todoItems = Array.isArray(data.todoItems) ? data.todoItems : [];

  if (slot.repeat) {
    const next = advanceReminder(slot.remindAt, slot.repeat);
    if (next) {
      if (slot.source === 'todo') {
        todoItems = todoItems.map((t) =>
          t.id === slot.itemId ? { ...t, remindAt: next, updatedAt: new Date().toISOString() } : t,
        );
      } else {
        items = items.map((it) =>
          it.id === slot.itemId ? { ...it, remindAt: next, updatedAt: new Date().toISOString() } : it,
        );
      }
      return { ...data, notifiedReminderIds: notified, items, todoItems };
    }
  }

  return { ...data, notifiedReminderIds: notified, items, todoItems };
}

/**
 * Mark OS-delivered notifications as notified (avoids duplicate catch-up ping).
 * @param {Record<string, unknown>} appData
 * @param {string} [userId]
 */
async function reconcileDeliveredNotifications(appData, userId) {
  const plat = getAdapter();
  if (!(await plat.isAvailable()) || typeof plat.listDeliveredIds !== 'function') {
    return appData;
  }
  const delivered = await plat.listDeliveredIds();
  if (!delivered.length) return appData;

  // Base the notified-flag mutation on the FRESHEST on-disk snapshot rather
  // than the `appData` captured when this sync was scheduled. Between that
  // capture and now a renderer `data:save` may have landed; folding our
  // additive `notifiedReminderIds` update onto the stale snapshot and writing
  // it back would clobber those just-saved edits on disk. Reading fresh here
  // (then writing synchronously below, with no await in between) keeps the
  // read-modify-write atomic on the single main thread — same discipline as
  // onFireSlot.
  const uid = userId || deps?.getSessionUserId?.() || '';
  let data = (uid && deps?.readUserData ? deps.readUserData(uid) : null) || appData;
  // Track real changes explicitly: the fresh-read base is a different object
  // reference than `appData`, so a `data !== appData` write guard would fire
  // even when no slot actually changed.
  let changed = false;
  for (const osId of delivered) {
    const slotKey = slotKeyFromOsNotificationId(osId);
    if (!slotKey) continue;
    const sepIdx = slotKey.indexOf('\u0001');
    if (sepIdx === -1) continue;
    const itemId = slotKey.slice(0, sepIdx);
    const remindAt = slotKey.slice(sepIdx + 1);
    const notified = Array.isArray(data.notifiedReminderIds) ? data.notifiedReminderIds : [];
    if (isReminderSlotNotified(notified, itemId, remindAt)) continue;
    const repeat =
      resolveSlotSource(data, itemId) === 'todo'
        ? data.todoItems?.find((t) => t?.id === itemId)?.remindRepeat
        : data.items?.find((it) => it?.id === itemId)?.remindRepeat;
    data = applySlotFired(data, {
      slotKey,
      itemId,
      remindAt,
      source: resolveSlotSource(data, itemId),
      title: '',
      body: '',
      repeat,
    });
    changed = true;
  }

  if (changed && uid && deps?.writeUserData) {
    const write = deps.writeUserData(uid, data);
    // Mirror onFireSlot: if the disk write failed (e.g. write-conflict) the
    // computed snapshot never landed, so pushing it to the renderer would leak
    // unpersisted state into memory AND hand back no generation — leaving the
    // renderer free to re-collide on its next save. Bail without notifying.
    if (!write?.ok) return data;
    // Forward the new on-disk write generation so the renderer can adopt it.
    // Without this the renderer keeps a stale generation and its next user edit
    // collides with this main-initiated write, dead-locking saves behind a
    // phantom write-conflict until the app is restarted.
    deps.notifyRenderer?.({
      type: 'delivered-sync',
      data,
      writeGeneration: typeof write.writeGeneration === 'number' ? write.writeGeneration : undefined,
    });
  }
  return data;
}

/**
 * @param {ReminderSlot} slot
 */
async function onFireSlot(slot) {
  const uid = deps?.getSessionUserId?.();
  /** @type {Record<string, unknown> | null} */
  let nextData = null;
  /** @type {number | undefined} */
  let nextGeneration;

  if (uid && deps?.readUserData && deps?.writeUserData) {
    const current = deps.readUserData(uid);
    if (current) {
      nextData = applySlotFired(current, slot);
      const write = deps.writeUserData(uid, nextData);
      if (!write.ok) return false;
      if (typeof write.writeGeneration === 'number') nextGeneration = write.writeGeneration;
    }
  }

  const onClick = () => {
    emitDeepLink?.(deepLinkUrlForSlot(slot));
  };
  const show = deps?.showNotification || showImmediateNotification;
  const shown = show(slot, onClick);
  if (!shown) {
    console.warn(
      '[cadence] reminder fired but notification could not be shown — enable notifications for Electron/Cadence in System Settings',
    );
    return false;
  }

  if (nextData) {
    // Carry the new on-disk generation so the renderer adopts it instead of
    // colliding with this main-initiated write on its next save (see
    // reconcileDeliveredNotifications for the full rationale).
    deps.notifyRenderer?.({
      type: 'fired',
      slotKey: slot.slotKey,
      data: nextData,
      writeGeneration: nextGeneration,
    });
    await refreshSchedulers(nextData);
  }
  return true;
}

function initReminderSync(options) {
  deps = options;
  emitDeepLink = typeof options.emitDeepLink === 'function' ? options.emitDeepLink : null;
  adapter = getPlatformAdapter();
  scheduler = createInProcessScheduler({
    onFireSlot,
    onCancelOsSlot: (slot) => getAdapter().cancel(slot),
  });
  scheduler.startSafetyInterval();
  const plat = getAdapter();
  if (typeof plat.startAgent === 'function' && emitDeepLink) {
    plat.startAgent((url) => emitDeepLink(url));
  }
}

/**
 * @param {Record<string, unknown>} appData
 */
async function refreshSchedulers(appData) {
  if (!scheduler || !appData) return;
  const future = collectFutureSlots(appData, Date.now());
  scheduler.setFutureSlots(future);

  const plat = getAdapter();
  const osAvailable = await plat.isAvailable();
  osSchedulingEnabled = osAvailable;
  lastOsError = null;
  pendingOsCount = 0;

  if (osAvailable) {
    const result = await plat.reconcile(future);
    pendingOsCount = future.length;
    lastOsError = result.error || null;
    osSchedulingEnabled = result.ok;
  } else {
    osSchedulingEnabled = false;
  }
}

/**
 * @param {Record<string, unknown>} appData
 * @param {string} [userId]
 */
async function syncRemindersFromAppData(appData, userId) {
  if (!scheduler || !appData) return;
  syncInFlight = syncInFlight.then(async () => {
    let working = appData;
    working = await reconcileDeliveredNotifications(working, userId);

    const now = Date.now();
    const pastDue = collectPastDueSlots(working, now);
    for (const slot of pastDue) {
      await onFireSlot(slot);
    }

    const uid = userId || deps?.getSessionUserId?.() || '';
    const latest = uid && deps?.readUserData ? deps.readUserData(uid) || working : working;
    await refreshSchedulers(latest);
  });
  await syncInFlight;
}

/** @returns {ReminderSyncStatus} */
function getReminderSyncStatus() {
  return {
    osScheduling: osSchedulingEnabled,
    platform: process.platform,
    pendingInApp: scheduler?.getPendingCount?.() ?? 0,
    pendingOs: pendingOsCount,
    osError: lastOsError,
  };
}

async function requestReminderPermission() {
  const plat = getPlatformAdapter();
  if (typeof plat.requestPermission !== 'function') {
    return { ok: false, granted: false, error: 'unsupported-platform' };
  }
  return plat.requestPermission();
}

/**
 * Cancel in-process and OS pending reminders for one item id immediately.
 * @param {string} itemId
 */
async function cancelReminderSlotsForItem(itemId) {
  if (!itemId || typeof itemId !== 'string') {
    return { ok: false, error: 'bad-id' };
  }
  scheduler?.cancelItemPrefix?.(itemId);
  const plat = getAdapter();
  if (typeof plat.cancelItemPrefix === 'function') {
    await plat.cancelItemPrefix(itemId);
  }
  return { ok: true };
}

function stopReminderSync() {
  scheduler?.stop();
  const plat = getAdapter();
  if (typeof plat.stopAgent === 'function') {
    plat.stopAgent();
  }
}

module.exports = {
  initReminderSync,
  syncRemindersFromAppData,
  getReminderSyncStatus,
  requestReminderPermission,
  cancelReminderSlotsForItem,
  stopReminderSync,
};
