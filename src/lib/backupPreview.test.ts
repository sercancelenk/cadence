import { describe, expect, it } from 'vitest';
import { backupWarnings, describeBackupContents, previewFromOpenResult, type BackupPreview } from './backupPreview';

const base: BackupPreview = {
  fileName: 'cadence-backup-2026-10-25.zip',
  kind: 'zip',
  counts: { notes: 7, todoItems: 4, teams: 1 },
  images: 12,
  imagesSkippedAtExport: 0,
  historyNotes: 3,
  historyVersions: 9,
};

describe('describeBackupContents', () => {
  it('lists notes, tasks, teams, images and history in plain words', () => {
    expect(describeBackupContents(base)).toEqual([
      '7 notes, 4 tasks, 1 team',
      '12 images',
      'Version history for 3 notes (9 versions)',
    ]);
  });

  it('uses singular forms', () => {
    const lines = describeBackupContents({ ...base, counts: { notes: 1, todoItems: 1, teams: 0 }, images: 1, historyNotes: 1, historyVersions: 1 });
    expect(lines).toEqual(['1 note, 1 task', '1 image', 'Version history for 1 note (1 version)']);
  });

  it('says what a backup without images or history does not carry instead of listing zeros', () => {
    const lines = describeBackupContents({ ...base, images: 0, historyNotes: 0, historyVersions: 0 });
    expect(lines).toEqual(['7 notes, 4 tasks, 1 team', 'No images', 'No version history']);
  });

  it('copes with a backup whose contents could not be counted', () => {
    expect(describeBackupContents({ ...base, counts: null })[0]).toBe('Notes and tasks');
  });
});

describe('backupWarnings', () => {
  it('is quiet for a complete backup', () => {
    expect(backupWarnings(base)).toEqual([]);
  });

  it('warns that images were left out when the backup was made', () => {
    expect(backupWarnings({ ...base, imagesSkippedAtExport: 2 })).toEqual([
      '2 images could not be read when this backup was made, so they are not in it.',
    ]);
  });

  it('explains that a JSON file carries text only', () => {
    expect(backupWarnings({ ...base, kind: 'json', images: 0, historyNotes: 0, historyVersions: 0 })[0]).toMatch(/text only/i);
  });
});

describe('previewFromOpenResult', () => {
  it('maps what the desktop app reports', () => {
    const p = previewFromOpenResult({
      ok: true,
      kind: 'zip',
      fileName: 'a.zip',
      exportedAt: '2026-10-25T10:00:00.000Z',
      counts: { notes: 2, todoItems: 0, teams: 0 },
      attachments: { count: 5, skippedAtExport: 1 },
      history: { notes: 2, revisions: 6 },
    });
    expect(p).toMatchObject({ fileName: 'a.zip', kind: 'zip', images: 5, imagesSkippedAtExport: 1, historyNotes: 2, historyVersions: 6 });
    expect(p.exportedAt).toBe('2026-10-25T10:00:00.000Z');
  });

  it('fills what an older or thinner answer leaves out', () => {
    const p = previewFromOpenResult({ ok: true, kind: 'json', fileName: 'w.json' });
    expect(p).toMatchObject({ images: 0, imagesSkippedAtExport: 0, historyNotes: 0, historyVersions: 0, counts: null });
  });
});
