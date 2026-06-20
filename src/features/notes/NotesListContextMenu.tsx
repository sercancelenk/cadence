import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Note, NoteGroup } from '../../model';

export type NotesListContextMenuProps = {
  x: number;
  y: number;
  noteIds: string[];
  notes: Note[];
  groups: NoteGroup[];
  onClose: () => void;
  onPin: (noteIds: string[]) => void;
  onUnpin: (noteIds: string[]) => void;
  onMoveToGroup: (noteIds: string[], groupId: string | undefined) => void;
  onDelete: (noteIds: string[]) => void;
};

export function NotesListContextMenu({
  x,
  y,
  noteIds,
  notes,
  groups,
  onClose,
  onPin,
  onUnpin,
  onMoveToGroup,
  onDelete,
}: NotesListContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  const targeted = noteIds
    .map((id) => notes.find((n) => n.id === id))
    .filter((n): n is Note => n != null);
  const count = targeted.length;
  const canPin = targeted.some((n) => !n.pinned);
  const canUnpin = targeted.some((n) => n.pinned);
  const hasLocked = targeted.some((n) => n.locked);
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const margin = 8;
    let nextX = x;
    let nextY = y;
    if (rect.right > window.innerWidth - margin) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (rect.bottom > window.innerHeight - margin) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    setPosition({ x: nextX, y: nextY });
  }, [x, y, count, sortedGroups.length]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      const panel = panelRef.current;
      if (panel && !panel.contains(e.target as Node)) onClose();
    };
    const onScroll = () => onClose();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const run = (action: () => void) => {
    action();
    onClose();
  };

  return createPortal(
    <div
      ref={panelRef}
      className="notes-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label={count > 1 ? `${count} notes selected` : 'Note actions'}
      onContextMenu={(e) => e.preventDefault()}
    >
      {count > 1 ? (
        <div className="notes-context-menu__heading muted small">{count} notes selected</div>
      ) : null}
      <button
        type="button"
        className="notes-context-menu__item"
        role="menuitem"
        disabled={!canPin}
        onClick={() => run(() => onPin(noteIds))}
      >
        Pin
      </button>
      <button
        type="button"
        className="notes-context-menu__item"
        role="menuitem"
        disabled={!canUnpin}
        onClick={() => run(() => onUnpin(noteIds))}
      >
        Unpin
      </button>
      {sortedGroups.length > 0 ? (
        <>
          <div className="notes-context-menu__sep" role="separator" />
          <div className="notes-context-menu__submenu-wrap">
            <button
              type="button"
              className="notes-context-menu__item notes-context-menu__item--submenu"
              role="menuitem"
              aria-haspopup="menu"
            >
              Move to list
              <span aria-hidden>›</span>
            </button>
            <div className="notes-context-menu__submenu" role="menu">
              {sortedGroups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="notes-context-menu__item"
                  role="menuitem"
                  onClick={() => run(() => onMoveToGroup(noteIds, g.id))}
                >
                  {g.name}
                </button>
              ))}
              <button
                type="button"
                className="notes-context-menu__item"
                role="menuitem"
                onClick={() => run(() => onMoveToGroup(noteIds, undefined))}
              >
                Ungrouped
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="notes-context-menu__sep" role="separator" />
          <button
            type="button"
            className="notes-context-menu__item"
            role="menuitem"
            onClick={() => run(() => onMoveToGroup(noteIds, undefined))}
          >
            Move to ungrouped
          </button>
        </>
      )}
      <div className="notes-context-menu__sep" role="separator" />
      <button
        type="button"
        className="notes-context-menu__item notes-context-menu__item--danger"
        role="menuitem"
        disabled={hasLocked}
        title={hasLocked ? 'Remove locks before deleting locked notes' : undefined}
        onClick={() => run(() => onDelete(noteIds))}
      >
        Delete{count > 1 ? ` (${count})` : ''}
      </button>
    </div>,
    document.body,
  );
}
