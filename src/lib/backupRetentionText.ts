import type { BackupRetentionDeleteCounts, BackupRetentionRequest } from '../vite-env';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Label for one choice in the daily-folder select. */
export function mirrorKeepLabel(keep: number, isDefault: boolean): string {
  const base = keep === 2 ? 'Today and yesterday (newest 2 daily folders)' : `Newest ${keep} daily folders`;
  return `${base}${isDefault ? ' (default)' : ''}`;
}

/** Label for one choice in the in-app snapshot select. */
export function snapshotKeepLabel(keep: number, isDefault: boolean): string {
  return `Newest ${keep} routine snapshots${isDefault ? ' (default)' : ''}`;
}

/**
 * The confirmation text for a retention change that deletes existing backups.
 * Says exactly what goes and what stays, so "OK" is an informed answer.
 */
export function describeRetentionLoss(
  willDelete: BackupRetentionDeleteCounts,
  request: BackupRetentionRequest,
): string {
  const parts: string[] = [];
  if (willDelete.mirrorFolders > 0) {
    parts.push(
      `${plural(willDelete.mirrorFolders, 'older daily backup folder', 'older daily backup folders')}` +
        (request.mirrorKeep ? ` (the newest ${request.mirrorKeep} stay)` : ''),
    );
  }
  if (willDelete.snapshotSets > 0) {
    parts.push(
      `${plural(willDelete.snapshotSets, 'older in-app snapshot', 'older in-app snapshots')}` +
        (request.snapshotRoutineKeep ? ` (the newest ${request.snapshotRoutineKeep} stay)` : ''),
    );
  }
  return `This permanently deletes ${parts.join(' and ')}. The newest backup is always kept. This cannot be undone.`;
}

/** The size of the in-app snapshot safety net: the user's choice, or the long-standing 50 until it is known. */
export function snapshotSafetyNetText(keep: number | null | undefined): string {
  const n = typeof keep === 'number' && keep > 0 ? keep : 50;
  return `routine copies, newest ${n} kept`;
}
