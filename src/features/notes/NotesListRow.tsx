import { IcGrip, IcLock, IcUnlock } from '../../components/icons';
import type { Note } from '../../model';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { notePlainText } from './notePlainText';
import { PLACEHOLDER_TITLE } from './notePreferences';

export type NotesListRowProps = {
  note: Note;
  selectedId: string | null;
  onSelectNote: (id: string) => void;
  decrypted: ({ noteId: string } & RichTextBodyFields) | null;
  isManual: boolean;
  nested?: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>, noteId: string) => void;
  onDragEnd: () => void;
};

export function NotesListRow({
  note: n,
  selectedId,
  onSelectNote,
  decrypted,
  isManual,
  nested = false,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: NotesListRowProps) {
  const isViewingLocked = n.locked && decrypted?.noteId === n.id;
  const previewText = n.locked
    ? isViewingLocked
      ? notePlainText(n, decrypted)
      : 'Locked note'
    : notePlainText(n);
  const preview = previewText.replace(/\s+/g, ' ').slice(0, 80);
  const title = (n.title || PLACEHOLDER_TITLE).trim() || PLACEHOLDER_TITLE;

  const liClass = [
    'notes-page__list-row',
    nested ? 'notes-page__list-row--nested' : '',
    isDragging ? 'notes-page__list-row--dragging' : '',
    isDropTarget ? 'notes-page__list-row--drop-target' : '',
    n.archived ? 'notes-page__list-row--archived' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <li
      className={liClass}
      draggable
      onDragStart={(e) => onDragStart(e, n.id)}
      onDragOver={(e) => onDragOver(e, n.id)}
      onDrop={(e) => onDrop(e, n.id)}
      onDragEnd={onDragEnd}
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
        ) : (
          <span className="notes-page__drag-handle notes-page__drag-handle--subtle" aria-hidden title="Drag to move">
            <IcGrip size={12} />
          </span>
        )}
        <div className="notes-page__list-title">
          {n.pinned ? <span className="notes-page__pin" aria-hidden>★</span> : null}
          <span>{title}</span>
          {n.locked ? (
            isViewingLocked ? (
              <span className="notes-page__list-lock notes-page__list-lock--open" title="Unlocked for viewing" aria-label="Unlocked for viewing">
                <IcUnlock size={12} aria-hidden />
              </span>
            ) : (
              <span className="notes-page__list-lock" title="Locked" aria-label="Locked">
                <IcLock size={12} aria-hidden />
              </span>
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
}
