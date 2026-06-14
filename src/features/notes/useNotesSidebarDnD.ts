import { useCallback, useState } from 'react';
import type { AppData, Note } from '../../model';
import { moveNoteToGroup } from '../../core/actions';
import type { NoteSortMode } from './notePreferences';

export function useNotesSidebarDnD(
  sortMode: NoteSortMode,
  notes: Note[],
  update: (fn: (d: AppData) => AppData) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropTargetGroupId, setDropTargetGroupId] = useState<string | null>(null);

  const onNoteDragStart = useCallback((e: React.DragEvent<HTMLLIElement>, noteId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    try {
      e.dataTransfer.setData('text/plain', noteId);
    } catch {
      /* ignore */
    }
    setDraggingId(noteId);
  }, []);

  const onNoteDragOver = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (!draggingId || draggingId === noteId) return;
      const dragged = notes.find((n) => n.id === draggingId);
      const target = notes.find((n) => n.id === noteId);
      if (!dragged || !target) return;

      if (sortMode === 'manual' && !!dragged.pinned === !!target.pinned && dragged.groupId === target.groupId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTargetGroupId(null);
        if (dropTargetId !== noteId) setDropTargetId(noteId);
        return;
      }

      if (dragged.groupId !== target.groupId) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTargetId(null);
      }
    },
    [sortMode, draggingId, notes, dropTargetId],
  );

  const onNoteDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (!draggingId || draggingId === noteId) return;
      e.preventDefault();
      const dragged = notes.find((n) => n.id === draggingId);
      const target = notes.find((n) => n.id === noteId);
      if (!dragged || !target) {
        setDraggingId(null);
        setDropTargetId(null);
        setDropTargetGroupId(null);
        return;
      }

      if (sortMode === 'manual' && !!dragged.pinned === !!target.pinned && dragged.groupId === target.groupId) {
        const tier = notes.filter((n) => !!n.pinned === !!dragged.pinned && n.groupId === dragged.groupId);
        const without = tier.filter((n) => n.id !== draggingId);
        const insertAt = without.findIndex((n) => n.id === noteId);
        const reordered = [...without.slice(0, insertAt), dragged, ...without.slice(insertAt)];
        update((d) => ({
          ...d,
          notes: d.notes.map((n) => {
            const idx = reordered.findIndex((r) => r.id === n.id);
            return idx === -1 ? n : { ...n, sortOrder: idx };
          }),
        }));
      } else if (dragged.groupId !== target.groupId) {
        update((d) => moveNoteToGroup(d, draggingId, target.groupId));
      }

      setDraggingId(null);
      setDropTargetId(null);
      setDropTargetGroupId(null);
    },
    [sortMode, draggingId, notes, update],
  );

  const onGroupDragOver = useCallback(
    (e: React.DragEvent<HTMLLIElement>, groupId: string) => {
      if (!draggingId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTargetId(null);
      if (dropTargetGroupId !== groupId) setDropTargetGroupId(groupId);
    },
    [draggingId, dropTargetGroupId],
  );

  const onGroupDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, groupId: string) => {
      if (!draggingId) return;
      e.preventDefault();
      update((d) => moveNoteToGroup(d, draggingId, groupId));
      setDraggingId(null);
      setDropTargetId(null);
      setDropTargetGroupId(null);
    },
    [draggingId, update],
  );

  const onDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
    setDropTargetGroupId(null);
  }, []);

  return {
    draggingId,
    dropTargetId,
    dropTargetGroupId,
    onNoteDragStart,
    onNoteDragOver,
    onNoteDrop,
    onGroupDragOver,
    onGroupDrop,
    onDragEnd,
  };
}
