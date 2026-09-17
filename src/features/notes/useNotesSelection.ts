import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Note } from '../../model';
import type { NoteSortMode, NoteViewMode } from './notePreferences';
import {
  isPendingSelectionComplete,
  resolveNotesSelectionCorrection,
} from './notesSelectionUtils';

/**
 * Selection + deep-link handling for the notes two-pane view.
 */
export function useNotesSelection(
  notes: Note[],
  allNotes: Note[],
  searchParams: URLSearchParams,
  setSearchParams: (next: URLSearchParams, opts?: { replace?: boolean }) => void,
  sortMode: NoteSortMode,
  patchNote: (id: string, patch: Partial<Note>) => void,
  viewMode: NoteViewMode,
  setViewMode: (mode: NoteViewMode) => void,
  pendingSelectNoteIdRef?: MutableRefObject<string | null>,
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Stands in when the caller owns no ref, so the handover below always works. */
  const ownPendingSelectRef = useRef<string | null>(null);
  const pendingSelectRef = pendingSelectNoteIdRef ?? ownPendingSelectRef;

  /**
   * `?id=` (a global-search hit) and `?focus=` (a task backlink) both name a
   * note to open.
   *
   * One effect handles both: as two, each would derive the next query from the
   * same render's `searchParams`, so whichever `setSearchParams` landed second
   * would put the other's parameter back.
   */
  useEffect(() => {
    const deepLinkId = searchParams.get('id') ?? searchParams.get('focus');
    if (!deepLinkId) return;

    const target = allNotes.find((n) => n.id === deepLinkId);
    // The workspace may still be loading. Keeping the query is what lets the
    // link resolve on the render that brings the notes in — stripping it now
    // would silently drop the note the user asked for.
    if (!target && allNotes.length === 0) return;

    if (target) {
      if (target.archived && viewMode !== 'archived') {
        setViewMode('archived');
      }
      // The selection-repair effect below runs in this same flush, and it sees
      // `selectedId` as it was at render time — still null on a fresh mount. It
      // would fall back to notes[0] and overwrite this, which is why the id is
      // handed over as a pending selection: repair then converges on the
      // deep-linked note, and the page expands its folder to reveal it.
      pendingSelectRef.current = deepLinkId;
      setSelectedId(deepLinkId);
    }

    const next = new URLSearchParams(searchParams);
    next.delete('id');
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, allNotes, viewMode, setViewMode, pendingSelectRef]);

  const [isNarrowViewport, setIsNarrowViewport] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 800px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 800px)');
    const onChange = (e: MediaQueryListEvent) => setIsNarrowViewport(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const pendingSelectId = pendingSelectRef.current;
    const correction = resolveNotesSelectionCorrection(
      selectedId,
      pendingSelectId,
      notes,
      allNotes,
      isNarrowViewport,
    );

    if (pendingSelectId && isPendingSelectionComplete(pendingSelectId, selectedId, notes, allNotes)) {
      pendingSelectRef.current = null;
    }

    if (correction.action === 'keep') return;
    if (correction.action === 'select') {
      setSelectedId(correction.id);
      return;
    }
    if (correction.action === 'clear') {
      setSelectedId(null);
      return;
    }
    setSelectedId(notes[0]?.id ?? null);
  }, [notes, allNotes, selectedId, isNarrowViewport, pendingSelectRef]);

  useEffect(() => {
    if (!selectedId || sortMode !== 'opened') return;
    const n = allNotes.find((x) => x.id === selectedId);
    if (!n) return;
    const now = new Date().toISOString();
    if (n.lastOpenedAt && now.slice(0, 16) === n.lastOpenedAt.slice(0, 16)) return;
    patchNote(selectedId, { lastOpenedAt: now });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, sortMode]);

  const selected = useMemo(
    () => (selectedId ? allNotes.find((n) => n.id === selectedId) ?? null : null),
    [allNotes, selectedId],
  );

  return { selectedId, setSelectedId, selected, isNarrowViewport };
}
