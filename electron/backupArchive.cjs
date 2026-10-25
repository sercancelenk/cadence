/**
 * The single-file backup (`.zip`): workspace, every image on disk, readable note history and a manifest.
 *
 * This file holds the parts that do not depend on Electron so they can be tested on their own; `main.cjs`
 * wires in the account's files. See docs/BACKUP-RECOVERY-STANDARD.md (B3, B4, B9): the layout is the
 * `cadence-bundle-v2` one every older build reads, with `note-history/` added beside `attachments/`.
 */

const fs = require('fs');
const path = require('path');
const { createZipWriter } = require('./persistence/zipWriter.cjs');
const { openZip, resolveBundleRoot } = require('./persistence/zipReader.cjs');

const BUNDLE_FORMAT = 'cadence-bundle-v2';
const ATTACHMENT_ID_RE = /^[a-zA-Z0-9_-]{8,128}$/;
const NOTE_ID_RE = /^[\w-]{8,128}$/;
const HISTORY_FILE_RE = /^[\w-]+\.json$/;
const MAX_JSON_BYTES = 64 * 1024 * 1024;
/** Names Windows reserves for devices (with or without an extension). */
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** JSON text as Windows tools write it: Notepad and PowerShell put a byte-order mark in front. */
function parseJsonText(text) {
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/** Another program (antivirus, the indexer) may hold a just-written file for a moment on Windows: retry. */
async function removeScratch(dir) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* swept at the next start */
  }
}

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/** Files under `root`, as `[absolute path, path relative to root with forward slashes]`. */
async function listFilesRecursive(root, base = root) {
  const out = [];
  for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...(await listFilesRecursive(abs, base)));
    else if (entry.isFile()) out.push([abs, path.relative(base, abs).split(path.sep).join('/')]);
  }
  return out;
}

/**
 * @param {{
 *   filePath: string,
 *   payload: object,
 *   tmpRoot: string,
 *   listAttachmentIds: () => string[],
 *   readAttachmentBytes: (id: string) => Buffer | null,
 *   exportNoteHistory: (destFolder: string) => Promise<unknown>,
 *   countNoteHistoryRevisions: () => number,
 *   assertStillSignedIn?: () => void,
 *   now?: Date,
 * }} deps
 * @returns {Promise<{ ok: true, path: string, bytes: number, attachmentCount: number, attachmentsSkipped: number, noteHistoryRevisionCount: number } | { ok: false, error: string }>}
 */
async function writeBackupArchive(deps) {
  const tmp = path.join(deps.tmpRoot, `tmp-backup-${process.pid}-${Date.now()}`);
  let writer = null;
  try {
    writer = await createZipWriter(deps.filePath);
    await writer.add('data.json', Buffer.from(JSON.stringify(deps.payload, null, 2), 'utf8'));

    let attachmentCount = 0;
    let attachmentsSkipped = 0;
    for (const id of deps.listAttachmentIds()) {
      // Signing out takes the key away: stop instead of writing a backup without the images.
      deps.assertStillSignedIn?.();
      const bytes = deps.readAttachmentBytes(id);
      if (!bytes || !bytes.length) {
        attachmentsSkipped += 1;
      } else {
        await writer.add(`attachments/${id}.bin`, bytes);
        attachmentCount += 1;
      }
      await yieldToEventLoop();
    }

    // History is exported as readable JSON into a scratch folder first, then added file by file.
    let historyFiles = 0;
    await deps.exportNoteHistory(tmp);
    const historyRoot = path.join(tmp, 'note-history');
    if (fs.existsSync(historyRoot)) {
      for (const [abs, rel] of await listFilesRecursive(historyRoot)) {
        await writer.add(`note-history/${rel}`, await fs.promises.readFile(abs));
        historyFiles += 1;
        if (historyFiles % 20 === 0) await yieldToEventLoop();
      }
    }

    const noteHistoryRevisionCount = deps.countNoteHistoryRevisions();
    const manifest = {
      format: BUNDLE_FORMAT,
      exportedAt: (deps.now ?? new Date()).toISOString(),
      attachmentsPortable: true,
      attachmentCount,
      attachmentsSkipped,
      noteHistoryRevisionCount,
      archive: 'zip',
      source: 'desktop',
    };
    await writer.add('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'));
    const done = await writer.finish();
    writer = null;
    return {
      ok: true,
      path: deps.filePath,
      bytes: done.bytes,
      attachmentCount,
      attachmentsSkipped,
      noteHistoryRevisionCount,
    };
  } catch (err) {
    if (writer) await writer.abort().catch(() => undefined);
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    await removeScratch(tmp);
  }
}

/** A workspace has at least one of its collections. */
function looksLikeWorkspace(payload) {
  if (!payload || typeof payload !== 'object') return false;
  return ['teams', 'people', 'items', 'todoGroups', 'todoItems', 'notes'].some((k) => Array.isArray(payload[k]));
}

/** A workspace file may hold the workspace directly or inside the `CDNC1` envelope of a data file. */
function workspaceCandidate(raw) {
  if (raw && typeof raw === 'object' && raw.magic === 'CDNC1' && raw.workspace && typeof raw.workspace === 'object') {
    return raw.workspace;
  }
  return raw;
}

/** `{ id, ext }` of `attachments/<id>.bin|cadenc` under `root`, or null (includes macOS `._x` leftovers). */
function attachmentEntry(name, root) {
  const prefix = `${root}attachments/`;
  if (!name.startsWith(prefix)) return null;
  const rest = name.slice(prefix.length);
  if (rest.includes('/')) return null;
  const m = rest.match(/^(.+)\.(bin|cadenc)$/);
  return m && ATTACHMENT_ID_RE.test(m[1]) ? { id: m[1], ext: m[2] } : null;
}

/** `{ noteId, file }` of `note-history/<noteId>/<file>.json` under `root`, or null. */
function historyEntry(name, root) {
  const prefix = `${root}note-history/`;
  if (!name.startsWith(prefix)) return null;
  const parts = name.slice(prefix.length).split('/');
  if (parts.length !== 2) return null;
  if (!NOTE_ID_RE.test(parts[0]) || !HISTORY_FILE_RE.test(parts[1])) return null;
  if (WINDOWS_RESERVED.test(parts[1].replace(/\.json$/, ''))) return null;
  return { noteId: parts[0], file: parts[1] };
}

/**
 * Look inside a backup file the user picked, without changing anything.
 * @param {{ filePath: string, summarize: (workspace: object) => object | null, maxDataJsonBytes?: number }} deps
 */
async function inspectBackupFile(deps) {
  const maxDataJson = deps.maxDataJsonBytes ?? MAX_JSON_BYTES;
  const fileName = path.basename(deps.filePath);
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) {
    let raw;
    try {
      const stat = await fs.promises.stat(deps.filePath);
      if (stat.size > MAX_JSON_BYTES) return { ok: false, error: 'That file is too large to be a Cadence workspace.' };
      raw = parseJsonText(await fs.promises.readFile(deps.filePath, 'utf8'));
    } catch {
      return { ok: false, error: 'File is not valid JSON.' };
    }
    const workspace = workspaceCandidate(raw);
    if (!looksLikeWorkspace(workspace)) {
      return { ok: false, error: 'That file does not look like a Cadence workspace export (no recognised collections).' };
    }
    return {
      ok: true,
      kind: 'json',
      fileName,
      workspace,
      counts: deps.summarize(workspace),
      attachments: { count: 0, skippedAtExport: 0 },
      history: { notes: 0, revisions: 0 },
    };
  }
  if (!lower.endsWith('.zip')) return { ok: false, error: 'Choose a .zip backup or a .json workspace file.' };

  let zip;
  try {
    zip = await openZip(deps.filePath);
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
  try {
    const names = zip.entries.map((e) => e.name);
    const root = resolveBundleRoot(names);
    if (!names.includes(`${root}data.json`)) {
      const nested = names.some((n) => n.endsWith('/data.json'));
      return {
        ok: false,
        error: nested
          ? 'Backup ZIP has multiple folders — export again or zip only the inner backup folder (must contain data.json at the top level).'
          : 'Backup is missing data.json.',
      };
    }
    const dataEntry = zip.entries.find((e) => e.name === `${root}data.json`);
    if (dataEntry && dataEntry.size > maxDataJson) {
      return { ok: false, error: 'That backup is too large to be a Cadence workspace.' };
    }
    let workspace;
    try {
      workspace = workspaceCandidate(parseJsonText((await zip.read(`${root}data.json`)).toString('utf8')));
    } catch (err) {
      return { ok: false, error: err instanceof Error && /checksum|size|truncated/i.test(err.message) ? err.message : 'data.json is not valid JSON.' };
    }
    if (!looksLikeWorkspace(workspace)) {
      return { ok: false, error: 'That backup does not look like a Cadence workspace export (no recognised collections).' };
    }
    let manifest = null;
    if (names.includes(`${root}manifest.json`)) {
      try {
        const m = parseJsonText((await zip.read(`${root}manifest.json`)).toString('utf8'));
        if (m && m.format === BUNDLE_FORMAT) manifest = m;
      } catch {
        manifest = null;
      }
    }
    let images = 0;
    const historyNotes = new Set();
    let revisions = 0;
    for (const name of names) {
      if (attachmentEntry(name, root)) images += 1;
      const h = historyEntry(name, root);
      if (h) {
        historyNotes.add(h.noteId);
        if (h.file !== 'index.json') revisions += 1;
      }
    }
    return {
      ok: true,
      kind: 'zip',
      fileName,
      workspace,
      exportedAt: typeof manifest?.exportedAt === 'string' ? manifest.exportedAt : undefined,
      source: typeof manifest?.source === 'string' ? manifest.source : undefined,
      counts: deps.summarize(workspace),
      attachments: { count: images, skippedAtExport: Number(manifest?.attachmentsSkipped ?? manifest?.attachmentMissing ?? 0) || 0 },
      history: { notes: historyNotes.size, revisions },
    };
  } finally {
    await zip.close().catch(() => undefined);
  }
}

/**
 * After the workspace has been replaced: bring the images and note history of a ZIP into the account.
 * One image that cannot be read or written never stops the rest; the counts say what happened.
 *
 * @param {{
 *   filePath: string,
 *   tmpRoot: string,
 *   expectFile?: { size: number, mtimeMs: number },
 *   importImage: (id: string, bytes: Buffer) => 'restored' | 'skipped',
 *   mergeHistory: (srcRoot: string) => { incomplete: boolean },
 * }} deps
 */
async function applyArchiveSidecars(deps) {
  const result = { attachmentsRestored: 0, attachmentsSkipped: 0, attachmentsFailed: 0, historyIncomplete: false };
  if (!deps.filePath.toLowerCase().endsWith('.zip')) return result;
  // The file is opened again here, after the workspace was replaced. If it is not the file the user was shown,
  // bring nothing from it.
  if (deps.expectFile) {
    try {
      const st = await fs.promises.stat(deps.filePath);
      if (st.size !== deps.expectFile.size || st.mtimeMs !== deps.expectFile.mtimeMs) {
        return { ...result, attachmentsFailed: 1, historyIncomplete: true };
      }
    } catch {
      return { ...result, attachmentsFailed: 1, historyIncomplete: true };
    }
  }
  const tmp = path.join(deps.tmpRoot, `tmp-backup-import-${process.pid}-${Date.now()}`);
  let zip;
  try {
    zip = await openZip(deps.filePath);
  } catch {
    return { ...result, historyIncomplete: true, attachmentsFailed: 1 };
  }
  try {
    const names = zip.entries.map((e) => e.name);
    const root = resolveBundleRoot(names);
    let sinceYield = 0;
    const noteFolders = new Map();
    const imageIds = new Map();
    for (const name of names) {
      const att = attachmentEntry(name, root);
      if (att) {
        // `AAAA…` and `aaaa…` are the same file on Windows and on a default Mac: bring in the first, report the rest.
        const lowerId = att.id.toLowerCase();
        const seenAs = imageIds.get(lowerId);
        if (seenAs !== undefined && seenAs !== att.id) {
          result.attachmentsFailed += 1;
          continue;
        }
        imageIds.set(lowerId, att.id);
        try {
          const bytes = await zip.read(name);
          if (!bytes.length) result.attachmentsSkipped += 1;
          else if (deps.importImage(att.id, bytes) === 'restored') result.attachmentsRestored += 1;
          else result.attachmentsSkipped += 1;
        } catch {
          result.attachmentsFailed += 1;
        }
        if (++sinceYield % 10 === 0) await yieldToEventLoop();
        continue;
      }
      const hist = historyEntry(name, root);
      if (hist) {
        // On a case-insensitive disk `ABC...` and `abc...` are the same folder: keep the first, report the rest.
        const lower = hist.noteId.toLowerCase();
        const owner = noteFolders.get(lower);
        if (owner !== undefined && owner !== hist.noteId) {
          result.historyIncomplete = true;
          continue;
        }
        noteFolders.set(lower, hist.noteId);
        try {
          const dir = path.join(tmp, hist.noteId);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.writeFile(path.join(dir, hist.file), await zip.read(name));
        } catch {
          result.historyIncomplete = true;
        }
      }
    }
    if (fs.existsSync(tmp)) {
      try {
        if (deps.mergeHistory(tmp).incomplete) result.historyIncomplete = true;
      } catch {
        result.historyIncomplete = true;
      }
    }
    return result;
  } finally {
    await zip.close().catch(() => undefined);
    await removeScratch(tmp);
  }
}

/**
 * Scratch folders (`tmp-backup-*`) are removed when their export or import ends. One is left behind only if the
 * app was stopped in the middle, or a program held a file open. They hold readable copies of note history, so
 * at start (when nothing of ours can be using one: the app runs once at a time) every one of them goes.
 */
async function sweepStaleScratch(tmpRoot) {
  let removed = 0;
  try {
    for (const entry of await fs.promises.readdir(tmpRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith('tmp-backup-')) continue;
      await removeScratch(path.join(tmpRoot, entry.name));
      removed += 1;
    }
  } catch {
    /* best effort */
  }
  return removed;
}

module.exports = {
  sweepStaleScratch,
  writeBackupArchive,
  inspectBackupFile,
  applyArchiveSidecars,
  looksLikeWorkspace,
  listFilesRecursive,
  BUNDLE_FORMAT,
};
