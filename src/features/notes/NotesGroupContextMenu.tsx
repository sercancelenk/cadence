import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { GroupNode } from './noteGroupForest';

export type NotesGroupContextMenuProps = {
  x: number;
  y: number;
  node: GroupNode;
  /** Valid "Move to…" destinations; `id: undefined` is the top level. */
  moveTargets: { id: string | undefined; label: string }[];
  onClose: () => void;
  onNewNote: () => void;
  onNewSubList: () => void;
  onRename: () => void;
  onSetArchived: (archived: boolean) => void;
  onMove: (newParentId: string | undefined) => void;
  onDelete: () => void;
};

export function NotesGroupContextMenu({
  x,
  y,
  node,
  moveTargets,
  onClose,
  onNewNote,
  onNewSubList,
  onRename,
  onSetArchived,
  onMove,
  onDelete,
}: NotesGroupContextMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const margin = 8;
    setPosition({
      x: rect.right > window.innerWidth - margin ? Math.max(margin, window.innerWidth - rect.width - margin) : x,
      y: rect.bottom > window.innerHeight - margin ? Math.max(margin, window.innerHeight - rect.height - margin) : y,
    });
  }, [x, y]);

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

  const item = (label: string, action: () => void, extra = '') => (
    <button
      type="button"
      className={`notes-context-menu__item${extra}`}
      role="menuitem"
      onClick={() => run(action)}
    >
      {label}
    </button>
  );

  const { canArchive, canRestore, canAddSubList } = node;
  const editable = canArchive; // active view: create / rename / move are allowed

  return createPortal(
    <div
      ref={panelRef}
      className="notes-context-menu"
      style={{ left: position.x, top: position.y }}
      role="menu"
      aria-label="List actions"
      onContextMenu={(e) => e.preventDefault()}
    >
      {editable ? item('New note', onNewNote) : null}
      {editable && canAddSubList ? item('New sub-list', onNewSubList) : null}
      {editable ? item('Rename', onRename) : null}
      {canArchive ? item('Archive', () => onSetArchived(true)) : null}
      {canRestore ? item('Restore', () => onSetArchived(false)) : null}
      {editable && moveTargets.length > 0 ? (
        <>
          <div className="notes-context-menu__sep" role="separator" />
          <div className="notes-context-menu__submenu-wrap">
            <button
              type="button"
              className="notes-context-menu__item notes-context-menu__item--submenu"
              role="menuitem"
              aria-haspopup="menu"
            >
              Move to
              <span aria-hidden>›</span>
            </button>
            <div className="notes-context-menu__submenu" role="menu">
              {moveTargets.map((t) => (
                <button
                  key={t.id ?? '__top__'}
                  type="button"
                  className="notes-context-menu__item"
                  role="menuitem"
                  onClick={() => run(() => onMove(t.id))}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}
      <div className="notes-context-menu__sep" role="separator" />
      {item('Delete', onDelete, ' notes-context-menu__item--danger')}
    </div>,
    document.body,
  );
}
