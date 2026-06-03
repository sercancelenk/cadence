// @ts-nocheck
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { osNotificationId, slotKeyFromOsNotificationId, OS_ID_PREFIX } = require('../reminderNotify.cjs');
const { reconcileOsReminderSlots } = require('../reconcileOsSlots.cjs');
const { getBuildAppId } = require('../../buildAppId.cjs');

const execFileAsync = promisify(execFile);

/** @typedef {import('../types.cjs').ReminderSlot} ReminderSlot */

function appUserModelId() {
  return getBuildAppId();
}

function helperPath() {
  if (process.platform !== 'win32') return null;
  const besideExe = path.join(path.dirname(process.execPath), 'cadence-notify-schedule.exe');
  if (fs.existsSync(besideExe)) return besideExe;
  const dev = path.join(__dirname, '..', 'native-windows', 'out', 'cadence-notify-schedule.exe');
  if (fs.existsSync(dev)) return dev;
  return null;
}

async function isAvailable() {
  if (process.platform !== 'win32') return false;
  const p = helperPath();
  return !!(p && fs.existsSync(p));
}

async function runHelper(args, timeoutMs = 30_000) {
  const bin = helperPath();
  if (!bin || !fs.existsSync(bin)) {
    return { ok: false, error: 'helper-missing', stdout: '', stderr: '' };
  }
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      timeout: timeoutMs,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, CADENCE_AUMID: appUserModelId() },
    });
    return { ok: true, stdout: stdout || '', stderr: stderr || '', error: null };
  } catch (err) {
    return {
      ok: false,
      stdout: err.stdout?.toString?.() || '',
      stderr: err.stderr?.toString?.() || err.message || String(err),
      error: 'helper-exec-failed',
    };
  }
}

function parseJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

async function requestPermission() {
  const r = await runHelper(['request-permission']);
  if (!r.ok) return { ok: false, granted: false, error: r.error || r.stderr };
  const parsed = parseJson(r.stdout);
  return { ok: true, granted: parsed?.granted !== false, error: null };
}

/** @returns {Promise<string[]>} */
async function listDeliveredIds() {
  const r = await runHelper(['list-delivered']);
  if (!r.ok) return [];
  const parsed = parseJson(r.stdout);
  if (!Array.isArray(parsed?.ids)) return [];
  return parsed.ids.filter((id) => typeof id === 'string' && id.startsWith(OS_ID_PREFIX));
}

/** @returns {Promise<string[]>} */
async function listPendingIds() {
  const r = await runHelper(['list']);
  if (!r.ok) return [];
  const parsed = parseJson(r.stdout);
  if (!Array.isArray(parsed?.ids)) return [];
  return parsed.ids.filter((id) => typeof id === 'string' && id.startsWith(OS_ID_PREFIX));
}

/** @param {ReminderSlot} slot */
async function schedule(slot) {
  const fireAtMs = Date.parse(slot.remindAt);
  if (Number.isNaN(fireAtMs)) return { ok: false, error: 'bad-remind-at' };
  const payload = JSON.stringify({
    id: osNotificationId(slot.slotKey),
    fireAtMs,
    title: slot.title,
    body: slot.body,
    itemId: slot.itemId,
    source: slot.source,
  });
  const r = await runHelper(['schedule', payload]);
  if (!r.ok) return { ok: false, error: r.error || r.stderr };
  const parsed = parseJson(r.stdout);
  return { ok: parsed?.ok === true, error: parsed?.error || null };
}

/** @param {ReminderSlot} slot */
async function cancel(slot) {
  return cancelByOsId(osNotificationId(slot.slotKey));
}

async function cancelByOsId(osId) {
  const r = await runHelper(['cancel', osId]);
  if (!r.ok) return { ok: false, error: r.error || r.stderr };
  return { ok: true, error: null };
}

async function cancelItemPrefix(itemId) {
  const r = await runHelper(['cancel-prefix', `${OS_ID_PREFIX}${itemId}\u0001`]);
  if (!r.ok) return { ok: false, error: r.error || r.stderr };
  return { ok: true, error: null };
}

/**
 * @param {ReminderSlot[]} desired
 */
async function reconcile(desired) {
  return reconcileOsReminderSlots(desired, {
    listPendingIds,
    schedule,
    cancelByOsId,
  });
}

module.exports = {
  isAvailable,
  requestPermission,
  listPendingIds,
  listDeliveredIds,
  schedule,
  cancel,
  cancelByOsId,
  cancelItemPrefix,
  reconcile,
  slotKeyFromOsNotificationId,
  helperPath,
  appUserModelId,
};
