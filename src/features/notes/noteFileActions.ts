import type { Note } from '../../model';
import {
  exportFileName,
  exportNoteContent,
  type NoteExportFormat,
} from '../../lib/noteExport';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { richPayloadFromDoc } from '../../lib/richText';
import { richBodyFieldsFromPayload } from '../../lib/richTextBody';
import { resolveRichTextContent } from '../../lib/richTextImport';
import {
  NOTE_IMPORT_MAX_BYTES,
  importFileToDoc,
  noteImportExtension,
  titleFromFileName,
} from '../../lib/noteImport';

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

type NoteBodyFields = { noteId: string } & RichTextBodyFields;

/**
 * Body of a locked note that may be written out. The editor buffer is only
 * trusted while the note is still decrypted: locking does not clear it, so
 * using it on its own would write plaintext of a note that is locked again.
 */
export function pickLockedBody(
  noteId: string,
  latest: NoteBodyFields | null,
  decrypted: NoteBodyFields | null,
): RichTextBodyFields | null {
  if (!decrypted || decrypted.noteId !== noteId) return null;
  return latest && latest.noteId === noteId ? latest : decrypted;
}

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

export type OpenNoteResult = {
  ok: boolean;
  name?: string;
  ext?: string;
  text?: string;
  canceled?: boolean;
  error?: string;
};

export type ImportedNoteFields = {
  title: string;
  body: string;
  bodyFormat: RichTextBodyFields['bodyFormat'];
  bodyPlainText?: string;
};

export type ImportNoteDeps = {
  /** Desktop bridge (native open dialog); undefined in the plain web build. */
  openFile: (() => Promise<OpenNoteResult>) | undefined;
  /** Adds a brand-new note holding these fields — never touches existing notes. */
  createNote: (fields: ImportedNoteFields) => void;
  notify: SaveNoteDeps['notify'];
};

export type ImportNoteOutcome = 'imported' | 'canceled' | 'error';

function createNoteFromText(
  name: string,
  ext: string,
  text: string,
  deps: Pick<ImportNoteDeps, 'createNote' | 'notify'>,
): ImportNoteOutcome {
  const doc = importFileToDoc(text, ext);
  const fields = richBodyFieldsFromPayload(richPayloadFromDoc(doc));
  const title = titleFromFileName(name);
  deps.createNote({
    title,
    body: fields.body,
    bodyFormat: fields.bodyFormat,
    bodyPlainText: fields.bodyPlainText,
  });
  deps.notify.success('Note imported', title || name);
  return 'imported';
}

/** "Open file…": pick a document and import it as a NEW note. */
export async function importFileAsNote(deps: ImportNoteDeps): Promise<ImportNoteOutcome> {
  if (!deps.openFile) {
    deps.notify.error('Opening files needs the desktop app');
    return 'error';
  }
  const result = await deps.openFile();
  if (result.canceled) return 'canceled';
  if (!result.ok || typeof result.text !== 'string') {
    deps.notify.error('Could not open file', result.error ?? 'Unknown error');
    return 'error';
  }
  return createNoteFromText(result.name ?? '', result.ext ?? 'txt', result.text, deps);
}

/** Drag-and-drop: the browser reads the file; no path crosses into main. */
export async function importDroppedFile(
  file: File,
  deps: Pick<ImportNoteDeps, 'createNote' | 'notify'>,
): Promise<ImportNoteOutcome> {
  const ext = noteImportExtension(file.name);
  if (!ext) {
    deps.notify.error('Unsupported file', 'Only .md, .markdown, .txt and .html files can be opened.');
    return 'error';
  }
  if (file.size > NOTE_IMPORT_MAX_BYTES) {
    deps.notify.error('File too large', 'Notes can be imported from files up to 5 MB.');
    return 'error';
  }
  const text = (await file.text()).replace(/\r\n?/g, '\n');
  return createNoteFromText(file.name, ext, text, deps);
}
