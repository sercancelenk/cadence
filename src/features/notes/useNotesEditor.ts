import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RichTextPayload, RichTextBodyFormat } from '../../lib/richText';
import {
  noteBodyPatchIsNoOp,
  richBodyFieldsFromPayload,
  richTextPayloadIsEmpty,
  type RichTextBodyFields,
} from '../../lib/richTextBody';
import { encryptBodyWithMaster } from '../../lib/notesCrypto';
import { attachmentRefsFromBody } from '../../lib/richTextAttachmentIndex';
import { canonicalDocSignature } from '../../lib/richTextBody';
import { noteSnapshotFromNote } from '../../lib/noteRevision/noteRevisionStore';
import type { NoteRevisionSnapshot } from '../../lib/noteRevision/types';
import type { NotesUnlockApi } from '../../providers/NotesUnlockContext';
import type { Note } from '../../model';
import type { NoteRevisionTrigger } from '../../lib/noteRevision/types';

export type NoteRevisionCapture = (
  prev: Note,
  next: Note,
  trigger: NoteRevisionTrigger,
  options?: { force?: boolean; label?: string },
) => void;

function noteForRevisionSnapshot(note: Note, fields?: RichTextBodyFields): Note {
  if (!fields) return note;
  const attachmentRefs = attachmentRefsFromBody(fields.body, fields.bodyFormat);
  if (note.locked) {
    return {
      ...note,
      body: '',
      bodyFormat: fields.bodyFormat,
      bodyPlainText: undefined,
      attachmentRefs: attachmentRefs.length ? attachmentRefs : undefined,
      lockedBodySignature: canonicalDocSignature(fields.body, fields.bodyFormat),
    };
  }
  return {
    ...note,
    ...fields,
    attachmentRefs: undefined,
    lockedBodySignature: undefined,
  };
}

export function useNotesEditor(
  selected: Note | null,
  patchNote: (id: string, patch: Partial<Note>) => void,
  replaceNote: (note: Note) => void,
  unlock: NotesUnlockApi,
  captureRevision?: NoteRevisionCapture,
) {
  const [decrypted, setDecrypted] = useState<
    ({ noteId: string } & RichTextBodyFields) | null
  >(null);
  const [bodyEditing, setBodyEditing] = useState(false);
  const encryptGen = useRef(0);
  const latestRevisionNoteRef = useRef<Note | null>(null);

  const decryptedForSelected = useMemo(() => {
    if (!selected || !decrypted || decrypted.noteId !== selected.id) return null;
    return decrypted;
  }, [selected, decrypted]);

  const editorReady = !!selected && (!selected.locked || !!decryptedForSelected);

  // Unlocked notes read body/format only from `selected` so a debounced
  // `setDecrypted` cannot run ahead of `patchNote` and flash prosemirror
  // format with an empty body (that echo resets the caret mid-type).
  const editorBodyFormat: RichTextBodyFormat | 'auto' = selected?.locked
    ? (decryptedForSelected?.bodyFormat ?? selected?.bodyFormat ?? 'auto')
    : (selected?.bodyFormat ?? 'auto');

  const editorBody = !selected
    ? ''
    : selected.locked
      ? decryptedForSelected?.body ?? ''
      : selected.body ?? '';

  useEffect(() => {
    latestRevisionNoteRef.current = selected;
  }, [selected]);

  useEffect(() => {
    if (!selected) {
      setDecrypted(null);
      latestRevisionNoteRef.current = null;
      return;
    }
    if (decrypted && decrypted.noteId !== selected.id) {
      setDecrypted(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || !editorReady) {
      setBodyEditing(false);
      return;
    }
    setBodyEditing(false);
  }, [selected?.id, editorReady]);

  const rememberRevisionNote = useCallback((next: Note) => {
    latestRevisionNoteRef.current = next;
  }, []);

  const getRevisionSnapshot = useCallback((): NoteRevisionSnapshot | null => {
    const note = latestRevisionNoteRef.current;
    if (!note) return null;
    return noteSnapshotFromNote(note);
  }, []);

  const onChangeTitle = (next: string) => {
    if (!selected) return;
    const prev = selected;
    const nextNote = { ...selected, title: next };
    rememberRevisionNote(nextNote);
    patchNote(selected.id, { title: next });
    captureRevision?.(prev, nextNote, 'autosave');
  };

  const onChangeBody = (payload: RichTextPayload) => {
    if (!selected) return;
    const fields = richBodyFieldsFromPayload(payload);
    if (noteBodyPatchIsNoOp(selected, fields)) return;
    const prev = selected;
    if (!selected.locked) {
      const nextNote = noteForRevisionSnapshot(selected, fields);
      rememberRevisionNote(nextNote);
      patchNote(selected.id, fields);
      captureRevision?.(prev, nextNote, 'autosave');
      return;
    }
    setDecrypted({ noteId: selected.id, ...fields });
    rememberRevisionNote(noteForRevisionSnapshot(selected, fields));
    const key = unlock.read();
    if (!key) return;
    if (richTextPayloadIsEmpty(payload)) return;
    const myGen = ++encryptGen.current;
    void (async () => {
      const cipher = await encryptBodyWithMaster(key, fields.body);
      if (myGen !== encryptGen.current) return;
      const attachmentRefs = attachmentRefsFromBody(fields.body, fields.bodyFormat);
      const nextNote: Note = {
        ...selected,
        body: '',
        locked: true,
        cipher,
        bodyFormat: fields.bodyFormat,
        bodyPlainText: undefined,
        attachmentRefs: attachmentRefs.length ? attachmentRefs : undefined,
        lockedBodySignature: canonicalDocSignature(fields.body, fields.bodyFormat),
      };
      rememberRevisionNote(nextNote);
      replaceNote(nextNote);
      captureRevision?.(prev, nextNote, 'autosave');
    })();
  };

  const hideSelected = () => {
    if (!selected || !selected.locked) return;
    setBodyEditing(false);
    setDecrypted(null);
    unlock.clear();
  };

  return {
    decrypted,
    setDecrypted,
    bodyEditing,
    setBodyEditing,
    decryptedForSelected,
    editorReady,
    editorBodyFormat,
    editorBody,
    onChangeTitle,
    onChangeBody,
    hideSelected,
    getRevisionSnapshot,
  };
}
