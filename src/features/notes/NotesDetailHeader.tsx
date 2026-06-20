import {
  IcArchive,
  IcArchiveRestore,
  IcArrowLeft,
  IcClock,
  IcEyeOff,
  IcKey,
  IcLock,
  IcMenu,
  IcSparkles,
  IcStar,
  IcTrash,
  IcUnlock,
} from '../../components/icons';
import type { Note } from '../../model';
import { Tooltip } from '../../components/ui/Tooltip';
import { NotesIconButton } from './NotesIconButton';
import type { PendingIntent } from './noteLockTypes';

export type NotesDetailHeaderProps = {
  selected: Note;
  editorReady: boolean;
  busy: boolean;
  aiEnabled: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onBack: () => void;
  onExtractTasks: () => void;
  onTogglePinned: () => void;
  onToggleArchive: () => void;
  onRequestAction: (intent: PendingIntent) => void;
  onHideSelected: () => void;
  onConfirmRemove: () => void;
  onOpenVersionHistory?: () => void;
  versionHistoryAvailable?: boolean;
};

export function NotesDetailHeader({
  selected,
  editorReady,
  busy,
  aiEnabled,
  sidebarCollapsed = false,
  onToggleSidebar,
  onBack,
  onExtractTasks,
  onTogglePinned,
  onToggleArchive,
  onRequestAction,
  onHideSelected,
  onConfirmRemove,
  onOpenVersionHistory,
  versionHistoryAvailable = false,
}: NotesDetailHeaderProps) {
  const extractBlocked = selected.locked && !editorReady;
  const deleteBlocked = selected.locked;

  return (
    <header className="notes-page__main-header">
      {sidebarCollapsed && onToggleSidebar ? (
        <NotesIconButton
          onClick={onToggleSidebar}
          label="Show notes list"
          tooltip="Show the notes list sidebar"
          ariaExpanded={false}
        >
          <IcMenu size={18} />
        </NotesIconButton>
      ) : null}
      <Tooltip label="Back to notes list — clear the open note" placement="bottom">
        <button
          type="button"
          className="notes-page__back"
          onClick={onBack}
          aria-label="Back to notes list"
        >
          <IcArrowLeft size={18} />
          <span>Notes</span>
        </button>
      </Tooltip>
      <div className="notes-page__main-actions">
        {aiEnabled ? (
          <NotesIconButton
            onClick={onExtractTasks}
            disabled={extractBlocked}
            label="Extract tasks from this note"
            tooltip={
              extractBlocked
                ? 'Unlock this note first — AI needs to read the content'
                : 'Use AI to pull actionable tasks from this note'
            }
          >
            <IcSparkles size={16} />
          </NotesIconButton>
        ) : null}

        {onOpenVersionHistory ? (
          <NotesIconButton
            onClick={onOpenVersionHistory}
            label="Version history"
            tooltip={
              versionHistoryAvailable
                ? 'Browse and restore previous versions of this note'
                : 'Version history — available in the Cadence desktop app'
            }
          >
            <IcClock size={16} />
          </NotesIconButton>
        ) : null}

        <NotesIconButton
          onClick={onTogglePinned}
          label={selected.pinned ? 'Unpin' : 'Pin to top'}
          tooltip={
            selected.pinned
              ? 'Unpin — return this note to normal sort order in its list'
              : 'Pin to top — keep this note at the top of its list'
          }
          pressed={!!selected.pinned}
        >
          <IcStar size={16} />
        </NotesIconButton>

        <NotesIconButton
          onClick={onToggleArchive}
          label={selected.archived ? 'Unarchive' : 'Archive'}
          tooltip={
            selected.archived
              ? 'Unarchive — restore this note to Active lists'
              : 'Archive — hide from Active view without deleting'
          }
        >
          {selected.archived ? <IcArchiveRestore size={16} /> : <IcArchive size={16} />}
        </NotesIconButton>

        {!selected.locked ? (
          <NotesIconButton
            onClick={() => onRequestAction('lock')}
            disabled={busy}
            label="Lock note"
            tooltip="Encrypt this note with your Notes passphrase"
          >
            <IcLock size={16} />
          </NotesIconButton>
        ) : editorReady ? (
          <NotesIconButton
            onClick={onHideSelected}
            disabled={busy}
            label="Hide note"
            tooltip="Hide decrypted content — re-lock the view until you unlock again"
          >
            <IcEyeOff size={16} />
          </NotesIconButton>
        ) : (
          <NotesIconButton
            onClick={() => onRequestAction('view')}
            disabled={busy}
            label="Unlock to view"
            tooltip="Enter your Notes passphrase to read and edit this note"
          >
            <IcUnlock size={16} />
          </NotesIconButton>
        )}

        {selected.locked && editorReady ? (
          <NotesIconButton
            onClick={() => onRequestAction('unlock-selected')}
            disabled={busy}
            label="Remove lock"
            tooltip="Permanently decrypt this note and remove its lock"
          >
            <IcKey size={16} />
          </NotesIconButton>
        ) : null}

        <NotesIconButton
          onClick={onConfirmRemove}
          disabled={deleteBlocked}
          label="Delete note"
          tooltip={
            deleteBlocked
              ? 'Remove the lock before deleting — locked notes cannot be deleted'
              : 'Delete this note permanently — this cannot be undone'
          }
          variant="danger"
        >
          <IcTrash size={16} />
        </NotesIconButton>
      </div>
    </header>
  );
}
