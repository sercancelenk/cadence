import { useCallback, useRef, useState } from 'react';
import { useAccount } from '../../AccountContext';
import { useAppData } from '../../AppDataContext';
import { useToast } from '../ui/Toast';
import { compactAppDataForPersist, normalizeData, type AppData } from '../../model';
import { restoreAiSecrets, stripAiSecrets } from '../../lib/ai/secrets';
import { describeMergeSummary, mergeAppendWorkspace, type MergeAppendSummary } from '../../core/model/mergeWorkspace';
import { describeRestoreOutcome, type RestoreCounts } from '../../lib/backupOutcome';
import { previewFromOpenResult, type BackupPreview } from '../../lib/backupPreview';
import { backupSavedDetail, skippedImagesNote } from '../../lib/backupPrivacyCopy';
import { exportPortableBackupZip, openPortableBackupFile } from '../../lib/backupBundle';
import { parseRemoteSnapshot, snapshotParseErrorMessage } from '../../lib/syncSnapshotGuard';
import { prepareForRemoteApply } from '../../lib/syncApplyGuard';
import type { BackupImportMode } from './BackupImportDialog';

type ApplyOutcome = { ok: true; counts: RestoreCounts } | { ok: false; error: string };

/** A backup that has been looked at and is waiting for the user's choice. */
type ApplyContext = { mode: BackupImportMode; expectedGeneration?: number };

type OpenedBackup = {
  preview: BackupPreview;
  /** The backup's workspace, parsed. */
  workspace: AppData;
  apply: (workspace: AppData, ctx: ApplyContext) => Promise<ApplyOutcome>;
};

export type BackupImportDialogState = {
  preview: BackupPreview;
  current: { notes: number; todoItems: number };
  /** Replacing first saves a copy of the current data (desktop app only). */
  hasSafetyCopy: boolean;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Settings → Backup & recovery: the one export and the one import, on the desktop app (a single file, with
 * every image and the version history, handled by the main process) and in a browser (the portable ZIP).
 * The import is two steps: `startImport` looks inside the file and changes nothing; `confirmImport` then
 * adds the backup to what is here, or replaces what is here.
 */
export function useBackupTransfer({ onReplaced }: { onReplaced?: () => void } = {}) {
  const toast = useToast();
  const { user } = useAccount();
  const { importWorkspace, syncFromDisk, flushPendingSave, getLatestSnapshot } = useAppData();
  const [busy, setBusy] = useState(false);
  // State is read through a closure, so two calls in the same instant would both see `false`.
  const busyRef = useRef(false);
  const [opened, setOpened] = useState<(OpenedBackup & { current: BackupImportDialogState['current'] }) | null>(null);
  const openedRef = useRef(opened);
  openedRef.current = opened;

  /** Everything typed so far is on disk before anything is read from or written over it. Throws if it is not. */
  const flush = useCallback(async () => {
    try {
      await flushPendingSave();
      await prepareForRemoteApply();
    } catch {
      throw new Error('Your latest changes could not be saved, so nothing was started. Try again in a moment.');
    }
  }, [flushPendingSave]);

  const exportBackup = useCallback(async () => {
    if (!user) {
      toast.showError('Not signed in', 'Sign in before exporting a backup.');
      return;
    }
    try {
      await flush();
      if (window.cadence?.backupArchiveExport) {
        // Leaves the encrypted data file like every export, so no AI keys go with it.
        const r = await window.cadence.backupArchiveExport(compactAppDataForPersist(stripAiSecrets(getLatestSnapshot())));
        if (r.canceled) return;
        if (!r.ok) {
          const tooBig = /too many files|too large/i.test(r.error ?? '');
          toast.showError(
            'Export failed',
            `${r.error ?? 'Could not write the backup.'}${tooBig ? ' Use “Export as a folder” under Advanced instead.' : ''}`,
          );
          return;
        }
        const parts = [`Saved to ${r.path}.`];
        if (r.attachmentCount != null) parts.push(plural(r.attachmentCount, 'image', 'images') + '.');
        if (r.noteHistoryRevisionCount) parts.push(plural(r.noteHistoryRevisionCount, 'version', 'versions') + ' of note history.');
        const missed = skippedImagesNote(r.attachmentsSkipped);
        if (missed) {
          toast.showWarning('Backup saved, but incomplete', backupSavedDetail(`${parts.join(' ')} ${missed}`));
        } else {
          toast.showSuccess('Backup saved', backupSavedDetail(parts.join(' ')));
        }
        return;
      }
      const r = await exportPortableBackupZip(user.id, getLatestSnapshot());
      const detail = plural(r.attachmentCount, 'image', 'images') + ' included.';
      if (r.attachmentMissing > 0) {
        toast.showWarning(
          'Backup saved, but incomplete',
          backupSavedDetail(`${detail} ${plural(r.attachmentMissing, 'image', 'images')} could not be found on this device, so they are not in it.`),
        );
      } else {
        toast.showSuccess('Backup saved', backupSavedDetail(detail));
      }
    } catch (err) {
      toast.showError('Export failed', err instanceof Error ? err.message : 'Could not build the backup.');
    }
  }, [flush, getLatestSnapshot, toast, user]);

  const remember = useCallback(
    (o: OpenedBackup) => {
      const snap = getLatestSnapshot();
      setOpened({ ...o, current: { notes: snap.notes.length, todoItems: snap.todoItems.length } });
    },
    [getLatestSnapshot],
  );

  /** Step one. On the desktop app the file is chosen in a native dialog; in a browser `file` comes from the input. */
  const startImport = useCallback(
    async (file?: File) => {
      if (busyRef.current) return;
      if (!user) {
        toast.showError('Not signed in', 'Sign in before importing a backup.');
        return;
      }
      busyRef.current = true;
      setBusy(true);
      try {
        await flush();
        if (window.cadence?.backupArchiveOpen) {
          const r = await window.cadence.backupArchiveOpen();
          if (r.canceled) return;
          if (!r.ok || !r.token) {
            toast.showError('Import failed', r.error ?? 'Could not read the backup.');
            return;
          }
          const parsed = parseRemoteSnapshot(r.workspace);
          if (parsed.kind !== 'ok') {
            toast.showError('Import failed', snapshotParseErrorMessage(parsed));
            return;
          }
          const token = r.token;
          remember({
            preview: previewFromOpenResult(r),
            workspace: parsed.data,
            apply: async (workspace, ctx) => {
              const a = await window.cadence!.backupArchiveApply!({
                token,
                workspace: compactAppDataForPersist(workspace),
                mode: ctx.mode,
                expectedGeneration: ctx.expectedGeneration,
              });
              if (!a.ok) return { ok: false, error: a.error ?? 'Could not import the backup.' };
              return {
                ok: true,
                counts: {
                  attachmentsRestored: a.attachmentsRestored,
                  attachmentsFailed: a.attachmentsFailed,
                  attachmentsSkipped: a.attachmentsSkipped,
                  historyIncomplete: a.historyIncomplete,
                },
              };
            },
          });
          return;
        }
        if (!file) return;
        const o = await openPortableBackupFile(file, user.id);
        if (!o.ok) {
          toast.showError('Import failed', o.error);
          return;
        }
        remember({
          preview: o.preview,
          workspace: o.workspace,
          apply: async (workspace) => {
            const r = await o.apply(workspace, async (next) => {
              const imported = await importWorkspace(next);
              return imported.ok ? { ok: true as const } : { ok: false as const, error: imported.error ?? 'Could not import the workspace.' };
            });
            if (!r.ok) return { ok: false, error: r.error };
            return {
              ok: true,
              counts: {
                attachmentsRestored: r.attachmentsImported,
                attachmentsSkipped: r.attachmentsSkipped,
                attachmentsEncryptedSkipped: r.attachmentsEncryptedSkipped,
              },
            };
          },
        });
      } catch (err) {
        toast.showError('Import failed', err instanceof Error ? err.message : 'Could not read the backup.');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [flush, importWorkspace, remember, toast, user],
  );

  /**
   * What "here" is, for the import: on the desktop app the workspace as it is on disk (after the flush), with the
   * generation it is at; in a browser the saved snapshot. A view held in memory can be behind the disk.
   */
  const readCurrent = useCallback(async (): Promise<{ base: AppData; generation?: number; unreadable: boolean }> => {
    if (window.cadence?.loadDataResult) {
      const r = await window.cadence.loadDataResult();
      if (!r.ok) return { base: getLatestSnapshot(), generation: r.writeGeneration ?? 0, unreadable: true };
      return {
        base: r.data ? normalizeData(r.data) : getLatestSnapshot(),
        generation: r.writeGeneration ?? 0,
        unreadable: false,
      };
    }
    return { base: getLatestSnapshot(), unreadable: false };
  }, [getLatestSnapshot]);

  /** Step two: add the backup to what is here, or replace what is here. */
  const confirmImport = useCallback(
    async (mode: BackupImportMode) => {
      const current = openedRef.current;
      if (!current || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await flush();
        const here = await readCurrent();
        if (mode === 'merge' && here.unreadable) {
          toast.showError(
            'Import failed',
            'Your current data could not be read, so the backup cannot be added to it. Nothing was changed. Choose Replace, or restore a snapshot first.',
          );
          return;
        }
        let next: AppData;
        let summary: MergeAppendSummary | null = null;
        if (mode === 'merge') {
          const merged = mergeAppendWorkspace(here.base, current.workspace);
          next = merged.data;
          summary = merged.summary;
        } else {
          // Exports carry no AI keys: keep the ones this device already has (same address only).
          next = restoreAiSecrets(current.workspace, here.base);
        }
        const r = await current.apply(next, { mode, expectedGeneration: here.generation });
        if (!r.ok) {
          toast.showError('Import failed', r.error);
          return;
        }
        // From here the import has happened. A problem refreshing the screen is not a failed import.
        setOpened(null);
        const outcome = describeRestoreOutcome(r.counts, 'import');
        const lead = summary ? describeMergeSummary(summary) : 'Your workspace now matches the backup.';
        const detail = `${lead} ${outcome.detail}`.trim();
        try {
          await syncFromDisk();
        } catch {
          toast.showWarning(
            'Backup imported',
            `${detail} The screen could not refresh by itself — restart Cadence to see everything.`,
          );
          return;
        }
        if (mode === 'replace') onReplaced?.();
        if (outcome.incomplete) toast.showWarning('Backup imported, but incomplete', detail);
        else toast.showSuccess('Backup imported', detail);
      } catch (err) {
        toast.showError('Import failed', err instanceof Error ? err.message : 'Could not import the backup.');
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [flush, onReplaced, readCurrent, syncFromDisk, toast],
  );

  const cancelImport = useCallback(() => setOpened(null), []);

  const dialog: BackupImportDialogState | null = opened
    ? { preview: opened.preview, current: opened.current, hasSafetyCopy: !!window.cadence?.backupArchiveApply }
    : null;
  return { busy, dialog, exportBackup, startImport, confirmImport, cancelImport };
}
