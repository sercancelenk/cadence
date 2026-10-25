import { describe, expect, it } from 'vitest';
import { BACKUP_NOT_ENCRYPTED_NOTE, backupSavedDetail, skippedImagesNote } from './backupPrivacyCopy';

describe('backup privacy copy', () => {
  it('says the exported file is not encrypted and should be kept private', () => {
    expect(BACKUP_NOT_ENCRYPTED_NOTE).toMatch(/not encrypted/i);
    expect(BACKUP_NOT_ENCRYPTED_NOTE).toMatch(/private/i);
  });

  it('appends the reminder to the saved message once', () => {
    const detail = backupSavedDetail('3 images included.');
    expect(detail.startsWith('3 images included.')).toBe(true);
    expect(detail).toMatch(/not encrypted/i);
    expect(backupSavedDetail(detail)).toBe(detail);
  });

  it('names the images a backup could not include, and stays silent when none were missed', () => {
    expect(skippedImagesNote(0)).toBe('');
    expect(skippedImagesNote(undefined)).toBe('');
    expect(skippedImagesNote(1)).toMatch(/^1 image could not be read/);
    expect(skippedImagesNote(3)).toMatch(/^3 images could not be read/);
    expect(skippedImagesNote(3)).toMatch(/not complete/i);
  });
});
