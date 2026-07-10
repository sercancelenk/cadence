/**
 * Per-note version history sidecar store (Notes only).
 *
 * Lives outside workspace JSON so older Cadence builds ignore it safely.
 * Full backup / rolling snapshots copy this tree alongside attachments/.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

function initNoteHistory(getUserDataPathFn) {
  resolveUserData = getUserDataPathFn;
}

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

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  // Durable write: fsync the data to disk BEFORE the rename, then fsync the
  // directory so the rename itself survives a crash / power loss. Without this,
  // a renamed-but-unflushed file can vanish on an OS crash, silently losing a
  // note revision the user believed was saved.
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(value, null, 2), 0, 'utf8');
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

function emptyIndex(noteId) {
  return { version: INDEX_VERSION, noteId, revisions: [] };
}

function readIndex(userId, noteId) {
  const indexPath = indexPathForNote(userId, noteId);
  if (!indexPath) return null;
  const raw = readJsonFile(indexPath);
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

function collectReferencedAttachmentIdsFromNoteHistory(userId) {
  const ids = new Set();
  const root = noteHistoryRootForUser(userId);
  if (!root || !fs.existsSync(root)) return ids;
  let noteDirs;
  try {
    noteDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return ids;
  }
  for (const noteDir of noteDirs) {
    const dir = path.join(root, noteDir.name);
    let files;
    try {
      files = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of files) {
      if (!name.endsWith('.json') || name === 'index.json') continue;
      const payload = readJsonFile(path.join(dir, name));
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
  return ids;
}

function appendNoteRevision(userId, payload) {
  const valid = validateRevisionPayload(payload);
  if (!valid.ok) return valid;

  const noteId = valid.noteId;
  const dir = noteHistoryDirForNote(userId, noteId);
  if (!dir) return { ok: false, error: 'invalid note path' };

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
    writeJsonAtomic(revPath, revisionFile);

    const index = readIndex(userId, noteId);
    index.revisions.unshift(meta);
    const { kept, prunedIds } = pruneRevisionList(index.revisions);
    index.revisions = kept;
    writeJsonAtomic(path.join(dir, 'index.json'), index);

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
  return { ok: true, revisions: index.revisions };
}

function readNoteRevision(userId, noteId, revisionId) {
  const revPath = revisionPathForNote(userId, noteId, revisionId);
  if (!revPath || !fs.existsSync(revPath)) return { ok: false, error: 'revision not found' };
  const payload = readJsonFile(revPath);
  if (!payload) return { ok: false, error: 'revision unreadable' };
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
    fs.cpSync(srcDir, targetDir, { recursive: true });
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

function mergeNoteHistoryNoteDir(destNoteDir, srcNoteDir) {
  fs.mkdirSync(destNoteDir, { recursive: true });
  const destIndex = readJsonFile(path.join(destNoteDir, 'index.json')) || {
    version: INDEX_VERSION,
    noteId: path.basename(destNoteDir),
    revisions: [],
  };
  const srcIndex = readJsonFile(path.join(srcNoteDir, 'index.json'));
  if (!srcIndex || !Array.isArray(srcIndex.revisions)) {
    return;
  }
  const known = new Set(
    (Array.isArray(destIndex.revisions) ? destIndex.revisions : []).map((r) => r.id),
  );
  for (const meta of srcIndex.revisions) {
    if (!meta?.id || known.has(meta.id)) continue;
    const srcRev = path.join(srcNoteDir, `${meta.id}.json`);
    const destRev = path.join(destNoteDir, `${meta.id}.json`);
    if (!fs.existsSync(srcRev)) continue;
    fs.copyFileSync(srcRev, destRev);
    destIndex.revisions.push(meta);
    known.add(meta.id);
  }
  destIndex.revisions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const { kept, prunedIds } = pruneRevisionList(destIndex.revisions);
  destIndex.revisions = kept;
  writeJsonAtomic(path.join(destNoteDir, 'index.json'), destIndex);
  for (const oldId of prunedIds) {
    const p = path.join(destNoteDir, `${oldId}.json`);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function importNoteHistoryFromDir(userId, srcRoot) {
  if (!srcRoot || !fs.existsSync(srcRoot)) return { ok: true, merged: 0 };
  const destRoot = noteHistoryRootForUser(userId);
  if (!destRoot) return { ok: false, error: 'invalid user' };
  fs.mkdirSync(destRoot, { recursive: true });
  let merged = 0;
  for (const name of fs.readdirSync(srcRoot)) {
    const srcNoteDir = path.join(srcRoot, name);
    try {
      if (!fs.statSync(srcNoteDir).isDirectory()) continue;
    } catch {
      continue;
    }
    if (!sanitizeNoteId(name)) continue;
    mergeNoteHistoryNoteDir(path.join(destRoot, name), srcNoteDir);
    merged += 1;
  }
  return { ok: true, merged };
}

function exportNoteHistoryToDir(userId, destFolder) {
  const srcDir = noteHistoryRootForUser(userId);
  const target = path.join(destFolder, NOTE_HISTORY_DIRNAME);
  if (!srcDir || !fs.existsSync(srcDir)) {
    fs.mkdirSync(target, { recursive: true });
    return { ok: true, copied: false };
  }
  fs.cpSync(srcDir, target, { recursive: true });
  return { ok: true, copied: true };
}

function countNoteHistoryRevisions(userId) {
  const root = noteHistoryRootForUser(userId);
  if (!root || !fs.existsSync(root)) return 0;
  let count = 0;
  for (const name of fs.readdirSync(root)) {
    const index = readJsonFile(path.join(root, name, 'index.json'));
    if (index && Array.isArray(index.revisions)) count += index.revisions.length;
  }
  return count;
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
  collectReferencedAttachmentIdsFromNoteHistory,
  countNoteHistoryRevisions,
};
