import { memo, useEffect, useRef } from 'react';
import { IcGrip, IcLock, IcUnlock } from '../../components/icons';
import type { Note } from '../../model';
import { noteDisplayTitle, noteSidebarPreview } from './noteDisplay';
import type { RichTextBodyFields } from '../../lib/richTextBody';

export type NotesListRowProps = {
  note: Note;
  selectedId: string | null;
  bulkSelected: boolean;
  bulkSelectionSize: number;
  onNoteClick: (id: string, event: React.MouseEvent) => void;
  onNoteContextMenu: (id: string, event: React.MouseEvent) => void;
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

// Memoized: the sidebar passes the same `rowProps` to every row, so without
// this a single keystroke / selection change in the parent would re-render the
// entire note list. Default shallow prop comparison is correct here because all
// callbacks are stable and the data props are primitives / stable references.
export const NotesListRow = memo(function NotesListRow({
  note: n,
  selectedId,
  bulkSelected,
  bulkSelectionSize,
  onNoteClick,
  onNoteContextMenu,
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
  const listItemRef = useRef<HTMLButtonElement>(null);
  const isViewingLocked = n.locked && decrypted?.noteId === n.id;
  const title = noteDisplayTitle(n, decrypted);
  const preview = noteSidebarPreview(n, decrypted) || '—';

  const liClass = [
    'notes-page__list-row',
    nested ? 'notes-page__list-row--nested' : '',
    isDragging ? 'notes-page__list-row--dragging' : '',
    isDropTarget ? 'notes-page__list-row--drop-target' : '',
    n.archived ? 'notes-page__list-row--archived' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (selectedId !== n.id && !bulkSelected) return;
    requestAnimationFrame(() => {
      listItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
  }, [selectedId, bulkSelected, n.id]);

  const inBulk = bulkSelected;
  const isPrimary = selectedId === n.id;
  const showActive = isPrimary && (bulkSelectionSize <= 1 || inBulk);
  const itemClass = [
    'notes-page__list-item',
    showActive ? 'notes-page__list-item--active' : '',
    inBulk && !showActive ? 'notes-page__list-item--bulk-selected' : '',
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
        ref={listItemRef}
        type="button"
        data-note-id={n.id}
        className={itemClass}
        onClick={(e) => onNoteClick(n.id, e)}
        onContextMenu={(e) => onNoteContextMenu(n.id, e)}
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
        <div className="notes-page__list-preview">{preview}</div>
        <time className="notes-page__list-time" dateTime={n.updatedAt}>
          {new Date(n.updatedAt).toLocaleString()}
        </time>
      </button>
    </li>
  );
});
