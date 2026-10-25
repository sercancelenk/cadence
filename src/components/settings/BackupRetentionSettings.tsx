import { useCallback, useEffect, useState } from 'react';
import { useConfirm } from '../ui/ConfirmProvider';
import { useToast } from '../ui/Toast';
import { describeRetentionLoss, mirrorKeepLabel, snapshotKeepLabel } from '../../lib/backupRetentionText';
import type { BackupRetentionRequest, BackupRetentionState } from '../../vite-env';

const DEFAULT_MIRROR_KEEP = 30;
const DEFAULT_SNAPSHOT_KEEP = 50;

function isSupported(): boolean {
  return typeof window !== 'undefined' && !!window.cadence?.backupRetentionGet;
}

/**
 * How many daily backup folders and in-app snapshots to keep (desktop only).
 *
 * Lowering a value trims the backups that already exist, so the main process
 * answers with the counts first and nothing is deleted until the user agrees.
 * A cancelled change leaves the setting and every file as they were.
 */
export function BackupRetentionSettings() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [state, setState] = useState<BackupRetentionState | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!isSupported()) return;
    try {
      const r = await window.cadence!.backupRetentionGet!();
      if (r.ok) setState(r.state);
    } catch (err) {
      console.warn('[cadence] backupRetentionGet failed', err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (request: BackupRetentionRequest) => {
    setBusy(true);
    try {
      let r = await window.cadence!.backupRetentionSet!(request);
      // Asked again if more would go than the user agreed to (a snapshot landed in between).
      for (let ask = 0; !r.ok && r.needsConfirm && ask < 2; ask += 1) {
        const accepted = await confirm({
          title: 'Delete older backups?',
          description: describeRetentionLoss(r.willDelete, request),
          confirmLabel: 'Delete and apply',
          danger: true,
        });
        if (!accepted) return;
        r = await window.cadence!.backupRetentionSet!({ ...request, confirmed: true, expectedWillDelete: r.willDelete });
      }
      if (!r.ok) {
        toast.showError('Backup retention', r.needsConfirm ? 'Please try again.' : r.error);
        return;
      }
      setState(r.state);
      const removed = r.deleted.mirrorFolders + r.deleted.snapshotSets;
      toast.showSuccess(
        'Backup retention saved',
        removed > 0
          ? `Removed ${removed} older backup${removed === 1 ? '' : 's'}.`
          : r.mirrorDeferred
            ? 'The daily backup folder is not available right now; older folders are trimmed on the next daily backup.'
            : 'No existing backups were removed.',
      );
    } catch (err) {
      toast.showError('Backup retention', err instanceof Error ? err.message : 'Could not save the setting.');
    } finally {
      setBusy(false);
      void load();
    }
  };

  if (!isSupported() || !state) return null;

  return (
    <div className="backup-daily-mirror backup-retention">
      <h3 className="backup-daily-mirror__title">How many backups to keep</h3>
      <p className="muted small backup-daily-mirror__lead">
        Lowering a value deletes the older backups beyond it, after you confirm. The newest backup is always kept.
      </p>

      <label className="backup-retention__row">
        <span>Daily backup folder</span>
        <select
          className="backup-snapshots__select"
          value={state.mirrorKeep}
          disabled={busy}
          aria-label="Daily backup folders to keep"
          onChange={(e) => void apply({ mirrorKeep: Number(e.target.value) })}
        >
          {state.mirrorKeepChoices.map((n) => (
            <option key={n} value={n}>
              {mirrorKeepLabel(n, n === (state.mirrorKeepDefault ?? DEFAULT_MIRROR_KEEP))}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small backup-retention__hint">
        Each daily folder holds a full copy of your notes and images, so this is the setting that decides how much
        disk space it takes.
        {state.mirrorDirConfigured ? '' : ' It applies once you choose a daily backup folder.'}
        {state.mirrorDirConfigured && !state.mirrorDirAvailable
          ? ' The chosen folder is not available right now (drive unplugged?); nothing is trimmed until it is back.'
          : ''}
      </p>

      <label className="backup-retention__row">
        <span>In-app snapshots</span>
        <select
          className="backup-snapshots__select"
          value={state.snapshotRoutineKeep}
          disabled={busy}
          aria-label="Routine in-app snapshots to keep"
          onChange={(e) => void apply({ snapshotRoutineKeep: Number(e.target.value) })}
        >
          {state.snapshotRoutineKeepChoices.map((n) => (
            <option key={n} value={n}>
              {snapshotKeepLabel(n, n === DEFAULT_SNAPSHOT_KEEP)}
            </option>
          ))}
        </select>
      </label>
      <p className="muted small backup-retention__hint">
        Images are shared between snapshots, so they take little extra space. Safety copies made before an import,
        restore, password change or account recovery are kept separately (the newest {state.snapshotLifecycleKeep}) and
        are not pushed out by routine snapshots.
      </p>
    </div>
  );
}
