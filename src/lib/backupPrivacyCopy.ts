/** Shown beside the export buttons: backups are readable files, so how they travel is the user's call. */
export const BACKUP_NOT_ENCRYPTED_NOTE =
  'An exported backup is not encrypted: anyone who gets the file can read it. Keep it somewhere private and delete it when you no longer need it.';

const SAVED_REMINDER = 'The file is not encrypted — keep it private.';

/** The detail line of a "backup saved" toast, with the privacy reminder added once. */
export function backupSavedDetail(detail: string): string {
  return detail.includes(SAVED_REMINDER) ? detail : `${detail} ${SAVED_REMINDER}`;
}

/** Extra line for a backup that left images out because they could not be read. Empty when none were missed. */
export function skippedImagesNote(skipped: number | undefined): string {
  if (!skipped || skipped < 1) return '';
  return `${skipped} image${skipped === 1 ? '' : 's'} could not be read and ${skipped === 1 ? 'is' : 'are'} not in this backup, so it is not complete. Keep your current data too.`;
}
