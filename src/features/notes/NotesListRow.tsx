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
  dropPlacement?: 'before' | 'after';
  onDragStart: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onDragOver: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onDragEnter?: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
  onDrop: (e: React.DragEvent<HTMLElement>, noteId: string) => void;
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
  dropPlacement = 'before',
  onDragStart,
  onDragOver,
  onDragEnter,
  onDrop,
  onDragEnd,
}: NotesListRowProps) {
  const listItemRef = useRef<HTMLButtonElement>(null);
  const isViewingLocked = n.locked && decrypted?.noteId === n.id;
  const title = noteDisplayTitle(n, decrypted);
  const preview = noteSidebarPreview(n, decrypted) || '—';

  const liClass = [
    'notes-page__list-row',
    isManual ? 'notes-page__list-row--manual' : '',
    nested ? 'notes-page__list-row--nested' : '',
    isDragging ? 'notes-page__list-row--dragging' : '',
    isDropTarget ? 'notes-page__list-row--drop-target' : '',
    isDropTarget && dropPlacement === 'before' ? 'notes-page__list-row--drop-before' : '',
    isDropTarget && dropPlacement === 'after' ? 'notes-page__list-row--drop-after' : '',
    n.archived ? 'notes-page__list-row--archived' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (selectedId !== n.id && !bulkSelected) return;
    // Cancelled on cleanup: arrowing quickly through the list queues one frame
    // per row, and a row that has already been unselected (or unmounted by a
    // filter change) must not scroll the list out from under the current one.
    const frame = requestAnimationFrame(() => {
      listItemRef.current?.scrollIntoView({ block: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
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
      onDragEnter={(e) => (onDragEnter ?? onDragOver)(e, n.id)}
      onDragOver={(e) => onDragOver(e, n.id)}
      onDrop={(e) => onDrop(e, n.id)}
    >
      {/*
        The grip is the ONLY drag source. The row used to set `draggable` on
        the <li> while a <button> covered the whole hit area and the grip had
        `pointer-events: none` — Chromium never starts an HTML5 drag from
        inside a button, so reorder looked dead. Mirror the todos pattern:
        a real draggable handle beside a click-only button.
      */}
      <span
        className={`notes-page__drag-handle${isManual ? '' : ' notes-page__drag-handle--subtle'}`}
        draggable
        aria-hidden
        title={isManual ? 'Drag to reorder' : 'Drag to move to another list'}
        onDragStart={(e) => {
          onDragStart(e, n.id);
          const row = e.currentTarget.parentElement;
          if (row) {
            try {
              e.dataTransfer.setDragImage(row, 24, 16);
            } catch {
              /* setDragImage is best-effort */
            }
          }
        }}
        onDragEnd={onDragEnd}
      >
        <IcGrip size={12} />
      </span>
      <button
        ref={listItemRef}
        type="button"
        data-note-id={n.id}
        className={itemClass}
        draggable={false}
        onClick={(e) => onNoteClick(n.id, e)}
        onContextMenu={(e) => onNoteContextMenu(n.id, e)}
      >
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
