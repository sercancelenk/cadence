import { describe, expect, it } from 'vitest';
import {
  BACKUP_ATTACHMENTS_DIR,
  BACKUP_BUNDLE_FORMAT,
  BACKUP_DATA_FILE,
  BACKUP_MANIFEST_FILE,
} from './types';

describe('backupBundle types', () => {
  it('exports stable on-disk layout constants', () => {
    expect(BACKUP_BUNDLE_FORMAT).toBe('cadence-bundle-v2');
    expect(BACKUP_DATA_FILE).toBe('data.json');
    expect(BACKUP_MANIFEST_FILE).toBe('manifest.json');
    expect(BACKUP_ATTACHMENTS_DIR).toBe('attachments');
  });
});
