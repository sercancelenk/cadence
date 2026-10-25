/**
 * The data keys an account used before its password last changed.
 *
 * Snapshots under `backups/` keep the bytes they had, so one taken before a password change is
 * sealed under the key of that time. Without that key, restoring it fails with "cannot be
 * decrypted". The earlier keys are kept here, sealed under the current key, so a restore can
 * open an older snapshot and re-seal what it brings under the current key. Nothing else reads
 * this file, and an older build simply ignores it.
 *
 * A password change is not atomic (workspace, account record, this file), so the file is changed
 * in two steps, like the sidecar re-key:
 *   1. `stagePreviousKey`  writes `<file>.next` (before the account record is saved);
 *   2. the caller saves the account record;
 *   3. `commitPreviousKey` swaps it in, or `discardPreviousKey` if step 2 failed.
 * A stop between 2 and 3 loses nothing: `readPreviousKeys` also reads `.next`, and
 * `finalizePreviousKeys` (run at sign-in) completes the swap. A `.next` sealed under a key that never
 * became current opens under nothing and is ignored.
 *
 * A live file that cannot be opened is set aside as `<file>.unreadable`, never deleted, so a damaged
 * file cannot stop the key just replaced from being recorded.
 */

const fs = require('fs');
const path = require('path');
const { encryptPayload, decryptPayload } = require('./dataEnvelope.cjs');

const MAX_PREVIOUS_KEYS = 20;
const NEXT = '.next';

function openList(file, key) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const plain = decryptPayload(text, key);
  if (plain == null) return null;
  try {
    const parsed = JSON.parse(plain);
    if (!parsed || !Array.isArray(parsed.keys)) return null;
    return parsed.keys.filter((x) => typeof x === 'string' && /^[0-9a-f]{64}$/i.test(x));
  } catch {
    return null;
  }
}

/** The earlier keys, newest first, from the file and from a change that was cut short. */
function readPreviousKeys(file, current) {
  const merged = [];
  for (const source of [file, `${file}${NEXT}`]) {
    for (const hex of openList(source, current) || []) if (!merged.includes(hex)) merged.push(hex);
  }
  return merged.map((hex) => Buffer.from(hex, 'hex'));
}

function atomicWrite(target, text) {
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Flushed before the rename: after a power cut the list must be whole or absent, never empty. It is the only
    // way into snapshots made under earlier passwords.
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeFileSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, target);
    return { ok: true };
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* nothing to clean */
    }
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Step 1. `previous` is the key the file was last sealed under; `current` is the key it will be sealed under.
 * @returns {{ ok: boolean, setAsideUnreadable?: boolean, error?: string }}
 */
function stagePreviousKey(file, previous, current) {
  const next = `${file}${NEXT}`;
  let existing = [];
  let setAsideUnreadable = false;
  // A change that was never swapped in leaves its list in `.next`, sealed under the key that is `previous` now.
  const fromNext = fs.existsSync(next) ? openList(next, previous) || openList(next, current) : null;
  if (fs.existsSync(file)) {
    const opened = openList(file, previous) || openList(file, current);
    if (opened) {
      existing = opened;
    } else if (!fromNext) {
      try {
        fs.copyFileSync(file, `${file}.unreadable`);
        setAsideUnreadable = true;
      } catch (err) {
        return { ok: false, error: String(err && err.message ? err.message : err) };
      }
    }
  }
  for (const hex of fromNext || []) if (!existing.includes(hex)) existing.push(hex);
  const hex = previous.toString('hex');
  const keys = [hex, ...existing.filter((x) => x !== hex)].slice(0, MAX_PREVIOUS_KEYS);
  const written = atomicWrite(next, encryptPayload(JSON.stringify({ version: 1, keys }), current));
  return written.ok ? { ok: true, setAsideUnreadable } : written;
}

/** Step 3: the account record is saved, so the staged list becomes the file. */
function commitPreviousKey(file) {
  const next = `${file}${NEXT}`;
  if (!fs.existsSync(next)) return;
  try {
    fs.renameSync(next, file);
  } catch {
    /* still readable as `.next`; finished at the next sign-in */
  }
}

function discardPreviousKey(file) {
  try {
    fs.rmSync(`${file}${NEXT}`, { force: true });
  } catch {
    /* a leftover is ignored: it opens under no current key */
  }
}

/** Finish a swap that was cut short, using the key the user just signed in with. */
function finalizePreviousKeys(file, current) {
  const next = `${file}${NEXT}`;
  if (!fs.existsSync(next)) return;
  if (openList(next, current)) commitPreviousKey(file);
  else if (openList(file, current)) discardPreviousKey(file);
}

module.exports = {
  MAX_PREVIOUS_KEYS,
  readPreviousKeys,
  stagePreviousKey,
  commitPreviousKey,
  discardPreviousKey,
  finalizePreviousKeys,
};
