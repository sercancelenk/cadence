import { describe, expect, it } from 'vitest';
import { zipStorePack, zipStoreUnpack } from './zipStore';
import { isSafeBundleEntryPath, parseBundleEntries, resolveBundleRoot } from './parse';
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

  it('rejects invalid and unsupported ZIP archives', () => {
    expect(zipStoreUnpack(new Uint8Array(10))).toEqual({});
    expect(() => zipStoreUnpack(new Uint8Array(22))).toThrow(/Not a valid ZIP archive/i);

    const zip = zipStorePack({ 'data.json': new TextEncoder().encode('{}') });
    const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    let centralOffset = -1;
    for (let i = 0; i < zip.length - 4; i++) {
      if (dv.getUint32(i, true) === 0x02014b50) {
        centralOffset = i;
        break;
      }
    }
    expect(centralOffset).toBeGreaterThan(0);
    dv.setUint16(centralOffset + 10, 8);
    expect(() => zipStoreUnpack(zip)).toThrow(/Unsupported ZIP compression/i);

    const corrupt = zip.slice();
    const corruptDv = new DataView(corrupt.buffer, corrupt.byteOffset, corrupt.byteLength);
    corruptDv.setUint32(centralOffset, 0);
    expect(() => zipStoreUnpack(corrupt)).toThrow(/central directory is corrupt/i);

    const missingLocal = zip.slice();
    const missingLocalDv = new DataView(missingLocal.buffer, missingLocal.byteOffset, missingLocal.byteLength);
    const localOffset = missingLocalDv.getUint32(centralOffset + 42, true);
    missingLocalDv.setUint32(localOffset, 0);
    expect(() => zipStoreUnpack(missingLocal)).toThrow(/local header missing/i);
  });
});

describe('backupBundle parse', () => {
  it('rejects unsafe archive entry paths', () => {
    expect(isSafeBundleEntryPath('')).toBe(false);
    expect(isSafeBundleEntryPath('folder\\data.json')).toBe(false);
    expect(isSafeBundleEntryPath('.hidden')).toBe(false);
    expect(isSafeBundleEntryPath('attachments/../data.json')).toBe(false);
  });

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
      'attachments/note-legacy12345678.cadenc': enc.encode('legacy-bytes'),
      'attachments/nested/extra.bin': enc.encode('skip'),
    });
    expect(bundle.manifest?.attachmentCount).toBe(1);
    expect(bundle.attachments.get('note-abcd12345678')?.length).toBeGreaterThan(0);
    expect(bundle.attachments.get('note-legacy12345678')?.length).toBeGreaterThan(0);
    expect(bundle.attachments.has('nested/extra')).toBe(false);
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

  it('rejects unsafe and nested bundle layouts', () => {
    expect(isSafeBundleEntryPath('../data.json')).toBe(false);
    expect(isSafeBundleEntryPath('__MACOSX/foo')).toBe(false);
    expect(() => parseBundleEntries({})).toThrow(/missing data\.json/i);
    const enc = new TextEncoder();
    expect(() =>
      parseBundleEntries({
        'folder-a/data.json': enc.encode('{}'),
        'folder-b/data.json': enc.encode('{}'),
      }),
    ).toThrow(/multiple folders/i);
    expect(() =>
      parseBundleEntries({
        [BACKUP_DATA_FILE]: enc.encode('not-json'),
      }),
    ).toThrow(/not valid JSON/i);
  });

  it('unwraps commit envelopes and tolerates broken manifests', () => {
    const enc = new TextEncoder();
    const bundle = parseBundleEntries({
      [BACKUP_DATA_FILE]: enc.encode(
        JSON.stringify({
          magic: 'CDNC1',
          workspace: { notes: [{ id: 'n1', title: 'T', body: '' }], teams: [] },
        }),
      ),
      'manifest.json': enc.encode('not-json'),
    });
    expect(bundle.manifest).toBeNull();
    expect(bundle.workspaceRaw).toEqual({
      notes: [{ id: 'n1', title: 'T', body: '' }],
      teams: [],
    });
  });

  it('ignores manifests with an unknown format', () => {
    const enc = new TextEncoder();
    const bundle = parseBundleEntries({
      [BACKUP_DATA_FILE]: enc.encode(JSON.stringify({ notes: [], teams: [] })),
      'manifest.json': enc.encode(JSON.stringify({ format: 'legacy-v1', exportedAt: '2026-01-01' })),
    });
    expect(bundle.manifest).toBeNull();
  });
});
