import { useEffect, useMemo, useState } from 'react';
import type { Note } from '../../model';
import type { NoteSortMode } from './notePreferences';

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
) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    if (allNotes.some((n) => n.id === id)) {
      setSelectedId(id);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('id');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
    if (selectedId && notes.some((n) => n.id === selectedId)) return;
    if (isNarrowViewport) {
      if (selectedId && !notes.some((n) => n.id === selectedId)) setSelectedId(null);
      return;
    }
    setSelectedId(notes[0]?.id ?? null);
  }, [notes, selectedId, isNarrowViewport]);

  useEffect(() => {
    const focusId = searchParams.get('focus');
    if (!focusId) return;
    if (allNotes.some((n) => n.id === focusId)) {
      setSelectedId(focusId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete('focus');
    setSearchParams(next, { replace: true });
  }, [searchParams, allNotes, setSearchParams]);

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
    () => (selectedId ? notes.find((n) => n.id === selectedId) ?? null : null),
    [notes, selectedId],
  );

  return { selectedId, setSelectedId, selected, isNarrowViewport };
}
