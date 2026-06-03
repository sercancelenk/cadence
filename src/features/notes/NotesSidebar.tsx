import {
  IcGrip,
  IcKey,
  IcLock,
  IcLockOff,
  IcPlus,
  IcUnlock,
} from '../../components/icons';
import type { Note } from '../../model';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { notePlainText } from './notePlainText';
import { NotesIconButton } from './NotesIconButton';
import { PLACEHOLDER_TITLE, SORT_OPTIONS, type NoteSortMode } from './notePreferences';

export type NotesSidebarProps = {
  notes: Note[];
  sortMode: NoteSortMode;
  onSortModeChange: (mode: NoteSortMode) => void;
  selectedId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  hasLock: boolean;
  hasRecovery: boolean;
  onOpenAddRecovery: () => void;
  onOpenDisableLocking: () => void;
  decrypted: ({ noteId: string } & RichTextBodyFields) | null;
  draggingId: string | null;
  dropTargetId: string | null;
  onRowDragStart: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onRowDragOver: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onRowDrop: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onRowDragEnd: () => void;
};

export function NotesSidebar({
  notes,
  sortMode,
  onSortModeChange,
  selectedId,
  onSelectNote,
  onCreateNote,
  hasLock,
  hasRecovery,
  onOpenAddRecovery,
  onOpenDisableLocking,
  decrypted,
  draggingId,
  dropTargetId,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
}: NotesSidebarProps) {
  return (
    <aside className="notes-page__sidebar">
      <header className="notes-page__sidebar-header">
        <h2>Notes</h2>
        <div className="notes-page__sidebar-actions">
          <select
            className="select select--compact notes-page__sort"
            value={sortMode}
            onChange={(e) => onSortModeChange(e.target.value as NoteSortMode)}
            aria-label="Sort notes by"
            title="Sort notes by"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasLock && !hasRecovery ? (
            <NotesIconButton
              onClick={onOpenAddRecovery}
              label="Add recovery"
              tooltip="Allow recovery using your account password"
            >
              <IcKey size={16} />
            </NotesIconButton>
          ) : null}
          {hasLock ? (
            <NotesIconButton
              onClick={onOpenDisableLocking}
              label="Remove notes passphrase"
              tooltip="Remove the Notes passphrase from this workspace"
              variant="danger"
            >
              <IcLockOff size={16} />
            </NotesIconButton>
          ) : null}
          <NotesIconButton onClick={onCreateNote} label="New note" tooltip="New note" variant="primary">
            <IcPlus size={16} />
          </NotesIconButton>
        </div>
      </header>
      {notes.length === 0 ? (
        <div className="notes-page__empty">
          <p>No notes yet.</p>
          <button type="button" className="btn btn--primary" onClick={onCreateNote}>
            Create your first note
          </button>
        </div>
      ) : (
        <ul className="notes-page__list">
          {notes.map((n) => {
            const isViewingLocked = n.locked && decrypted?.noteId === n.id;
            const previewText = n.locked
              ? isViewingLocked
                ? notePlainText(n, decrypted)
                : 'Locked note'
              : notePlainText(n);
            const preview = previewText.replace(/\s+/g, ' ').slice(0, 80);
            const title = (n.title || PLACEHOLDER_TITLE).trim() || PLACEHOLDER_TITLE;
            const isManual = sortMode === 'manual';
            const isDragging = draggingId === n.id;
            const isDropTarget = dropTargetId === n.id;
            const liClass = [
              'notes-page__list-row',
              isDragging ? 'notes-page__list-row--dragging' : '',
              isDropTarget ? 'notes-page__list-row--drop-target' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li
                key={n.id}
                className={liClass}
                draggable={isManual}
                onDragStart={(e) => onRowDragStart(e, n.id)}
                onDragOver={(e) => onRowDragOver(e, n.id)}
                onDrop={(e) => onRowDrop(e, n.id)}
                onDragEnd={onRowDragEnd}
              >
                <button
                  type="button"
                  className={`notes-page__list-item${selectedId === n.id ? ' notes-page__list-item--active' : ''}`}
                  onClick={() => onSelectNote(n.id)}
                >
                  {isManual ? (
                    <span className="notes-page__drag-handle" aria-hidden title="Drag to reorder">
                      <IcGrip size={12} />
                    </span>
                  ) : null}
                  <div className="notes-page__list-title">
                    {n.pinned ? <span className="notes-page__pin" aria-hidden>★</span> : null}
                    <span>{title}</span>
                    {n.locked ? (
                      isViewingLocked ? (
                        <IcUnlock
                          size={12}
                          className="notes-page__list-lock notes-page__list-lock--open"
                          aria-label="Unlocked for viewing"
                        />
                      ) : (
                        <IcLock size={12} className="notes-page__list-lock" aria-label="Locked" />
                      )
                    ) : null}
                  </div>
                  <div className="notes-page__list-preview">{preview || '—'}</div>
                  <time className="notes-page__list-time" dateTime={n.updatedAt}>
                    {new Date(n.updatedAt).toLocaleString()}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
