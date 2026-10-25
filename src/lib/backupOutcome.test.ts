import { describe, expect, it } from 'vitest';
import { describeRestoreOutcome } from './backupOutcome';

describe('describeRestoreOutcome', () => {
  it('is complete and quiet about gaps when nothing was lost', () => {
    const o = describeRestoreOutcome({ attachmentsRestored: 3, attachmentsFailed: 0, historyIncomplete: false });
    expect(o.incomplete).toBe(false);
    expect(o.detail).toContain('3 images restored');
    expect(o.detail).not.toMatch(/could not/i);
  });

  it('is complete without a count when the backup has no images', () => {
    const o = describeRestoreOutcome({ attachmentsRestored: 0, attachmentsFailed: 0 });
    expect(o.incomplete).toBe(false);
    expect(o.detail).toBe('');
  });

  it('names the images that could not be copied and marks the restore incomplete', () => {
    const o = describeRestoreOutcome({ attachmentsRestored: 2, attachmentsFailed: 1 });
    expect(o.incomplete).toBe(true);
    expect(o.detail).toContain('1 image could not be copied');
  });

  it('counts images that could not be read (encrypted for another account) as a gap too', () => {
    const o = describeRestoreOutcome({ attachmentsRestored: 0, attachmentsSkipped: 4 });
    expect(o.incomplete).toBe(true);
    expect(o.detail).toContain('4 images could not be read');
  });

  it('marks an unfinished note history', () => {
    const o = describeRestoreOutcome({ attachmentsRestored: 0, historyIncomplete: true });
    expect(o.incomplete).toBe(true);
    expect(o.detail).toMatch(/note history/i);
  });

  it('always tells the user their notes and tasks were restored when something is missing', () => {
    expect(describeRestoreOutcome({ attachmentsFailed: 1 }).detail).toMatch(/notes and tasks were restored/i);
  });

  it('does not talk about a snapshot when an import (not a restore) was incomplete', () => {
    const o = describeRestoreOutcome({ attachmentsFailed: 1 }, 'import');
    expect(o.detail).toMatch(/notes and tasks were imported/i);
    expect(o.detail).not.toMatch(/snapshot|restored/i);
    expect(o.detail).toMatch(/backup file is unchanged/i);
  });

  it('tells a browser user which images need the desktop app', () => {
    const o = describeRestoreOutcome({ attachmentsEncryptedSkipped: 2 }, 'import');
    expect(o.incomplete).toBe(true);
    expect(o.detail).toContain('2 encrypted images need the desktop app to import');
    expect(o.detail).not.toMatch(/re-export/i);
  });
});
