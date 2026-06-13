import { describe, expect, it } from 'vitest';
import { zipStorePack, zipStoreUnpack } from './zipStore';
import { parseBundleEntries, resolveBundleRoot } from './parse';
import { BACKUP_DATA_FILE } from './types';

describe('backupBundle zipStore', () => {
  it('round-trips multiple files', () => {
    const enc = new TextEncoder();
    const files = {
      'data.json': enc.encode('{"notes":[]}'),
      'attachments/note-abcd12345678.bin': enc.encode('fake-image'),
    };
    const zip = zipStorePack(files);
    const out = zipStoreUnpack(zip);
    expect(new TextDecoder().decode(out['data.json'])).toBe('{"notes":[]}');
    expect(new TextDecoder().decode(out['attachments/note-abcd12345678.bin'])).toBe('fake-image');
  });
});

describe('backupBundle parse', () => {
  it('finds data.json inside a single top-level folder', () => {
    const prefix = resolveBundleRoot([
      'cadence-backup-2026/data.json',
      'cadence-backup-2026/attachments/x.bin',
    ]);
    expect(prefix).toBe('cadence-backup-2026/');
  });

  it('parses workspace and attachments', () => {
    const enc = new TextEncoder();
    const bundle = parseBundleEntries({
      [BACKUP_DATA_FILE]: enc.encode(
        JSON.stringify({ notes: [{ id: 'n1', title: 'T', body: '' }], teams: [] }),
      ),
      'manifest.json': enc.encode(
        JSON.stringify({
          format: 'cadence-bundle-v2',
          exportedAt: '2026-01-01',
          attachmentsPortable: true,
          attachmentCount: 1,
        }),
      ),
      'attachments/note-abcd12345678.bin': enc.encode('img-bytes'),
    });
    expect(bundle.manifest?.attachmentCount).toBe(1);
    expect(bundle.attachments.get('note-abcd12345678')?.length).toBeGreaterThan(0);
  });

  it('rejects archives over the size guard', async () => {
    const { importPortableBackupFile } = await import('./portable');
    const huge = new File([new Uint8Array(1)], 'big.zip', { type: 'application/zip' });
    Object.defineProperty(huge, 'size', { value: 300 * 1024 * 1024 });
    const r = await importPortableBackupFile(huge, {
      userId: 'u1',
      importWorkspace: async () => ({ ok: true }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });
});
