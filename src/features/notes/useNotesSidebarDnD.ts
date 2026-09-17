import { useCallback, useRef, useState } from 'react';
import type { AppData, Note } from '../../model';
import { moveNoteToGroup } from '../../core/actions';
import {
  dropPlacementFromPointer,
  reorderIds,
  type DropPlacement,
} from '../../lib/listReorder';
import type { NoteSortMode } from './notePreferences';

/**
 * Sidebar HTML5 drag-and-drop for notes.
 *
 * Drag identity lives in a ref as well as state so the first `dragover`
 * events (before React commits) can still call `preventDefault` and keep
 * the drop alive.
 *
 * Same-group drops always reorder by `sortOrder` and flip the sidebar into
 * Manual sort — otherwise the default "Last updated" mode silently refuses
 * the most common gesture and the list looks broken.
 */
export function useNotesSidebarDnD(
  sortMode: NoteSortMode,
  notes: Note[],
  update: (fn: (d: AppData) => AppData) => void,
  setSortMode?: (mode: NoteSortMode) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPlacement, setDropPlacement] = useState<DropPlacement>('before');
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const sortModeRef = useRef(sortMode);
  sortModeRef.current = sortMode;
  const dropPlacementRef = useRef<DropPlacement>('before');

  const clearDrag = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTargetId(null);
    setDropPlacement('before');
    dropPlacementRef.current = 'before';
    setDropTargetGroupId(null);
  }, []);

  const onNoteDragStart = useCallback((e: React.DragEvent<HTMLElement>, noteId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', noteId);
    } catch {
      /* ignore */
    }
    draggingIdRef.current = noteId;
    setDraggingId(noteId);
  }, []);

  const acceptNoteDragOver = useCallback((e: React.DragEvent<HTMLElement>, noteId: string) => {
    const currentDraggingId = draggingIdRef.current;
    if (!currentDraggingId || currentDraggingId === noteId) return;
    const list = notesRef.current;
    const dragged = list.find((n) => n.id === currentDraggingId);
    const target = list.find((n) => n.id === noteId);
    if (!dragged || !target) return;

    const sameTier =
      !!dragged.pinned === !!target.pinned && dragged.groupId === target.groupId;

    if (sameTier) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const placement = dropPlacementFromPointer(
        e.clientY,
        e.currentTarget.getBoundingClientRect(),
      );
      dropPlacementRef.current = placement;
      setDropTargetGroupId(null);
      setDropTargetId((prev) => (prev === noteId ? prev : noteId));
      setDropPlacement((prev) => (prev === placement ? prev : placement));
      return;
    }

    if (dragged.groupId !== target.groupId) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetId(null);
    }
  }, []);

  const onNoteDrop = useCallback(
    (e: React.DragEvent<HTMLElement>, noteId: string) => {
      const currentDraggingId = draggingIdRef.current;
      if (!currentDraggingId || currentDraggingId === noteId) return;
      e.preventDefault();
      const list = notesRef.current;
      const dragged = list.find((n) => n.id === currentDraggingId);
      const target = list.find((n) => n.id === noteId);
      if (!dragged || !target) {
        clearDrag();
        return;
      }

      const sameTier =
        !!dragged.pinned === !!target.pinned && dragged.groupId === target.groupId;

      if (sameTier) {
        const placement =
          dropPlacementRef.current ||
          dropPlacementFromPointer(e.clientY, e.currentTarget.getBoundingClientRect());
        const tier = list.filter(
          (n) => !!n.pinned === !!dragged.pinned && n.groupId === dragged.groupId,
        );
        const tierIds = tier.map((n) => n.id);
        const nextIds = reorderIds(tierIds, currentDraggingId, noteId, placement);
        if (nextIds) {
          const order = new Map(nextIds.map((id, idx) => [id, idx]));
          update((d) => ({
            ...d,
            notes: d.notes.map((n) => {
              const idx = order.get(n.id);
              return idx === undefined ? n : { ...n, sortOrder: idx };
            }),
          }));
          if (sortModeRef.current !== 'manual') {
            setSortMode?.('manual');
          }
        }
      } else if (dragged.groupId !== target.groupId) {
        update((d) => moveNoteToGroup(d, currentDraggingId, target.groupId));
      }

      clearDrag();
    },
    [clearDrag, setSortMode, update],
  );

  const onGroupDragOver = useCallback((e: React.DragEvent<HTMLLIElement>, groupId: string) => {
    if (!draggingIdRef.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTargetId(null);
    setDropTargetGroupId((prev) => (prev === groupId ? prev : groupId));
  }, []);

  const onGroupDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, groupId: string) => {
      const currentDraggingId = draggingIdRef.current;
      if (!currentDraggingId) return;
      e.preventDefault();
      update((d) => moveNoteToGroup(d, currentDraggingId, groupId));
      clearDrag();
    },
    [clearDrag, update],
  );

  return {
    draggingId,
    dropTargetId,
    dropPlacement,
    dropTargetGroupId,
    onNoteDragStart,
    onNoteDragOver: acceptNoteDragOver,
    onNoteDragEnter: acceptNoteDragOver,
    onNoteDrop,
    onGroupDragOver,
    onGroupDrop,
    onDragEnd: clearDrag,
  };
}
