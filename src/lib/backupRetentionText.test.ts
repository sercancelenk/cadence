import { describe, expect, it } from 'vitest';
import { describeRetentionLoss, mirrorKeepLabel, snapshotKeepLabel, snapshotSafetyNetText } from './backupRetentionText';

describe('describeRetentionLoss', () => {
  it('names both kinds of backup, their counts and what stays', () => {
    const text = describeRetentionLoss(
      { mirrorFolders: 12, snapshotSets: 18 },
      { mirrorKeep: 7, snapshotRoutineKeep: 30 },
    );
    expect(text).toContain('12 older daily backup folders (the newest 7 stay)');
    expect(text).toContain('18 older in-app snapshots (the newest 30 stay)');
    expect(text).toContain('cannot be undone');
  });

  it('mentions only what is actually deleted, with singular wording', () => {
    const text = describeRetentionLoss({ mirrorFolders: 1, snapshotSets: 0 }, { mirrorKeep: 3 });
    expect(text).toContain('1 older daily backup folder (the newest 3 stay)');
    expect(text).not.toContain('snapshot');
  });
});

describe('choice labels', () => {
  it('marks the long-standing size as the default', () => {
    expect(mirrorKeepLabel(30, true)).toBe('Newest 30 daily folders (default)');
    expect(mirrorKeepLabel(7, false)).toBe('Newest 7 daily folders');
    expect(snapshotKeepLabel(50, true)).toBe('Newest 50 routine snapshots (default)');
  });
});

describe('snapshotSafetyNetText', () => {
  it('follows the number the user chose', () => {
    expect(snapshotSafetyNetText(20)).toContain('20');
    expect(snapshotSafetyNetText(20)).not.toContain('50');
  });

  it('says 50 when the choice is not known yet, the long-standing size', () => {
    expect(snapshotSafetyNetText(null)).toContain('50');
    expect(snapshotSafetyNetText(undefined)).toContain('50');
  });
});
