import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATA_VERSION, emptyData, normalizeData, type AppData } from '../../model';
import { zipStorePack } from './zipStore';
import {
  BACKUP_ATTACHMENTS_DIR,
  BACKUP_BUNDLE_FORMAT,
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
} from './types';

const attachmentMocks = vi.hoisted(() => ({
  readAttachmentBlobForSync: vi.fn(),
  importAttachmentBlob: vi.fn().mockResolvedValue(undefined),
  revokeAttachmentBlobUrls: vi.fn(),
  collectReferencedAttachmentIds: vi.fn(() => [] as string[]),
}));

vi.mock('../richTextAttachmentStore', () => ({
  readAttachmentBlobForSync: attachmentMocks.readAttachmentBlobForSync,
  importAttachmentBlob: attachmentMocks.importAttachmentBlob,
  revokeAttachmentBlobUrls: attachmentMocks.revokeAttachmentBlobUrls,
}));

vi.mock('../richTextAttachmentIndex', () => ({
  collectReferencedAttachmentIds: attachmentMocks.collectReferencedAttachmentIds,
}));

const TS = '2026-06-01T12:00:00.000Z';

function minimalWorkspace(): AppData {
  return normalizeData({
    teams: [{ id: 't1', name: 'Team', createdAt: TS, status: 'active' }],
    notes: [{ id: 'n1', title: 'Note', body: '', createdAt: TS, updatedAt: TS }],
  });
}

function buildPortableZip(extra?: Record<string, Uint8Array>): File {
  const enc = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    [BACKUP_DATA_FILE]: enc.encode(JSON.stringify(minimalWorkspace())),
    [BACKUP_MANIFEST_FILE]: enc.encode(
      JSON.stringify({
        format: BACKUP_BUNDLE_FORMAT,
        exportedAt: TS,
        attachmentsPortable: true,
        attachmentCount: 0,
      }),
    ),
    ...extra,
  };
  return new File([zipStorePack(files)], 'cadence-backup.zip', { type: 'application/zip' });
}

describe('portable backup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { cadence?: unknown }).cadence;
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValue({
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports a ZIP with referenced attachments', async () => {
    attachmentMocks.collectReferencedAttachmentIds.mockReturnValue(['note-abc123456789']);
    attachmentMocks.readAttachmentBlobForSync.mockResolvedValue(new Blob(['img'], { type: 'image/png' }));
    const { exportPortableBackupZip } = await import('./portable');
    const result = await exportPortableBackupZip('user-1', minimalWorkspace());
    expect(result.attachmentCount).toBe(1);
    expect(result.attachmentMissing).toBe(0);
    expect(result.filename).toMatch(/\.zip$/);
  });

  it('counts missing attachments during export', async () => {
    attachmentMocks.collectReferencedAttachmentIds.mockReturnValue(['note-missing12345']);
    attachmentMocks.readAttachmentBlobForSync.mockResolvedValue(null);
    const { exportPortableBackupZip } = await import('./portable');
    const result = await exportPortableBackupZip('user-1', emptyData());
    expect(result.attachmentCount).toBe(0);
    expect(result.attachmentMissing).toBe(1);
  });

  it('imports a JSON workspace export', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const importWorkspace = vi.fn().mockResolvedValue({ ok: true });
    const file = new File([JSON.stringify(minimalWorkspace())], 'workspace.json', {
      type: 'application/json',
    });
    const result = await importPortableBackupFile(file, { userId: 'u1', importWorkspace });
    expect(result).toEqual({
      ok: true,
      attachmentsImported: 0,
      attachmentsSkipped: 0,
      attachmentsEncryptedSkipped: 0,
    });
    expect(importWorkspace).toHaveBeenCalledTimes(1);
    expect(attachmentMocks.revokeAttachmentBlobUrls).toHaveBeenCalled();
  });

  it('rejects invalid JSON imports', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const file = new File(['{not json'], 'broken.json', { type: 'application/json' });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: false, error: 'File is not valid JSON.' });
  });

  it('rejects unsupported JSON workspace versions', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const file = new File(
      [
        JSON.stringify({
          version: DATA_VERSION + 1,
          teams: [{ id: 't1', name: 'A', createdAt: TS, status: 'active' }],
          notes: [{ id: 'n1', title: 'N', body: '', createdAt: TS, updatedAt: TS }],
        }),
      ],
      'future.json',
      { type: 'application/json' },
    );
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/data version/i);
  });

  it('rejects unknown file extensions', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const result = await importPortableBackupFile(new File(['x'], 'backup.txt'), {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/\.zip|\.json/i);
  });

  it('rejects archives over the size guard', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const huge = new File([new Uint8Array(1)], 'big.zip', { type: 'application/zip' });
    Object.defineProperty(huge, 'size', { value: 300 * 1024 * 1024 });
    const result = await importPortableBackupFile(huge, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large/i);
  });

  it('imports a portable ZIP with plain image attachments', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const importWorkspace = vi.fn().mockResolvedValue({ ok: true });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-abc123456789.bin`]: jpeg,
    });
    const result = await importPortableBackupFile(file, { userId: 'u1', importWorkspace });
    expect(result).toEqual({ ok: true, attachmentsImported: 1, attachmentsSkipped: 0 });
    expect(attachmentMocks.importAttachmentBlob).toHaveBeenCalled();
  });

  it('blocks encrypted attachments on web without desktop bridge', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const encrypted = new TextEncoder().encode(
      JSON.stringify({ magic: 'LDMN1', iv: 'abc', ct: 'def' }),
    );
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-enc123456789.bin`]: encrypted,
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/encrypted image/i);
  });

  it('imports encrypted attachments through the desktop bridge', async () => {
    const importPortable = vi.fn().mockResolvedValue({ ok: true });
    (window as { cadence?: { attachmentImportPortable?: typeof importPortable } }).cadence = {
      attachmentImportPortable: importPortable,
    };
    const { importPortableBackupFile } = await import('./portable');
    const encrypted = new TextEncoder().encode(
      JSON.stringify({ magic: 'LDMN1', iv: 'abc', ct: 'def' }),
    );
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-enc123456789.bin`]: encrypted,
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, attachmentsImported: 1, attachmentsSkipped: 0 });
    expect(importPortable).toHaveBeenCalled();
  });

  it('reports corrupt ZIP archives', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const result = await importPortableBackupFile(new File([new Uint8Array([1, 2, 3])], 'bad.zip'), {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('skips empty attachment blobs and failed imports', async () => {
    attachmentMocks.importAttachmentBlob.mockRejectedValueOnce(new Error('disk full'));
    const { importPortableBackupFile } = await import('./portable');
    const empty = new Uint8Array();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-empty12345678.bin`]: empty,
      [`${BACKUP_ATTACHMENTS_DIR}/note-bad1234567890.bin`]: jpeg,
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, attachmentsImported: 0, attachmentsSkipped: 2 });
  });

  it('counts encrypted import failures from the desktop bridge', async () => {
    (window as { cadence?: { attachmentImportPortable?: ReturnType<typeof vi.fn> } }).cadence = {
      attachmentImportPortable: vi.fn().mockResolvedValue({ ok: false }),
    };
    const { importPortableBackupFile } = await import('./portable');
    const encrypted = new TextEncoder().encode(
      JSON.stringify({ magic: 'LDMN1', iv: 'abc', ct: 'def' }),
    );
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-enc123456789.bin`]: encrypted,
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, attachmentsImported: 0, attachmentsSkipped: 1 });
  });

  it('rejects ZIP bundles missing data.json', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const file = new File([zipStorePack({ 'readme.txt': new TextEncoder().encode('hi') })], 'empty.zip');
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/data\.json/i);
  });

  it('imports webp attachments by sniffing mime type', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const webp = new Uint8Array(16);
    webp[0] = 0x52;
    webp[8] = 0x57;
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-webp123456789.bin`]: webp,
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, attachmentsImported: 1, attachmentsSkipped: 0 });
    expect(attachmentMocks.importAttachmentBlob).toHaveBeenCalledWith(
      'u1',
      'note-webp123456789',
      expect.any(Blob),
      'image/webp',
    );
  });

  it('rejects ZIP bundles with unrecognisable workspace data', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const enc = new TextEncoder();
    const file = new File(
      [
        zipStorePack({
          [BACKUP_DATA_FILE]: enc.encode('{}'),
          [BACKUP_MANIFEST_FILE]: enc.encode(
            JSON.stringify({
              format: BACKUP_BUNDLE_FORMAT,
              exportedAt: TS,
              attachmentsPortable: true,
              attachmentCount: 0,
            }),
          ),
        }),
      ],
      'empty-workspace.zip',
    );
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unrecognisable shape/i);
  });

  it('uses singular wording for one encrypted attachment', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const encrypted = new TextEncoder().encode(
      JSON.stringify({ magic: 'LDMN1', iv: 'abc', ct: 'def' }),
    );
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-enc123456789.bin`]: encrypted,
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/1 encrypted image\./);
  });

  it('imports unknown image bytes with a default webp mime', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-raw1234567890.bin`]: new Uint8Array([1, 2, 3, 4]),
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, attachmentsImported: 1, attachmentsSkipped: 0 });
    expect(attachmentMocks.importAttachmentBlob).toHaveBeenCalledWith(
      'u1',
      'note-raw1234567890',
      expect.any(Blob),
      'image/webp',
    );
  });

  it('surfaces non-Error ZIP unpack failures', async () => {
    const zipStore = await import('./zipStore');
    vi.spyOn(zipStore, 'zipStoreUnpack').mockImplementation(() => {
      throw 'bad zip';
    });
    const { importPortableBackupFile } = await import('./portable');
    const result = await importPortableBackupFile(buildPortableZip(), {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: false, error: 'Could not read ZIP archive.' });
    vi.restoreAllMocks();
  });

  it('treats malformed encrypted sidecars as plain attachments', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const file = buildPortableZip({
      [`${BACKUP_ATTACHMENTS_DIR}/note-badenc12345678.bin`]: new TextEncoder().encode('{not-json'),
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(result).toEqual({ ok: true, attachmentsImported: 1, attachmentsSkipped: 0 });
  });

  it('propagates importWorkspace failures', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const file = new File([JSON.stringify(minimalWorkspace())], 'workspace.json', {
      type: 'application/json',
    });
    const result = await importPortableBackupFile(file, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: false, error: 'Workspace busy' }),
    });
    expect(result).toEqual({ ok: false, error: 'Workspace busy' });
  });
});
