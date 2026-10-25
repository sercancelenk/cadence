import type { BackupArchiveOpenResult } from '../vite-env';

/** What the import dialog shows about a backup file before anything is changed. */
export type BackupPreview = {
  fileName: string;
  kind: 'zip' | 'json';
  exportedAt?: string;
  counts: { notes?: number; todoItems?: number; teams?: number } | null;
  images: number;
  /** Images that could not be read when the backup was made. */
  imagesSkippedAtExport: number;
  historyNotes: number;
  historyVersions: number;
};

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function previewFromOpenResult(r: BackupArchiveOpenResult): BackupPreview {
  return {
    fileName: r.fileName ?? 'backup',
    kind: r.kind === 'json' ? 'json' : 'zip',
    exportedAt: r.exportedAt,
    counts: r.counts ?? null,
    images: r.attachments?.count ?? 0,
    imagesSkippedAtExport: r.attachments?.skippedAtExport ?? 0,
    historyNotes: r.history?.notes ?? 0,
    historyVersions: r.history?.revisions ?? 0,
  };
}

/** One line per kind of content. A kind that is absent says so, because "No version history" is information. */
export function describeBackupContents(p: BackupPreview): string[] {
  const lines: string[] = [];
  if (!p.counts) {
    lines.push('Notes and tasks');
  } else {
    const parts = [
      count(p.counts.notes ?? 0, 'note', 'notes'),
      count(p.counts.todoItems ?? 0, 'task', 'tasks'),
    ];
    if (p.counts.teams) parts.push(count(p.counts.teams, 'team', 'teams'));
    lines.push(parts.join(', '));
  }
  lines.push(p.images > 0 ? count(p.images, 'image', 'images') : 'No images');
  lines.push(
    p.historyNotes > 0
      ? `Version history for ${count(p.historyNotes, 'note', 'notes')} (${count(p.historyVersions, 'version', 'versions')})`
      : 'No version history',
  );
  return lines;
}

export function backupWarnings(p: BackupPreview): string[] {
  const out: string[] = [];
  if (p.imagesSkippedAtExport > 0) {
    out.push(`${count(p.imagesSkippedAtExport, 'image', 'images')} could not be read when this backup was made, so they are not in it.`);
  }
  if (p.kind === 'json') {
    out.push('This is a text only file: it has no images and no version history.');
  }
  return out;
}
