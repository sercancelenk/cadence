import type { Note } from '../../model';
import {
  exportFileName,
  exportNoteContent,
  type NoteExportFormat,
} from '../../lib/noteExport';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { resolveRichTextContent } from '../../lib/richTextImport';

export type SaveNotePayload = {
  suggestedName: string;
  format: NoteExportFormat;
  content: string;
};

export type SaveNoteResult = { ok: boolean; path?: string; canceled?: boolean; error?: string };

export type SaveNoteDeps = {
  /** Latest copy of the selected note — read AFTER `flush` resolves. */
  getNote: () => Note | undefined;
  /** Decrypted body of a locked note, or null when it is not unlocked. */
  getLockedBody: (noteId: string) => RichTextBodyFields | null;
  /** Drains the editor buffer and pending AppData save. */
  flush: () => Promise<void>;
  /** Desktop bridge; undefined in the plain web build. */
  saveFile: ((payload: SaveNotePayload) => Promise<SaveNoteResult>) | undefined;
  format: NoteExportFormat;
  notify: {
    success: (title: string, description?: string) => void;
    error: (title: string, description?: string) => void;
  };
};

export type SaveNoteOutcome = 'saved' | 'canceled' | 'error' | 'locked' | 'none';

/** Cmd+S / Ctrl+S, without Shift or Alt. */
export function isSaveNoteShortcut(e: KeyboardEvent): boolean {
  return Boolean(
    (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S'),
  );
}

export async function saveNoteToDisk(deps: SaveNoteDeps): Promise<SaveNoteOutcome> {
  if (!deps.getNote()) return 'none';

  // Commit in-flight typing first, then read: the note we export must be the
  // one on screen, not the copy from before the editor buffer drained.
  await deps.flush();
  const note = deps.getNote();
  if (!note) return 'none';

  let fields: RichTextBodyFields;
  if (note.locked) {
    const unlocked = deps.getLockedBody(note.id);
    if (!unlocked) {
      deps.notify.error('Note is locked', 'Unlock this note before saving it to a file.');
      return 'locked';
    }
    fields = unlocked;
  } else {
    fields = { body: note.body ?? '', bodyFormat: note.bodyFormat };
  }

  if (!deps.saveFile) {
    deps.notify.error('Saving files needs the desktop app');
    return 'error';
  }

  const doc = resolveRichTextContent(fields.body, fields.bodyFormat);
  const result = await deps.saveFile({
    suggestedName: exportFileName(note.title, deps.format),
    format: deps.format,
    content: exportNoteContent(doc, note.title, deps.format),
  });

  if (result.ok) {
    deps.notify.success('Note saved', result.path);
    return 'saved';
  }
  if (result.canceled) return 'canceled';
  deps.notify.error('Could not save note', result.error ?? 'Unknown error');
  return 'error';
}
