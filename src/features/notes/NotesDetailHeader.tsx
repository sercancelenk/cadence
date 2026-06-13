import {
  IcClock,
  IcArchive,
  IcArrowLeft,
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
import { NotesIconButton } from './NotesIconButton';
import { PLACEHOLDER_TITLE } from './notePreferences';
import type { PendingIntent } from './noteLockTypes';

export type NotesDetailHeaderProps = {
  selected: Note;
  editorReady: boolean;
  busy: boolean;
  aiEnabled: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  onBack: () => void;
  onChangeTitle: (title: string) => void;
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
  onChangeTitle,
  onExtractTasks,
  onTogglePinned,
  onToggleArchive,
  onRequestAction,
  onHideSelected,
  onConfirmRemove,
  onOpenVersionHistory,
  versionHistoryAvailable = false,
}: NotesDetailHeaderProps) {
  return (
    <header className="notes-page__main-header">
      {sidebarCollapsed && onToggleSidebar ? (
        <NotesIconButton
          onClick={onToggleSidebar}
          label="Show notes list"
          tooltip="Show notes list"
          ariaExpanded={false}
        >
          <IcMenu size={18} />
        </NotesIconButton>
      ) : null}
      <button
        type="button"
        className="notes-page__back"
        onClick={onBack}
        aria-label="Back to notes list"
        title="Back to notes list"
      >
        <IcArrowLeft size={18} />
        <span>Notes</span>
      </button>
      <input
        className="notes-page__title-input"
        value={selected.title}
        onChange={(e) => onChangeTitle(e.target.value)}
        placeholder={PLACEHOLDER_TITLE}
        disabled={selected.locked && !editorReady}
      />
      <div className="notes-page__main-actions">
        {aiEnabled ? (
          <NotesIconButton
            onClick={onExtractTasks}
            disabled={selected.locked && !editorReady}
            label="Extract tasks from this note"
            tooltip="Extract tasks from this note"
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
                ? 'Version history'
                : 'Version history (Cadence desktop app)'
            }
          >
            <IcClock size={16} />
          </NotesIconButton>
        ) : null}

        <NotesIconButton
          onClick={onTogglePinned}
          label={selected.pinned ? 'Unpin' : 'Pin to top'}
          tooltip={selected.pinned ? 'Unpin' : 'Pin to top'}
          pressed={!!selected.pinned}
        >
          <IcStar size={16} />
        </NotesIconButton>

        <NotesIconButton
          onClick={onToggleArchive}
          label={selected.archived ? 'Restore to active notes' : 'Archive note'}
          tooltip={selected.archived ? 'Restore to active notes' : 'Archive note'}
        >
          <IcArchive size={16} />
        </NotesIconButton>

        {!selected.locked ? (
          <NotesIconButton
            onClick={() => onRequestAction('lock')}
            disabled={busy}
            label="Lock note"
            tooltip="Lock note"
          >
            <IcLock size={16} />
          </NotesIconButton>
        ) : editorReady ? (
          <NotesIconButton
            onClick={onHideSelected}
            disabled={busy}
            label="Hide note"
            tooltip="Hide content (re-lock view)"
          >
            <IcEyeOff size={16} />
          </NotesIconButton>
        ) : (
          <NotesIconButton
            onClick={() => onRequestAction('view')}
            disabled={busy}
            label="Unlock to view"
            tooltip="Unlock to view"
          >
            <IcUnlock size={16} />
          </NotesIconButton>
        )}

        {selected.locked && editorReady ? (
          <NotesIconButton
            onClick={() => onRequestAction('unlock-selected')}
            disabled={busy}
            label="Remove lock"
            tooltip="Remove lock from this note (decrypt permanently)"
          >
            <IcKey size={16} />
          </NotesIconButton>
        ) : null}

        <NotesIconButton
          onClick={onConfirmRemove}
          label="Delete note"
          tooltip="Delete note"
          variant="danger"
        >
          <IcTrash size={16} />
        </NotesIconButton>
      </div>
    </header>
  );
}
