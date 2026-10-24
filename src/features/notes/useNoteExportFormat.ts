import { useCallback, useEffect, useState } from 'react';
import { parseNoteExportFormat, type NoteExportFormat } from '../../lib/noteExport';
import { noteExportFormatKey } from './notePreferences';

function readStoredFormat(userId: string): NoteExportFormat {
  if (!userId) return 'md';
  try {
    return parseNoteExportFormat(localStorage.getItem(noteExportFormatKey(userId)));
  } catch {
    return 'md';
  }
}

/** Per-user "Save to file" format; defaults to Markdown. */
export function useNoteExportFormat(userId: string) {
  const [format, setFormatState] = useState<NoteExportFormat>(() => readStoredFormat(userId));

  useEffect(() => {
    setFormatState(readStoredFormat(userId));
  }, [userId]);

  const setFormat = useCallback(
    (next: NoteExportFormat) => {
      setFormatState(next);
      if (!userId) return;
      try {
        localStorage.setItem(noteExportFormatKey(userId), next);
      } catch {
        /* preference is a convenience; the choice still applies this session */
      }
    },
    [userId],
  );

  return { format, setFormat };
}
