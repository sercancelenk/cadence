import { useCallback, useState } from 'react';
import type { AppData, Note } from '../../model';
import type { NoteSortMode } from './notePreferences';

export function useNotesManualReorder(
  sortMode: NoteSortMode,
  notes: Note[],
  update: (fn: (d: AppData) => AppData) => void,
) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const onRowDragStart = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (sortMode !== 'manual') return;
      e.dataTransfer.effectAllowed = 'move';
      try {
        e.dataTransfer.setData('text/plain', noteId);
      } catch {
        // Restricted contexts can throw — safe to ignore.
      }
      setDraggingId(noteId);
    },
    [sortMode],
  );

  const onRowDragOver = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (sortMode !== 'manual' || !draggingId || draggingId === noteId) return;
      const dragged = notes.find((n) => n.id === draggingId);
      const target = notes.find((n) => n.id === noteId);
      if (!dragged || !target || !!dragged.pinned !== !!target.pinned) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTargetId !== noteId) setDropTargetId(noteId);
    },
    [sortMode, draggingId, notes, dropTargetId],
  );

  const onRowDrop = useCallback(
    (e: React.DragEvent<HTMLLIElement>, noteId: string) => {
      if (sortMode !== 'manual' || !draggingId || draggingId === noteId) return;
      e.preventDefault();
      const dragged = notes.find((n) => n.id === draggingId);
      const target = notes.find((n) => n.id === noteId);
      if (!dragged || !target || !!dragged.pinned !== !!target.pinned) {
        setDraggingId(null);
        setDropTargetId(null);
        return;
      }
      const tier = notes.filter((n) => !!n.pinned === !!dragged.pinned);
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
      setDraggingId(null);
      setDropTargetId(null);
    },
    [sortMode, draggingId, notes, update],
  );

  const onRowDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTargetId(null);
  }, []);

  return {
    draggingId,
    dropTargetId,
    onRowDragStart,
    onRowDragOver,
    onRowDrop,
    onRowDragEnd,
  };
}
