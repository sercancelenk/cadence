/** What a restore or import brought back besides the workspace itself. All fields are optional: older builds send fewer. */
export type RestoreCounts = {
  attachmentsRestored?: number;
  /** Images that could not be copied into place. */
  attachmentsFailed?: number;
  /** Images that could not be read (for example sealed for another account). */
  attachmentsSkipped?: number;
  historyIncomplete?: boolean;
};

const images = (n: number) => `${n} image${n === 1 ? '' : 's'}`;

/**
 * The sentence for a finished restore. The workspace is always already replaced when this is called, so a gap
 * is reported as "incomplete", never as a failure, and the text says the notes and tasks are in.
 */
export function describeRestoreOutcome(c: RestoreCounts): { detail: string; incomplete: boolean } {
  const parts: string[] = [];
  const restored = c.attachmentsRestored ?? 0;
  const failed = c.attachmentsFailed ?? 0;
  const skipped = c.attachmentsSkipped ?? 0;
  if (restored > 0) parts.push(`${images(restored)} restored.`);
  if (failed > 0) parts.push(`${images(failed)} could not be copied.`);
  if (skipped > 0) parts.push(`${images(skipped)} could not be read — re-export a full backup from the source account.`);
  if (c.historyIncomplete) parts.push('Some note history could not be brought back.');
  const incomplete = failed > 0 || skipped > 0 || !!c.historyIncomplete;
  if (incomplete) parts.push('Your notes and tasks were restored; the snapshot you restored from is still there to try again.');
  return { detail: parts.join(' '), incomplete };
}
