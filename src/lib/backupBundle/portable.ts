import { APP_SLUG } from '../appBranding';
import { collectReferencedAttachmentIds } from '../richTextAttachmentIndex';
import {
  importAttachmentBlob,
  readAttachmentBlobForSync,
  revokeAttachmentBlobUrls,
} from '../richTextAttachmentStore';
import { appDataToPersistJson, normalizeData, type AppData } from '../../model';
import { parseRemoteSnapshot, snapshotParseErrorMessage } from '../syncSnapshotGuard';
import { parseBundleEntries } from './parse';
import {
  BACKUP_ATTACHMENTS_DIR,
  BACKUP_BUNDLE_FORMAT,
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
  type BackupImportResult,
  type BackupManifest,
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

  files[BACKUP_DATA_FILE] = enc.encode(appDataToPersistJson(normalized));

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

/**
 * Import a portable ZIP or a legacy single-file JSON export.
 * ZIP replaces workspace + attachment sidecars; JSON-only keeps prior behaviour.
 */
export async function importPortableBackupFile(
  file: File,
  deps: ImportPortableBackupDeps,
): Promise<BackupImportResult | { ok: false; error: string }> {
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
    const toImport = deps.transformWorkspace ? deps.transformWorkspace(parsed.data) : parsed.data;
    const r = await deps.importWorkspace(toImport);
    if (!r.ok) return r;
    revokeAttachmentBlobUrls();
    return { ok: true, attachmentsImported: 0, attachmentsSkipped: 0, attachmentsEncryptedSkipped: 0 };
  }

  if (!name.endsWith('.zip')) {
    return { ok: false, error: 'Choose a .zip portable backup or a .json workspace file.' };
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

  let bundle;
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

  let attachmentsImported = 0;
  let attachmentsSkipped = 0;
  let attachmentsEncryptedSkipped = 0;

  const toImport = deps.transformWorkspace ? deps.transformWorkspace(parsed.data) : parsed.data;
  const r = await deps.importWorkspace(toImport);
  if (!r.ok) return r;

  for (const [id, bytes] of bundle.attachments) {
    if (!bytes.length) {
      attachmentsSkipped += 1;
      continue;
    }
    const outcome = await importAttachmentBytes(deps.userId, id, bytes);
    if (outcome === 'imported') attachmentsImported += 1;
    else if (outcome === 'encrypted') attachmentsEncryptedSkipped += 1;
    else attachmentsSkipped += 1;
  }

  revokeAttachmentBlobUrls();
  return {
    ok: true,
    attachmentsImported,
    attachmentsSkipped,
    ...(attachmentsEncryptedSkipped > 0 ? { attachmentsEncryptedSkipped } : {}),
  };
}
