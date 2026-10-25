import { useState } from 'react';
import { AppModal, AppModalActions } from '../ui/AppModal';
import { backupWarnings, describeBackupContents, type BackupPreview } from '../../lib/backupPreview';

export type BackupImportMode = 'merge' | 'replace';

type Props = {
  preview: BackupPreview;
  /** What is on this device now, for the "replace" decision. */
  current: { notes: number; todoItems: number };
  /** True where replacing first saves a copy of the current data (the desktop app); a browser does not. */
  hasSafetyCopy: boolean;
  busy: boolean;
  onConfirm: (mode: BackupImportMode) => void;
  onCancel: () => void;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function madeAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

/**
 * The one import step: look at what is inside the file, then choose between adding it to what is here
 * (nothing is overwritten or deleted) and replacing what is here (a safety copy is made first).
 */
export function BackupImportDialog({ preview, current, hasSafetyCopy, busy, onConfirm, onCancel }: Props) {
  const [mode, setMode] = useState<BackupImportMode>('merge');
  const made = madeAt(preview.exportedAt);
  const warnings = backupWarnings(preview);

  return (
    <AppModal
      title="Import backup"
      description="Choose what should happen to your notes and tasks."
      size="md"
      onClose={busy ? () => undefined : onCancel}
      closeOnBackdrop={false}
      footer={
        <AppModalActions
          onCancel={onCancel}
          onConfirm={() => onConfirm(mode)}
          confirmLabel={mode === 'merge' ? 'Add to this device' : 'Replace and import'}
          confirmVariant={mode === 'replace' ? 'danger' : 'primary'}
          busy={busy}
        />
      }
    >
      <p style={{ margin: '0 0 4px', fontWeight: 600, wordBreak: 'break-word' }}>{preview.fileName}</p>
      {made ? <p className="muted small" style={{ margin: '0 0 8px' }}>Made {made}</p> : null}
      <ul className="small" style={{ margin: '0 0 8px', paddingLeft: 18 }}>
        {describeBackupContents(preview).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {warnings.map((w) => (
        <p key={w} className="small" style={{ margin: '0 0 6px', color: 'var(--warn, #b45309)' }}>
          {w}
        </p>
      ))}
      <p className="muted small" style={{ margin: '0 0 12px' }}>
        On this device now: {plural(current.notes, 'note', 'notes')}, {plural(current.todoItems, 'task', 'tasks')}
      </p>

      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }} disabled={busy}>
        <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>
          What should happen?
        </legend>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="radio" name="backup-import-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />
          <span>
            <strong>Add to what&apos;s here</strong>
            <span className="muted small" style={{ display: 'block' }}>
              Keeps everything you have now and adds what is missing. Nothing is overwritten or deleted.
            </span>
          </span>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <input type="radio" name="backup-import-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />
          <span>
            <strong>Replace what&apos;s here</strong>
            <span className="muted small" style={{ display: 'block' }}>
              Your notes, tasks and settings become exactly this backup. Images and version history from the backup are added.
            </span>
          </span>
        </label>
      </fieldset>
      {mode === 'replace' ? (
        <p className="small" style={{ margin: '12px 0 0' }}>
          {hasSafetyCopy
            ? 'A safety copy of your current data is saved first. You can bring it back from Automatic snapshots below.'
            : 'There is no automatic safety copy in a browser. If you might want to go back, export a backup first.'}
        </p>
      ) : null}
    </AppModal>
  );
}
