import { useEffect, useRef } from 'react';
import type { ToolFilePayload } from '../../lib/toolFileExport';
import { isSaveNoteShortcut } from '../notes/noteFileActions';

export type ToolFileSaveResult = { ok: boolean; path?: string; canceled?: boolean; error?: string };

export type UseToolFileSaveArgs = {
  /** Listen only while the page has a tab to save. */
  active: boolean;
  getFile: () => ToolFilePayload | null;
  /** Drain the open editor first so the file holds the very last keystrokes. */
  flush: () => Promise<void>;
  /** Desktop bridge; undefined in the plain web build. */
  saveFile: ((payload: ToolFilePayload) => Promise<ToolFileSaveResult>) | undefined;
  notify: { success: (title: string, description?: string) => void; error: (title: string, description?: string) => void };
};

/** ⇧⌘S / Ctrl+Shift+S on a Tools page: save the open tab to a file, like Notes. */
export function useToolFileSave(args: UseToolFileSaveArgs): void {
  const latest = useRef(args);
  latest.current = args;
  const busyRef = useRef(false);

  useEffect(() => {
    if (!args.active) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isSaveNoteShortcut(e)) return;
      e.preventDefault();
      if (busyRef.current) return;
      busyRef.current = true;
      void (async () => {
        try {
          const { flush, getFile, saveFile, notify } = latest.current;
          await flush();
          const file = getFile();
          if (!file) return;
          if (!saveFile) {
            notify.error('Saving files needs the desktop app');
            return;
          }
          const result = await saveFile(file);
          if (result.ok) notify.success('File saved', result.path);
          else if (!result.canceled) notify.error('Could not save file', result.error ?? 'Unknown error');
        } catch (err) {
          latest.current.notify.error('Could not save file', err instanceof Error ? err.message : String(err));
        } finally {
          busyRef.current = false;
        }
      })();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [args.active]);
}
