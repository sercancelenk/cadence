import { useCallback, useEffect, useRef } from 'react';
import type { AppData } from '../../model';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import {
  isSaveNoteShortcut,
  saveNoteToDisk,
  type SaveNoteDeps,
} from './noteFileActions';

export type UseNoteFileActionsArgs = {
  selectedId: string | undefined;
  getLatestSnapshot: () => AppData;
  flushPendingSave: () => Promise<void>;
  getLockedBody: (noteId: string) => RichTextBodyFields | null;
  notify: SaveNoteDeps['notify'];
};

/** "Save to file" for the selected note: toolbar button and ⌘S / Ctrl+S. */
export function useNoteFileActions(args: UseNoteFileActionsArgs) {
  // Everything the save reads must be current at call time, including when it
  // is fired from the window listener registered once per selection.
  const latest = useRef(args);
  latest.current = args;
  const busyRef = useRef(false);

  const saveSelected = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      await saveNoteToDisk({
        getNote: () => {
          const { selectedId, getLatestSnapshot } = latest.current;
          return selectedId ? getLatestSnapshot().notes.find((n) => n.id === selectedId) : undefined;
        },
        getLockedBody: (noteId) => latest.current.getLockedBody(noteId),
        flush: () => latest.current.flushPendingSave(),
        saveFile: window.cadence?.saveToolFile,
        notify: latest.current.notify,
      });
    } finally {
      busyRef.current = false;
    }
  }, []);

  const hasSelection = Boolean(args.selectedId);
  useEffect(() => {
    if (!hasSelection) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSaveNoteShortcut(e)) return;
      e.preventDefault();
      void saveSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasSelection, saveSelected]);

  return { saveSelected, available: Boolean(window.cadence?.saveToolFile) };
}
