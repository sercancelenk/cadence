import { APP_SLUG } from '../appBranding';
import { collectReferencedAttachmentIds } from '../richTextAttachmentIndex';
import {
  importAttachmentBlob,
  readAttachmentBlobForSync,
  revokeAttachmentBlobUrls,
} from '../richTextAttachmentStore';
import { appDataToPersistJson, normalizeData, type AppData } from '../../model';
import { stripAiSecrets } from '../ai/secrets';
import { parseRemoteSnapshot, snapshotParseErrorMessage } from '../syncSnapshotGuard';
import { parseBundleEntries } from './parse';
import type { BackupPreview } from '../backupPreview';
import {
  BACKUP_ATTACHMENTS_DIR,
  BACKUP_BUNDLE_FORMAT,
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  type BackupImportResult,
  type BackupManifest,
  type ParsedBackupBundle,
} from './types';
import { zipStorePack, zipStoreUnpack } from './zipStore';

/** Guard against loading huge archives into renderer memory. */
const MAX_PORTABLE_ZIP_BYTES = 250 * 1024 * 1024;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function isEncryptedSidecar(bytes: Uint8Array): boolean {
  try {
    const t = new TextDecoder().decode(bytes).trimStart();
    if (!t.startsWith('{')) return false;
    const o = JSON.parse(t) as { magic?: string; iv?: string; ct?: string };
    return o?.magic === 'LDMN1' && typeof o.iv === 'string' && typeof o.ct === 'string';
  } catch {
    return false;
  }
}

export type PortableBackupExportResult = {
  filename: string;
  attachmentCount: number;
  attachmentMissing: number;
};

/** Build and download a cross-platform portable ZIP (data.json + attachments/*.bin). */
export async function exportPortableBackupZip(
  userId: string,
  data: AppData,
): Promise<PortableBackupExportResult> {
  const normalized = normalizeData(data);
  const ids = collectReferencedAttachmentIds(normalized);
  const files: Record<string, Uint8Array> = {};
  const enc = new TextEncoder();

  // Exports leave the encrypted data file, so they carry no AI keys (see lib/ai/secrets).
  files[BACKUP_DATA_FILE] = enc.encode(appDataToPersistJson(stripAiSecrets(normalized)));

  let attachmentCount = 0;
  let attachmentMissing = 0;
  for (const id of ids) {
    const blob = await readAttachmentBlobForSync(id, userId);
    if (!blob?.size) {
      attachmentMissing += 1;
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    files[`${BACKUP_ATTACHMENTS_DIR}/${id}.bin`] = bytes;
    attachmentCount += 1;
  }

  const manifest: BackupManifest = {
    format: BACKUP_BUNDLE_FORMAT,
    exportedAt: new Date().toISOString(),
    attachmentsPortable: true,
    attachmentCount,
    ...(attachmentMissing > 0 ? { attachmentMissing } : {}),
  };
  files[BACKUP_MANIFEST_FILE] = enc.encode(JSON.stringify(manifest, null, 2));

  const zipBytes = zipStorePack(files);
  const date = new Date().toISOString().slice(0, 10);
  const filename = `${APP_SLUG}-backup-${date}.zip`;
  downloadBlob(new Blob([zipBytes.slice()], { type: 'application/zip' }), filename);
  return { filename, attachmentCount, attachmentMissing };
}

function guessImageMime(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[8] === 0x57) return 'image/webp';
  return 'image/webp';
}

async function importAttachmentBytes(
  userId: string,
  attachmentId: string,
  bytes: Uint8Array,
): Promise<'imported' | 'encrypted' | 'failed'> {
  if (isEncryptedSidecar(bytes)) {
    if (window.cadence?.attachmentImportPortable) {
      const r = await window.cadence.attachmentImportPortable({
        attachmentId,
        dataBase64: bytesToBase64(bytes),
        encrypted: true,
      });
      return r?.ok ? 'imported' : 'failed';
    }
    return 'encrypted';
  }
  const mime = guessImageMime(bytes);
  try {
    await importAttachmentBlob(userId, attachmentId, new Blob([bytes.slice()], { type: mime }), mime);
    return 'imported';
  } catch {
    return 'failed';
  }
}

export type ImportPortableBackupDeps = {
  userId: string;
  importWorkspace: (data: AppData) => Promise<{ ok: true } | { ok: false; error: string }>;
  /**
   * Optional transform applied to the parsed remote workspace BEFORE it is
   * handed to `importWorkspace`. The replace flow leaves this undefined (the
   * remote snapshot is imported verbatim). The "merge from another device"
   * flow supplies a function that folds the remote into the current local
   * workspace additively (`mergeAppendWorkspace`), so importing never drops
   * the items this device already has. Attachments are still imported by id,
   * which is additive too — existing blobs are left in place.
   */
  transformWorkspace?: (remote: AppData) => AppData;
};

type ReadFailure = { ok: false; error: string };
type ReadPortable = {
  ok: true;
  kind: 'zip' | 'json';
  workspace: AppData;
  bundle: ParsedBackupBundle | null;
};

/** Read and check a portable ZIP or JSON file. Changes nothing. */
async function readPortableBackupFile(file: File): Promise<ReadPortable | ReadFailure> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.json')) {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      return { ok: false, error: 'File is not valid JSON.' };
    }
    const parsed = parseRemoteSnapshot(raw);
    if (parsed.kind !== 'ok') {
      return { ok: false, error: snapshotParseErrorMessage(parsed) };
    }
    return { ok: true, kind: 'json', workspace: parsed.data, bundle: null };
  }

  if (!name.endsWith('.zip')) {
    return { ok: false, error: 'Choose a .zip backup or a .json workspace file.' };
  }

  if (file.size > MAX_PORTABLE_ZIP_BYTES) {
    return {
      ok: false,
      error: `Backup is too large (${Math.round(file.size / (1024 * 1024))} MB). Maximum is ${MAX_PORTABLE_ZIP_BYTES / (1024 * 1024)} MB.`,
    };
  }

  let entries: Record<string, Uint8Array>;
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    entries = zipStoreUnpack(buf);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not read ZIP archive.',
    };
  }

  let bundle: ParsedBackupBundle;
  try {
    bundle = parseBundleEntries(entries);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'ZIP does not contain a valid Cadence backup.',
    };
  }

  const parsed = parseRemoteSnapshot(bundle.workspaceRaw);
  if (parsed.kind !== 'ok') {
    return { ok: false, error: snapshotParseErrorMessage(parsed) };
  }

  if (!window.cadence?.attachmentImportPortable) {
    let encryptedCount = 0;
    for (const [, bytes] of bundle.attachments) {
      if (bytes.length && isEncryptedSidecar(bytes)) encryptedCount += 1;
    }
    if (encryptedCount > 0) {
      return {
        ok: false,
        error: `This backup contains ${encryptedCount} encrypted image${encryptedCount === 1 ? '' : 's'}. Import it in the Cadence desktop app.`,
      };
    }
  }
  return { ok: true, kind: 'zip', workspace: parsed.data, bundle };
}

/** Bring the opened file's images (before the workspace: they are additive) and then replace the workspace. */
async function applyReadPortable(
  read: ReadPortable,
  workspace: AppData,
  userId: string,
  importWorkspace: ImportPortableBackupDeps['importWorkspace'],
): Promise<BackupImportResult | ReadFailure> {
  if (!read.bundle) {
    // A JSON file carries text only.
    const r = await importWorkspace(workspace);
    if (!r.ok) return r;
    revokeAttachmentBlobUrls();
    return { ok: true, attachmentsImported: 0, attachmentsSkipped: 0, attachmentsEncryptedSkipped: 0 };
  }

  let attachmentsImported = 0;
  let attachmentsSkipped = 0;
  let attachmentsEncryptedSkipped = 0;

  // Import attachment sidecars BEFORE replacing the workspace. Attachments are
  // content-addressed by id and additive (existing blobs are left in place), so
  // writing them first is harmless even if the workspace import later fails —
  // whereas committing the workspace first and then hitting a catastrophic
  // attachment failure would leave a freshly-replaced workspace referencing
  // images that were never written, with no way back.
  for (const [id, bytes] of read.bundle.attachments) {
    if (!bytes.length) {
      attachmentsSkipped += 1;
      continue;
    }
    const outcome = await importAttachmentBytes(userId, id, bytes);
    if (outcome === 'imported') attachmentsImported += 1;
    else if (outcome === 'encrypted') attachmentsEncryptedSkipped += 1;
    else attachmentsSkipped += 1;
  }

  const r = await importWorkspace(workspace);
  if (!r.ok) return r;

  revokeAttachmentBlobUrls();
  return {
    ok: true,
    attachmentsImported,
    attachmentsSkipped,
    ...(attachmentsEncryptedSkipped > 0 ? { attachmentsEncryptedSkipped } : {}),
  };
}

/**
 * Import a portable ZIP or a legacy single-file JSON export.
 * ZIP replaces workspace + attachment sidecars; JSON-only keeps prior behaviour.
 */
export async function importPortableBackupFile(
  file: File,
  deps: ImportPortableBackupDeps,
): Promise<BackupImportResult | { ok: false; error: string }> {
  const read = await readPortableBackupFile(file);
  if (!read.ok) return read;
  const toImport = deps.transformWorkspace ? deps.transformWorkspace(read.workspace) : read.workspace;
  return applyReadPortable(read, toImport, deps.userId, deps.importWorkspace);
}

/** What the import dialog needs from a file opened in the browser. */
export type OpenedPortableBackup = {
  ok: true;
  preview: BackupPreview;
  /** The backup's workspace, parsed; the caller decides what to import (as it is, or merged). */
  workspace: AppData;
  apply: (
    workspace: AppData,
    importWorkspace: ImportPortableBackupDeps['importWorkspace'],
  ) => Promise<BackupImportResult | { ok: false; error: string }>;
};

/** Step one of a browser import: look inside the file and change nothing. */
export async function openPortableBackupFile(
  file: File,
  userId: string,
): Promise<OpenedPortableBackup | { ok: false; error: string }> {
  const read = await readPortableBackupFile(file);
  if (!read.ok) return read;
  const d = read.workspace;
  const manifest = read.bundle?.manifest ?? null;
  return {
    ok: true,
    workspace: d,
    preview: {
      fileName: file.name,
      kind: read.kind,
      exportedAt: manifest?.exportedAt,
      counts: { notes: d.notes.length, todoItems: d.todoItems.length, teams: d.teams.length },
      images: read.bundle?.attachments.size ?? 0,
      imagesSkippedAtExport: manifest?.attachmentMissing ?? 0,
      historyNotes: 0,
      historyVersions: 0,
    },
    apply: (workspace, importWorkspace) => applyReadPortable(read, workspace, userId, importWorkspace),
  };
}
