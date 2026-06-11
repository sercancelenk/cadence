import { useCallback, useEffect, useRef } from 'react';
import type { Note } from '../../model';
import {
  flushNoteRevisionSession,
  noteSnapshotFromNote,
  tryAppendNoteRevision,
} from '../../lib/noteRevision/noteRevisionStore';
import type { NoteRevisionSnapshot, NoteRevisionTrigger } from '../../lib/noteRevision/types';

/** Tracks edit sessions per note and flushes a revision when switching notes. */
export function useNoteRevisionCapture(
  selected: Note | null,
  getRevisionSnapshot?: () => NoteRevisionSnapshot | null,
) {
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const getRevisionSnapshotRef = useRef(getRevisionSnapshot);
  getRevisionSnapshotRef.current = getRevisionSnapshot;

  const sessionStartRef = useRef<NoteRevisionSnapshot | null>(null);

  const readSnapshot = useCallback((): NoteRevisionSnapshot | null => {
    const fromEditor = getRevisionSnapshotRef.current?.();
    if (fromEditor) return fromEditor;
    const note = selectedRef.current;
    return note ? noteSnapshotFromNote(note) : null;
  }, []);

  useEffect(() => {
    sessionStartRef.current = selected ? readSnapshot() : null;
    return () => {
      const start = sessionStartRef.current;
      const end = readSnapshot();
      if (!start || !end) return;
      void flushNoteRevisionSession(start, end);
    };
  }, [selected?.id, readSnapshot]);

  const captureAfterSave = useCallback(
    (prev: Note, next: Note, trigger: NoteRevisionTrigger, options?: { force?: boolean; label?: string }) => {
      void tryAppendNoteRevision(noteSnapshotFromNote(prev), noteSnapshotFromNote(next), trigger, options);
    },
    [],
  );

  return { captureAfterSave };
}
