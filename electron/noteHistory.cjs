/**
 * Per-note version history sidecar store (Notes only).
 *
 * Lives outside workspace JSON. Files are sealed with the account's data key. Builds from
 * before that cannot read sealed files (they see no history there) and must not be run against
 * a data folder that a newer build has sealed. Verified against the previous release: its
 * attachment cleanup does not know the sealed revisions, so it deletes images only those
 * revisions use, and its next history write replaces a sealed `index.json` with a new plaintext
 * one (the sealed revision files stay on disk but are no longer listed). Notes, tasks and
 * images the notes use are not affected.
 * Full backup / rolling snapshots copy this tree alongside attachments/.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { cloneTreeSync } = require('./persistence/sidecarSnapshot.cjs');
const { writeAllSync } = require('./persistence/writeAllSync.cjs');
const { isEncryptedFile, encryptPayload, decryptPayload } = require('./persistence/dataEnvelope.cjs');

const NOTE_HISTORY_DIRNAME = 'note-history';
const INDEX_VERSION = 1;
const REVISION_RETENTION_MAX = 40;
const REVISION_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const REVISION_MAX_BYTES = 2 * 1024 * 1024;

/** @typedef {'autosave' | 'manual' | 'pre-restore' | 'lock' | 'session-end'} NoteRevisionTrigger */

/**
 * @typedef {object} NoteRevisionMeta
 * @property {string} id
 * @property {string} noteId
 * @property {string} createdAt
 * @property {NoteRevisionTrigger} trigger
 * @property {string} title
 * @property {string} summary
 * @property {boolean} locked
 * @property {string} [label]
 */

/**
 * @typedef {NoteRevisionMeta & {
 *   body?: string
 *   bodyFormat?: 'markdown' | 'prosemirror'
 *   bodyPlainText?: string
 *   cipher?: { ivB64: string; cipherB64: string }
 *   attachmentIds?: string[]
 *   plainContentSignature?: string
 * }} NoteRevisionPayload
 */

let resolveUserData = () => {
  throw new Error('noteHistory: initNoteHistory() not called');
};

/** The data key of a signed-in user, or null (plaintext account / not signed in). */
let resolveKey = () => null;
let resolvePreviousKeys = () => [];

function initNoteHistory(getUserDataPathFn, getDataKeyFn, getPreviousKeysFn) {
  resolveUserData = getUserDataPathFn;
  resolveKey = typeof getDataKeyFn === 'function' ? getDataKeyFn : () => null;
  resolvePreviousKeys = typeof getPreviousKeysFn === 'function' ? getPreviousKeysFn : () => [];
}

/** Returned by `readStoredJson` for a sealed file that cannot be opened with the key in hand. */
const UNREADABLE = Symbol('note-history-unreadable');

function sanitizeNoteId(noteId) {
  if (typeof noteId !== 'string') return null;
  const trimmed = noteId.trim();
  if (!/^[\w-]{8,128}$/.test(trimmed)) return null;
  return trimmed;
}

function noteHistoryRootForUser(userId) {
  if (typeof userId !== 'string' || !userId.trim()) return null;
  return path.join(resolveUserData(), NOTE_HISTORY_DIRNAME, userId.trim());
}

function noteHistoryDirForNote(userId, noteId) {
  const safe = sanitizeNoteId(noteId);
  if (!safe) return null;
  const root = noteHistoryRootForUser(userId);
  if (!root) return null;
  return path.join(root, safe);
}

function indexPathForNote(userId, noteId) {
  const dir = noteHistoryDirForNote(userId, noteId);
  return dir ? path.join(dir, 'index.json') : null;
}

function revisionPathForNote(userId, noteId, revisionId) {
  const dir = noteHistoryDirForNote(userId, noteId);
  if (!dir || typeof revisionId !== 'string' || !/^[\w-]{8,128}$/.test(revisionId)) return null;
  return path.join(dir, `${revisionId}.json`);
}

/**
 * Parsed JSON of a history file. Files written by older versions are plaintext
 * and read as before; sealed files need the user's key. `null` means absent or
 * not JSON; `UNREADABLE` means sealed and not openable, which callers must treat
 * as "do not overwrite, do not delete", never as empty.
 */
function readStoredJson(userId, filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
  if (isEncryptedFile(text)) {
    const key = resolveKey(userId);
    if (!key) return UNREADABLE;
    let plain = decryptPayload(text, key);
    if (plain == null) {
      // A snapshot made before a password change is sealed under an earlier key.
      for (const earlier of resolvePreviousKeys(userId)) {
        plain = decryptPayload(text, earlier);
        if (plain != null) break;
      }
    }
    if (plain == null) return UNREADABLE;
    try {
      return JSON.parse(plain);
    } catch {
      // It opened but is not JSON: something other than us wrote it. Never read it as "empty".
      return UNREADABLE;
    }
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeTextAtomic(filePath, text) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  // Durable write: fsync the data to disk BEFORE the rename, then fsync the
  // directory so the rename itself survives a crash / power loss. Without this,
  // a renamed-but-unflushed file can vanish on an OS crash, silently losing a
  // note revision the user believed was saved.
  const fd = fs.openSync(tmp, 'w');
  try {
    writeAllSync(fs, fd, text);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
  try {
    const dirFd = fs.openSync(dir, 'r');
    try {
      fs.fsyncSync(dirFd);
    } finally {
      fs.closeSync(dirFd);
    }
  } catch {
    // Windows disallows fsync on directory fds; the rename is still atomic.
  }
}

/** Sealed under the user's key when there is one (title, summary and body included), plaintext otherwise. */
function writeStoredJson(userId, filePath, value) {
  const json = JSON.stringify(value, null, 2);
  const key = resolveKey(userId);
  writeTextAtomic(filePath, key ? encryptPayload(json, key) : json);
}

function emptyIndex(noteId) {
  return { version: INDEX_VERSION, noteId, revisions: [] };
}

function readIndex(userId, noteId) {
  const indexPath = indexPathForNote(userId, noteId);
  if (!indexPath) return null;
  const raw = readStoredJson(userId, indexPath);
  if (raw === UNREADABLE) return { ...emptyIndex(noteId), unreadable: true };
  if (!raw || typeof raw !== 'object') return emptyIndex(noteId);
  const revisions = Array.isArray(raw.revisions) ? raw.revisions : [];
  return {
    version: INDEX_VERSION,
    noteId: sanitizeNoteId(noteId) || String(raw.noteId || noteId),
    revisions: revisions.filter((r) => r && typeof r.id === 'string'),
  };
}

function validateRevisionPayload(payload) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'payload required' };
  const noteId = sanitizeNoteId(payload.noteId);
  if (!noteId) return { ok: false, error: 'invalid noteId' };
  if (typeof payload.title !== 'string') return { ok: false, error: 'title required' };
  if (typeof payload.summary !== 'string') return { ok: false, error: 'summary required' };
  const trigger = payload.trigger;
  const allowed = ['autosave', 'manual', 'pre-restore', 'lock', 'session-end'];
  if (!allowed.includes(trigger)) return { ok: false, error: 'invalid trigger' };
  const locked = payload.locked === true;
  if (locked) {
    if (!payload.cipher || typeof payload.cipher !== 'object') {
      return { ok: false, error: 'cipher required for locked revision' };
    }
    if (typeof payload.cipher.ivB64 !== 'string' || typeof payload.cipher.cipherB64 !== 'string') {
      return { ok: false, error: 'invalid cipher' };
    }
  } else if (typeof payload.body !== 'string') {
    return { ok: false, error: 'body required for unlocked revision' };
  }
  try {
    const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (bytes > REVISION_MAX_BYTES) {
      return { ok: false, error: 'revision payload exceeds size limit' };
    }
  } catch {
    return { ok: false, error: 'revision payload too large' };
  }
  return { ok: true, noteId, locked };
}

function pruneRevisionList(revisions) {
  const now = Date.now();
  const sorted = [...revisions].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const withinAge = sorted.filter((r) => {
    const t = Date.parse(String(r.createdAt));
    return Number.isFinite(t) && now - t <= REVISION_RETENTION_MS;
  });
  const kept = withinAge.slice(0, REVISION_RETENTION_MAX);
  return { kept, prunedIds: sorted.filter((r) => !kept.some((k) => k.id === r.id)).map((r) => r.id) };
}

function collectAttachmentIdsFromDocNode(node, out) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'image' && node.attrs && typeof node.attrs === 'object') {
    const id =
      (typeof node.attrs.attachmentId === 'string' && node.attrs.attachmentId.trim()) || null;
    if (id) out.add(id);
    const src = typeof node.attrs.src === 'string' ? node.attrs.src : '';
    const m = src.match(/^cadence-attachment:\/\/(.+)$/i);
    if (m?.[1]) out.add(m[1].trim());
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectAttachmentIdsFromDocNode(child, out);
  }
}

function collectAttachmentIdsFromBody(body, bodyFormat) {
  const ids = new Set();
  if (!body || typeof body !== 'string' || !body.trim()) return ids;
  if (bodyFormat === 'prosemirror') {
    try {
      collectAttachmentIdsFromDocNode(JSON.parse(body), ids);
      return ids;
    } catch {
      /* malformed prosemirror — fall through to raw URI scan */
    }
  }
  // Markdown / legacy / unknown-format revisions store attachments as raw
  // `cadence-attachment://<id>` URIs the structural scan can't see. Scanning
  // them keeps GC from deleting images a markdown-bodied revision still uses.
  for (const m of body.matchAll(/cadence-attachment:\/\/([a-zA-Z0-9_-]{8,128})/g)) {
    const id = m[1] && m[1].trim();
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Attachment ids still referenced by saved revisions. `complete` is false when
 * some revision could not be opened: the caller must then not delete anything
 * on the strength of this list.
 */
function collectReferencedAttachmentsFromNoteHistory(userId) {
  const ids = new Set();
  let complete = true;
  const root = noteHistoryRootForUser(userId);
  if (!root || !fs.existsSync(root)) return { ids, complete };
  let noteDirs;
  try {
    noteDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return { ids, complete: false };
  }
  for (const noteDir of noteDirs) {
    const dir = path.join(root, noteDir.name);
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      complete = false;
      continue;
    }
    for (const name of files) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      const payload = readStoredJson(userId, path.join(dir, name));
      if (payload === UNREADABLE) {
        complete = false;
        continue;
      }
      if (!payload) continue;
      if (payload.locked && payload.cipher) {
        if (Array.isArray(payload.attachmentIds)) {
          for (const id of payload.attachmentIds) {
            const safe = typeof id === 'string' ? id.trim() : '';
            if (safe) ids.add(safe);
          }
        }
        continue;
      }
      for (const id of collectAttachmentIdsFromBody(payload.body, payload.bodyFormat)) ids.add(id);
    }
  }
  return { ids, complete };
}

function collectReferencedAttachmentIdsFromNoteHistory(userId) {
  return collectReferencedAttachmentsFromNoteHistory(userId).ids;
}

function appendNoteRevision(userId, payload) {
  const valid = validateRevisionPayload(payload);
  if (!valid.ok) return valid;

  const noteId = valid.noteId;
  const dir = noteHistoryDirForNote(userId, noteId);
  if (!dir) return { ok: false, error: 'invalid note path' };

  // An index we cannot open must not be replaced by a fresh one: that would orphan every saved revision.
  if (readIndex(userId, noteId).unreadable) {
    return { ok: false, error: 'note history is sealed under another key and cannot be extended' };
  }

  const revisionId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const meta = {
    id: revisionId,
    noteId,
    createdAt,
    trigger: payload.trigger,
    title: payload.title,
    summary: payload.summary,
    locked: valid.locked,
    ...(typeof payload.label === 'string' && payload.label.trim() ? { label: payload.label.trim() } : {}),
  };

  const revisionFile = {
    ...meta,
    ...(valid.locked
      ? {
          cipher: payload.cipher,
          bodyFormat: payload.bodyFormat === 'markdown' || payload.bodyFormat === 'prosemirror' ? payload.bodyFormat : undefined,
          ...(Array.isArray(payload.attachmentIds) && payload.attachmentIds.length
            ? { attachmentIds: payload.attachmentIds.filter((id) => typeof id === 'string' && id.trim()) }
            : {}),
          ...(typeof payload.plainContentSignature === 'string' && payload.plainContentSignature
            ? { plainContentSignature: payload.plainContentSignature }
            : {}),
        }
      : {
          body: payload.body,
          bodyFormat: payload.bodyFormat === 'markdown' || payload.bodyFormat === 'prosemirror' ? payload.bodyFormat : undefined,
          bodyPlainText: typeof payload.bodyPlainText === 'string' ? payload.bodyPlainText : undefined,
        }),
  };

  try {
    fs.mkdirSync(dir, { recursive: true });
    const revPath = path.join(dir, `${revisionId}.json`);
    writeStoredJson(userId, revPath, revisionFile);

    const index = readIndex(userId, noteId);
    index.revisions.unshift(meta);
    const { kept, prunedIds } = pruneRevisionList(index.revisions);
    index.revisions = kept;
    writeStoredJson(userId, path.join(dir, 'index.json'), index);

    for (const oldId of prunedIds) {
      const oldPath = path.join(dir, `${oldId}.json`);
      if (fs.existsSync(oldPath)) {
        try {
          fs.unlinkSync(oldPath);
        } catch {
          /* best effort */
        }
      }
    }

    return { ok: true, revisionId, pruned: prunedIds.length };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function listNoteRevisions(userId, noteId) {
  const safe = sanitizeNoteId(noteId);
  if (!safe) return { ok: false, error: 'invalid noteId', revisions: [] };
  const index = readIndex(userId, safe);
  if (index.unreadable) return { ok: false, error: 'note history is sealed under another key', revisions: [] };
  return { ok: true, revisions: index.revisions };
}

function readNoteRevision(userId, noteId, revisionId) {
  const revPath = revisionPathForNote(userId, noteId, revisionId);
  if (!revPath || !fs.existsSync(revPath)) return { ok: false, error: 'revision not found' };
  const payload = readStoredJson(userId, revPath);
  if (!payload || payload === UNREADABLE) return { ok: false, error: 'revision unreadable' };
  return { ok: true, revision: payload };
}

function purgeNoteHistory(userId, noteId) {
  const dir = noteHistoryDirForNote(userId, noteId);
  if (!dir || !fs.existsSync(dir)) return { ok: true, purged: false };
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, purged: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

function snapshotNoteHistoryForUser(userId, label, ts) {
  try {
    const srcDir = noteHistoryRootForUser(userId);
    if (!srcDir || !fs.existsSync(srcDir)) return null;
    const entries = fs.readdirSync(srcDir);
    if (!entries.length) return null;
    const backupsRoot = path.join(resolveUserData(), 'backups', userId);
    fs.mkdirSync(backupsRoot, { recursive: true });
    const targetDir = path.join(backupsRoot, `note-history-${label}-${ts}`);
    // Hardlinked, not copied: revisions are only ever written via
    // `writeTextAtomic` (tmp + rename), so links never see later edits.
    // A staged copy (`.rekey`) or a half-written temp file is not history; it must not outlive its operation inside a snapshot.
    cloneTreeSync(fs, path, srcDir, targetDir, isHistoryLeftover);
    return targetDir;
  } catch (err) {
    console.warn('[cadence] note-history snapshot failed (continuing)', err);
    return null;
  }
}

function pairedNoteHistoryBackupDir(dataBackupPath) {
  const base = path.basename(dataBackupPath, '.json');
  if (!base.startsWith('data-')) return null;
  const dir = path.join(path.dirname(dataBackupPath), base.replace(/^data-/, 'note-history-'));
  return fs.existsSync(dir) ? dir : null;
}

const REVISION_ID_RE = /^[\w-]{1,128}$/;

/** A revision id is a file name: letters, digits, `_` and `-` only. */
function isSafeRevisionId(id) {
  return typeof id === 'string' && REVISION_ID_RE.test(id);
}

function mergeNoteHistoryNoteDir(userId, destNoteDir, srcNoteDir) {
  fs.mkdirSync(destNoteDir, { recursive: true });
  const destIndexRaw = readStoredJson(userId, path.join(destNoteDir, 'index.json'));
  // Cannot read what is already here: adding to it could replace it. Leave both sides alone.
  if (destIndexRaw === UNREADABLE) return false;
  const destIndex = destIndexRaw || {
    version: INDEX_VERSION,
    noteId: path.basename(destNoteDir),
    revisions: [],
  };
  const srcIndex = readStoredJson(userId, path.join(srcNoteDir, 'index.json'));
  if (!srcIndex || srcIndex === UNREADABLE || !Array.isArray(srcIndex.revisions)) {
    return false;
  }
  const known = new Set(
    (Array.isArray(destIndex.revisions) ? destIndex.revisions : []).map((r) => r.id),
  );
  for (const meta of srcIndex.revisions) {
    // The id becomes a file name on both sides. A backup is untrusted: an id that is not a plain name
    // (`../other-note/rev`) must never reach another note's folder.
    if (!isSafeRevisionId(meta?.id) || known.has(meta.id)) continue;
    const payload = readStoredJson(userId, path.join(srcNoteDir, `${meta.id}.json`));
    if (!payload || payload === UNREADABLE) continue;
    const destRev = path.join(destNoteDir, `${meta.id}.json`);
    // Written via tmp + rename: a revision file can already exist here without
    // being in the index (a prune whose unlink failed), and it is hardlinked
    // into every note-history snapshot. A rename only moves the directory entry.
    writeStoredJson(userId, destRev, payload);
    destIndex.revisions.push(meta);
    known.add(meta.id);
  }
  destIndex.revisions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const { kept, prunedIds } = pruneRevisionList(destIndex.revisions);
  destIndex.revisions = kept;
  writeStoredJson(userId, path.join(destNoteDir, 'index.json'), destIndex);
  for (const oldId of prunedIds) {
    if (!isSafeRevisionId(oldId)) continue;
    const p = path.join(destNoteDir, `${oldId}.json`);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
  return true;
}

function importNoteHistoryFromDir(userId, srcRoot) {
  if (!srcRoot || !fs.existsSync(srcRoot)) return { ok: true, merged: 0 };
  const destRoot = noteHistoryRootForUser(userId);
  if (!destRoot) return { ok: false, error: 'invalid user' };
  fs.mkdirSync(destRoot, { recursive: true });
  let merged = 0;
  let skipped = 0;
  for (const name of fs.readdirSync(srcRoot)) {
    const srcNoteDir = path.join(srcRoot, name);
    try {
      if (!fs.statSync(srcNoteDir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!sanitizeNoteId(name)) continue;
    if (mergeNoteHistoryNoteDir(userId, path.join(destRoot, name), srcNoteDir)) merged += 1;
    // A note whose history was there but could not be opened is a gap the caller must be able to report.
    else if (fs.existsSync(path.join(srcNoteDir, 'index.json'))) skipped += 1;
  }
  return { ok: true, merged, skipped };
}

/**
 * Copy the tree, writing each history file as plain JSON like the rest of a full
 * backup. A file that cannot be opened is copied as it is, never dropped.
 */
function copyHistoryTreeReadable(userId, srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyHistoryTreeReadable(userId, from, to);
      continue;
    }
    if (isHistoryLeftover(entry.name)) continue;
    copyHistoryFileReadable(userId, from, to);
  }
}

/** Staged copies and half-written temp files are not history; they must not travel into a backup. */
function isHistoryLeftover(name) {
  return name.endsWith('.rekey') || name.endsWith('.tmp');
}

/** One history file as plain JSON; a file that cannot be opened is copied as it is, never dropped. */
function copyHistoryFileReadable(userId, from, to) {
  if (from.endsWith('.json')) {
    const value = readStoredJson(userId, from);
    if (value && value !== UNREADABLE) {
      fs.writeFileSync(to, JSON.stringify(value, null, 2));
      return;
    }
  }
  fs.copyFileSync(from, to);
}

/**
 * Same result as `exportNoteHistoryToDir`, but hands the event loop back every few files so a large
 * history does not freeze the app (used by the background daily backup).
 */
async function exportNoteHistoryToDirAsync(userId, destFolder) {
  const srcDir = noteHistoryRootForUser(userId);
  const target = path.join(destFolder, NOTE_HISTORY_DIRNAME);
  if (!srcDir || !fs.existsSync(srcDir)) {
    fs.mkdirSync(target, { recursive: true });
    return { ok: true, copied: false };
  }
  let sinceYield = 0;
  const walk = async (from, to) => {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      const src = path.join(from, entry.name);
      const dest = path.join(to, entry.name);
      if (entry.isDirectory()) {
        await walk(src, dest);
        continue;
      }
      if (isHistoryLeftover(entry.name)) continue;
      copyHistoryFileReadable(userId, src, dest);
      sinceYield += 1;
      if (sinceYield >= 20) {
        sinceYield = 0;
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  };
  await walk(srcDir, target);
  return { ok: true, copied: true };
}

function exportNoteHistoryToDir(userId, destFolder) {
  const srcDir = noteHistoryRootForUser(userId);
  const target = path.join(destFolder, NOTE_HISTORY_DIRNAME);
  if (!srcDir || !fs.existsSync(srcDir)) {
    fs.mkdirSync(target, { recursive: true });
    return { ok: true, copied: false };
  }
  copyHistoryTreeReadable(userId, srcDir, target);
  return { ok: true, copied: true };
}

function countNoteHistoryRevisions(userId) {
  const root = noteHistoryRootForUser(userId);
  if (!root || !fs.existsSync(root)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(root)) {
    const index = readStoredJson(userId, path.join(root, name, 'index.json'));
    if (index && index !== UNREADABLE && Array.isArray(index.revisions)) count += index.revisions.length;
  }
  return count;
}

function historyJsonFiles(root) {
  const out = [];
  if (!root || !fs.existsSync(root)) return out;
  for (const noteDir of fs.readdirSync(root, { withFileTypes: true })) {
    if (!noteDir.isDirectory()) continue;
    const dir = path.join(root, noteDir.name);
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.json')) out.push(path.join(dir, name));
    }
  }
  return out;
}

/**
 * Seal history files that an older version left as plaintext, in place. Each
 * file is read back and compared before the swap, one that is not valid JSON is
 * left alone, and running it again does nothing.
 */
function upgradeNoteHistoryToEncrypted(userId) {
  const result = { ok: true, upgraded: 0, skipped: 0, failed: [] };
  const key = resolveKey(userId);
  const root = noteHistoryRootForUser(userId);
  if (!key || !root) return result;
  for (const file of historyJsonFiles(root)) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      if (isEncryptedFile(text)) continue;
      JSON.parse(text);
      const sealed = encryptPayload(text, key);
      if (decryptPayload(sealed, key) !== text) {
        result.skipped += 1;
        continue;
      }
      writeTextAtomic(file, sealed);
      result.upgraded += 1;
    } catch {
      result.skipped += 1;
    }
  }
  return result;
}

/** Every history json file (index and revisions) for the user. */
function listNoteHistoryFiles(userId) {
  return historyJsonFiles(noteHistoryRootForUser(userId));
}

module.exports = {
  NOTE_HISTORY_DIRNAME,
  REVISION_RETENTION_MAX,
  initNoteHistory,
  sanitizeNoteId,
  appendNoteRevision,
  listNoteRevisions,
  readNoteRevision,
  purgeNoteHistory,
  snapshotNoteHistoryForUser,
  pairedNoteHistoryBackupDir,
  importNoteHistoryFromDir,
  exportNoteHistoryToDir,
  exportNoteHistoryToDirAsync,
  collectReferencedAttachmentIdsFromNoteHistory,
  collectReferencedAttachmentsFromNoteHistory,
  countNoteHistoryRevisions,
  upgradeNoteHistoryToEncrypted,
  listNoteHistoryFiles,
};
