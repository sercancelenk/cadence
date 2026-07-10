import { useCallback, useEffect, useState } from 'react';
import type { Note } from '../../model';
import { decryptBodyWithMaster } from '../../lib/notesCrypto';
import { prepareStoredRichBodyForDisplay } from '../../lib/richTextBody';
import type { NotesUnlockApi } from '../../providers/NotesUnlockContext';
import {
  listNoteRevisions,
  noteRevisionAvailable,
  noteSnapshotFromNote,
  readNoteRevision,
  revisionToNotePatch,
  tryAppendNoteRevision,
} from '../../lib/noteRevision/noteRevisionStore';
import type { NoteRevisionPayload } from '../../lib/noteRevision/types';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { runBeforeFlushHooks } from '../../lib/pendingSaveFlush';
import { noteDisplayTitle } from './noteDisplay';
import { displayNoteTitle } from './notePreferences';

export function useNoteVersionHistory(
  note: Note | null,
  editorReady: boolean,
  unlock: NotesUnlockApi,
  patchNote: (id: string, patch: Partial<Note>) => void,
  replaceNote: (note: Note) => void,
  flushPendingSave: () => Promise<void>,
  setDecrypted: React.Dispatch<
    React.SetStateAction<({ noteId: string } & RichTextBodyFields) | null>
  >,
  getRevisionSnapshot?: () => ReturnType<typeof noteSnapshotFromNote> | null,
) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [revisions, setRevisions] = useState<NoteRevisionPayload[]>([]);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string | null>(null);
  const [previewRevision, setPreviewRevision] = useState<NoteRevisionPayload | null>(null);
  const [previewBody, setPreviewBody] = useState<string>('');
  const [previewFormat, setPreviewFormat] = useState<'markdown' | 'prosemirror' | 'auto'>('auto');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [manualLabel, setManualLabel] = useState('');

  const available = noteRevisionAvailable();

  const refreshList = useCallback(async () => {
    if (!note || !available) {
      setRevisions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await listNoteRevisions(note.id);
      setRevisions(list);
      setSelectedRevisionId((prev) => {
        if (prev && list.some((r) => r.id === prev)) return prev;
        return list.length ? list[0].id : null;
      });
    } catch {
      setError('Could not load version history.');
    } finally {
      setLoading(false);
    }
  }, [available, note]);

  useEffect(() => {
    if (!open) return;
    void refreshList();
  }, [open, refreshList]);

  useEffect(() => {
    if (!open || !note || !selectedRevisionId) {
      setPreviewRevision(null);
      setPreviewBody('');
      setPreviewLoading(false);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setPreviewBody('');
    void (async () => {
      const revision = await readNoteRevision(note.id, selectedRevisionId);
      if (cancelled) return;
      if (!revision) {
        setPreviewRevision(null);
        setPreviewBody('');
        setPreviewLoading(false);
        setError('Could not load this version.');
        return;
      }
      setPreviewRevision(revision);
      setError(null);

      if (revision.locked && revision.cipher) {
        const key = unlock.read();
        if (!key) {
          setPreviewBody('');
          setPreviewFormat('auto');
          setPreviewLoading(false);
          return;
        }
        const body = await decryptBodyWithMaster(key, revision.cipher);
        if (cancelled) return;
        setPreviewBody(
          prepareStoredRichBodyForDisplay(body ?? '', revision.bodyFormat ?? 'prosemirror'),
        );
        setPreviewFormat(revision.bodyFormat ?? 'auto');
        setPreviewLoading(false);
        return;
      }

      setPreviewBody(
        prepareStoredRichBodyForDisplay(revision.body ?? '', revision.bodyFormat ?? 'prosemirror'),
      );
      setPreviewFormat(revision.bodyFormat ?? 'auto');
      setPreviewLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [note, open, selectedRevisionId, unlock]);

  const saveManualVersion = useCallback(async () => {
    if (!note) return;
    setBusy(true);
    setError(null);
    try {
      // Commit any in-flight edits first so an explicit "Save version" captures
      // the user's latest keystrokes, not the note as it stood one debounce ago.
      await runBeforeFlushHooks();
      await flushPendingSave();
      // Prefer the freshest snapshot (updated synchronously by the editor flush)
      // over the render-closure `note`, which still lags the just-flushed edits.
      const snapshot = getRevisionSnapshot?.() ?? noteSnapshotFromNote(note);
      await tryAppendNoteRevision(snapshot, snapshot, 'manual', {
        force: true,
        label: manualLabel.trim() || undefined,
      });
      setManualLabel('');
      await refreshList();
    } catch {
      setError('Could not save this version.');
    } finally {
      setBusy(false);
    }
  }, [manualLabel, note, refreshList, flushPendingSave, getRevisionSnapshot]);

  const restoreSelected = useCallback(async () => {
    if (!note || !previewRevision) return;
    setBusy(true);
    setError(null);
    try {
      // Commit any in-flight edits (e.g. a locked note still encrypting its
      // latest keystrokes) BEFORE we checkpoint and overwrite. Running the
      // before-flush hooks both writes those edits into AppData and records an
      // autosave revision, so restoring an older version can never silently
      // discard pending changes that hadn't been persisted yet.
      await runBeforeFlushHooks();
      await flushPendingSave();
      // Use the freshest snapshot for the safety checkpoint so it captures the
      // edits we just flushed (the closure `note` still lags them by a render).
      const preRestore = getRevisionSnapshot?.() ?? noteSnapshotFromNote(note);
      const checkpointOk = await tryAppendNoteRevision(
        preRestore,
        preRestore,
        'pre-restore',
        { force: true },
      );
      if (!checkpointOk) {
        setError('Could not save a checkpoint before restore. Try again.');
        return;
      }

      const patch = revisionToNotePatch(previewRevision);
      if (previewRevision.locked && previewRevision.cipher) {
        replaceNote({
          ...note,
          ...patch,
        });
        setDecrypted(null);
        unlock.clear();
      } else {
        patchNote(note.id, patch);
      }
      await flushPendingSave();
      setOpen(false);
    } catch {
      setError('Could not restore this version.');
    } finally {
      setBusy(false);
    }
  }, [note, patchNote, previewRevision, replaceNote, flushPendingSave, setDecrypted, unlock, getRevisionSnapshot]);

  const needsUnlock = !!note?.locked && !editorReady;

  return {
    open,
    setOpen,
    available,
    loading,
    previewLoading,
    revisions,
    selectedRevisionId,
    setSelectedRevisionId,
    previewRevision,
    previewBody,
    previewFormat,
    previewTitle: displayNoteTitle(previewRevision?.title ?? note?.title),
    noteTitle: note ? noteDisplayTitle(note) : displayNoteTitle(null),
    error,
    busy,
    manualLabel,
    setManualLabel,
    saveManualVersion,
    restoreSelected,
    needsUnlock,
    refreshList,
  };
}
