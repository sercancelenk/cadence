import { useEffect, useState } from 'react';
import { noteViewModeKey, type NoteViewMode } from './notePreferences';

/** Persisted Active / Archived lens for the notes sidebar. */
export function useNotesViewMode(userId: string) {
  const [viewMode, setViewMode] = useState<NoteViewMode>('active');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!userId) {
      setViewMode('active');
      setHydrated(true);
      return;
    }
    setHydrated(false);
    try {
      const raw = localStorage.getItem(noteViewModeKey(userId));
      setViewMode(raw === 'archived' ? 'archived' : 'active');
    } catch {
      setViewMode('active');
    }
    setHydrated(true);
  }, [userId]);

  useEffect(() => {
    if (!hydrated || !userId) return;
    try {
      localStorage.setItem(noteViewModeKey(userId), viewMode);
    } catch {
      /* ignore */
    }
  }, [viewMode, hydrated, userId]);

  return { viewMode, setViewMode };
}
