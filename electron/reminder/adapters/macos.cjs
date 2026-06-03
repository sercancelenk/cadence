const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { Notification } = require('electron');
const { osNotificationId, slotKeyFromOsNotificationId, OS_ID_PREFIX } = require('../reminderNotify.cjs');
const { reconcileOsReminderSlots } = require('../reconcileOsSlots.cjs');

const execFileAsync = promisify(execFile);

/** @typedef {import('../types.cjs').ReminderSlot} ReminderSlot */

/** @type {import('child_process').ChildProcess | null} */
let agentProc = null;
/** @type {((url: string) => void) | null} */
let onClickHandler = null;
let agentStopping = false;
/** Stop respawning the agent after a crash (loose binary outside .app always crashes). */
let agentDisabled = false;
/** @type {Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>} */
const pendingAgent = new Map();
let nextReqId = 0;
let stdoutBuffer = '';

/**
 * UNUserNotificationCenter only works when the helper runs inside a real
 * `.app/Contents/MacOS/` bundle. A dev-built binary in electron/reminder/native/
 * crashes with `bundleProxyForCurrentProcess is nil`.
 */
function helperPath() {
  if (process.resourcesPath) {
    const packaged = path.join(process.resourcesPath, '..', 'MacOS', 'cadence-notify-schedule');
    if (fs.existsSync(packaged) && packaged.includes('.app/Contents/MacOS/')) {
      return packaged;
    }
  }
  return null;
}

function canUseOsHelper() {
  return !!helperPath();
}

function agentRunning() {
  return !!(agentProc && !agentProc.killed);
}

function handleAgentLine(line) {
  /** @type {Record<string, unknown> | null} */
  let msg = null;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (!msg) return;
  if (msg.event === 'click' && typeof msg.url === 'string') {
    onClickHandler?.(msg.url);
    return;
  }
  if (typeof msg._reqId === 'number' && pendingAgent.has(msg._reqId)) {
    const { resolve } = pendingAgent.get(msg._reqId);
    pendingAgent.delete(msg._reqId);
    resolve(msg);
  }
}

/**
 * @param {Record<string, unknown>} obj
 * @returns {Promise<Record<string, unknown>>}
 */
function sendAgent(obj) {
  return new Promise((resolve, reject) => {
    if (!agentProc?.stdin?.writable) {
      reject(new Error('agent-not-running'));
      return;
    }
    const reqId = ++nextReqId;
    pendingAgent.set(reqId, { resolve, reject });
    agentProc.stdin.write(`${JSON.stringify({ ...obj, _reqId: reqId })}\n`);
    setTimeout(() => {
      if (pendingAgent.has(reqId)) {
        pendingAgent.delete(reqId);
        reject(new Error('agent-timeout'));
      }
    }, 30_000);
  });
}

/**
 * @param {(url: string) => void} onClick
 */
function startAgent(onClick) {
  if (agentDisabled || agentRunning()) return false;
  const bin = helperPath();
  if (!bin) return false;
  onClickHandler = onClick;
  stdoutBuffer = '';
  agentProc = spawn(bin, ['agent'], { stdio: ['pipe', 'pipe', 'pipe'] });
  agentProc.stdout?.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split('\n');
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) handleAgentLine(trimmed);
    }
  });
  agentProc.stderr?.on('data', (chunk) => {
    const text = chunk.toString().trim();
    if (text) console.warn('[cadence] reminder agent stderr:', text);
  });
  agentProc.on('exit', (code) => {
    agentProc = null;
    for (const { reject } of pendingAgent.values()) {
      reject(new Error('agent-exited'));
    }
    pendingAgent.clear();
    if (!agentStopping) {
      agentDisabled = true;
      console.warn(
        `[cadence] reminder agent exited (code ${code ?? '?'}); OS quit-after-fire disabled until app restart`,
      );
    }
    agentStopping = false;
  });
  agentProc.on('error', (err) => {
    agentProc = null;
    agentDisabled = true;
    console.warn('[cadence] reminder agent failed to start', err?.message || err);
  });
  return true;
}

function stopAgent() {
  agentStopping = true;
  if (agentProc && !agentProc.killed) {
    agentProc.kill();
  }
  agentProc = null;
  onClickHandler = null;
  for (const { reject } of pendingAgent.values()) {
    reject(new Error('agent-stopped'));
  }
  pendingAgent.clear();
}

async function isAvailable() {
  if (process.platform !== 'darwin') return false;
  return canUseOsHelper();
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

async function requestElectronNotificationPermission() {
  if (!Notification.isSupported()) {
    return { ok: false, granted: false, error: 'notifications-not-supported' };
  }
  try {
    const n = new Notification({
      title: 'Cadence reminders',
      body: 'If you see this alert, reminders can fire while Cadence is open.',
    });
    n.show();
    return { ok: true, granted: true, error: null };
  } catch (err) {
    return { ok: false, granted: false, error: err?.message || String(err) };
  }
}

async function requestPermission() {
  if (!canUseOsHelper()) {
    return requestElectronNotificationPermission();
  }
  if (agentRunning()) {
    try {
      const parsed = await sendAgent({ cmd: 'request-permission' });
      return { ok: parsed.ok !== false, granted: parsed.granted === true, error: null };
    } catch (err) {
      return { ok: false, granted: false, error: err?.message || String(err) };
    }
  }
  const r = await runHelper(['request-permission']);
  if (!r.ok) return { ok: false, granted: false, error: r.error || r.stderr };
  const parsed = parseJson(r.stdout);
  return { ok: true, granted: parsed?.granted === true, error: null };
}

/** @returns {Promise<string[]>} */
async function listDeliveredIds() {
  if (!canUseOsHelper()) return [];
  if (agentRunning()) {
    try {
      const parsed = await sendAgent({ cmd: 'list-delivered' });
      if (!Array.isArray(parsed.ids)) return [];
      return parsed.ids.filter((id) => typeof id === 'string' && id.startsWith(OS_ID_PREFIX));
    } catch {
      return [];
    }
  }
  const r = await runHelper(['list-delivered']);
  if (!r.ok) return [];
  const parsed = parseJson(r.stdout);
  if (!Array.isArray(parsed?.ids)) return [];
  return parsed.ids.filter((id) => typeof id === 'string' && id.startsWith(OS_ID_PREFIX));
}

/** @returns {Promise<string[]>} */
async function listPendingIds() {
  if (!canUseOsHelper()) return [];
  if (agentRunning()) {
    try {
      const parsed = await sendAgent({ cmd: 'list' });
      if (!Array.isArray(parsed.ids)) return [];
      return parsed.ids.filter((id) => typeof id === 'string' && id.startsWith(OS_ID_PREFIX));
    } catch {
      return [];
    }
  }
  const r = await runHelper(['list']);
  if (!r.ok) return [];
  const parsed = parseJson(r.stdout);
  if (!Array.isArray(parsed?.ids)) return [];
  return parsed.ids.filter((id) => typeof id === 'string' && id.startsWith(OS_ID_PREFIX));
}

/** @param {ReminderSlot} slot */
async function schedule(slot) {
  if (!canUseOsHelper()) {
    return { ok: false, error: 'helper-unavailable-in-dev' };
  }
  const fireAtMs = Date.parse(slot.remindAt);
  if (Number.isNaN(fireAtMs)) return { ok: false, error: 'bad-remind-at' };
  const osId = osNotificationId(slot.slotKey);
  if (agentRunning()) {
    try {
      const parsed = await sendAgent({
        cmd: 'schedule',
        id: osId,
        fireAtMs,
        title: slot.title,
        body: slot.body,
        itemId: slot.itemId,
        source: slot.source,
      });
      return { ok: parsed.ok === true, error: typeof parsed.error === 'string' ? parsed.error : null };
    } catch (err) {
      return { ok: false, error: err?.message || 'agent-schedule-failed' };
    }
  }
  const payload = JSON.stringify({
    id: osId,
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
  if (!canUseOsHelper()) return { ok: true, error: null };
  if (agentRunning()) {
    try {
      const parsed = await sendAgent({ cmd: 'cancel', id: osId });
      return { ok: parsed.ok !== false, error: null };
    } catch {
      return { ok: false, error: 'agent-cancel-failed' };
    }
  }
  const r = await runHelper(['cancel', osId]);
  if (!r.ok) return { ok: false, error: r.error || r.stderr };
  return { ok: true, error: null };
}

async function cancelItemPrefix(itemId) {
  if (!canUseOsHelper()) return { ok: true, error: null };
  const prefix = `${OS_ID_PREFIX}${itemId}\u0001`;
  if (agentRunning()) {
    try {
      const parsed = await sendAgent({ cmd: 'cancel-prefix', prefix });
      return { ok: parsed.ok !== false, error: null };
    } catch {
      return { ok: false, error: 'agent-cancel-prefix-failed' };
    }
  }
  const r = await runHelper(['cancel-prefix', prefix]);
  if (!r.ok) return { ok: false, error: r.error || r.stderr };
  return { ok: true, error: null };
}

/**
 * @param {ReminderSlot[]} desired
 */
async function reconcile(desired) {
  if (!canUseOsHelper()) {
    return { ok: true, error: null };
  }
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
  startAgent,
  stopAgent,
};
