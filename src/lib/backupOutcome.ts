/** What a restore or import brought back besides the workspace itself. All fields are optional: older builds send fewer. */
export type RestoreCounts = {
  attachmentsRestored?: number;
  /** Images that could not be copied into place. */
  attachmentsFailed?: number;
  /** Images that could not be read (for example sealed for another account). */
  attachmentsSkipped?: number;
  /** Sealed images a browser cannot open; the desktop app can. */
  attachmentsEncryptedSkipped?: number;
  historyIncomplete?: boolean;
};

/** A restore brings back a snapshot of this device; an import brings in a backup file. */
export type RestoreContext = 'restore' | 'import';

const images = (n: number) => `${n} image${n === 1 ? '' : 's'}`;

/**
 * The sentence for a finished restore. The workspace is always already replaced when this is called, so a gap
 * is reported as "incomplete", never as a failure, and the text says the notes and tasks are in.
 */
export function describeRestoreOutcome(c: RestoreCounts, context: RestoreContext = 'restore'): { detail: string; incomplete: boolean } {
  const parts: string[] = [];
  const restored = c.attachmentsRestored ?? 0;
  const failed = c.attachmentsFailed ?? 0;
  const skipped = c.attachmentsSkipped ?? 0;
  const sealed = c.attachmentsEncryptedSkipped ?? 0;
  if (restored > 0) parts.push(`${images(restored)} restored.`);
  if (failed > 0) parts.push(`${images(failed)} could not be copied.`);
  if (skipped > 0) parts.push(`${images(skipped)} could not be read — re-export a full backup from the source account.`);
  if (sealed > 0) parts.push(`${sealed} encrypted ${sealed === 1 ? 'image needs' : 'images need'} the desktop app to import.`);
  if (c.historyIncomplete) parts.push('Some note history could not be brought back.');
  const incomplete = failed > 0 || skipped > 0 || sealed > 0 || !!c.historyIncomplete;
  if (incomplete) {
    parts.push(
      context === 'import'
        ? 'Your notes and tasks were imported; the backup file is unchanged, so you can try again.'
        : 'Your notes and tasks were restored; the snapshot you restored from is still there to try again.',
    );
  }
  return { detail: parts.join(' '), incomplete };
}
