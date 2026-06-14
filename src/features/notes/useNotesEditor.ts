import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RichTextPayload, RichTextBodyFormat } from '../../lib/richText';
import {
  noteBodyPatchIsNoOp,
  richBodyFieldsFromPayload,
  type RichTextBodyFields,
} from '../../lib/richTextBody';
import { encryptBodyWithMaster } from '../../lib/notesCrypto';
import { attachmentRefsFromAnyBody } from '../../lib/richTextAttachmentIndex';
import { canonicalDocSignature } from '../../lib/richTextBody';
import { patchNoteLockState } from '../../core/actions';
import type { AppData } from '../../model';
import { noteSnapshotFromNote } from '../../lib/noteRevision/noteRevisionStore';
import type { NoteRevisionSnapshot } from '../../lib/noteRevision/types';
import type { NotesUnlockApi } from '../../providers/NotesUnlockContext';
import type { Note } from '../../model';
import type { NoteRevisionTrigger } from '../../lib/noteRevision/types';
import { registerBeforeFlushHook } from '../../lib/pendingSaveFlush';

export type NoteRevisionCapture = (
  prev: Note,
  next: Note,
  trigger: NoteRevisionTrigger,
  options?: { force?: boolean; label?: string },
) => void;

function noteForRevisionSnapshot(note: Note, fields?: RichTextBodyFields): Note {
  if (!fields) return note;
  const attachmentRefs = attachmentRefsFromAnyBody(fields.body, fields.bodyFormat);
  if (note.locked) {
    return {
      ...note,
      body: '',
      bodyFormat: fields.bodyFormat,
      bodyPlainText: undefined,
      // Always an array (even empty) so orphan GC can trust it: a present
      // attachmentRefs list means "these are all the attachments this locked
      // note uses", which is the signal GC needs to safely prune the rest.
      attachmentRefs,
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
  update: (fn: (d: AppData) => AppData) => void,
  unlock: NotesUnlockApi,
  captureRevision?: NoteRevisionCapture,
) {
  const [decrypted, setDecrypted] = useState<
    ({ noteId: string } & RichTextBodyFields) | null
  >(null);
  const [bodyEditing, setBodyEditing] = useState(false);
  const encryptGenByNote = useRef(new Map<string, number>());
  const latestRevisionNoteRef = useRef<Note | null>(null);
  const latestBodyFieldsRef = useRef<({ noteId: string } & RichTextBodyFields) | null>(null);
  const pendingLockedNoteRef = useRef<Note | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const flushPendingLockedBody = useCallback(async () => {
    const pending = latestBodyFieldsRef.current;
    const note = pendingLockedNoteRef.current;
    if (!pending || !note || pending.noteId !== note.id || !note.locked) return;
    if (noteBodyPatchIsNoOp(note, pending)) {
      latestBodyFieldsRef.current = null;
      return;
    }
    const key = unlock.read();
    if (!key) return;
    const noteId = note.id;
    const myGen = (encryptGenByNote.current.get(noteId) ?? 0) + 1;
    encryptGenByNote.current.set(noteId, myGen);
    const cipher = await encryptBodyWithMaster(key, pending.body);
    if (encryptGenByNote.current.get(noteId) !== myGen) return;
    const attachmentRefs = attachmentRefsFromAnyBody(pending.body, pending.bodyFormat);
    const lockedBodySignature = canonicalDocSignature(pending.body, pending.bodyFormat);
    // Merge only the lock-state fields onto the live note so a title/pin/archive
    // change made while we were encrypting is preserved (see patchNoteLockState).
    update((d) =>
      patchNoteLockState(d, noteId, {
        cipher,
        bodyFormat: pending.bodyFormat,
        attachmentRefs,
        lockedBodySignature,
      }),
    );
    const nextNote: Note = {
      ...note,
      body: '',
      locked: true,
      cipher,
      bodyFormat: pending.bodyFormat,
      bodyPlainText: undefined,
      attachmentRefs,
      lockedBodySignature,
    };
    latestRevisionNoteRef.current = nextNote;
    captureRevision?.(note, nextNote, 'autosave');
    latestBodyFieldsRef.current = null;
    pendingLockedNoteRef.current = null;
  }, [unlock, update, captureRevision]);

  useEffect(() => {
    return registerBeforeFlushHook(() => flushPendingLockedBody());
  }, [flushPendingLockedBody]);

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
    return () => {
      void flushPendingLockedBody();
    };
  }, [selected?.id, flushPendingLockedBody]);

  useEffect(() => {
    if (!selected) {
      setDecrypted(null);
      latestRevisionNoteRef.current = null;
      latestBodyFieldsRef.current = null;
      pendingLockedNoteRef.current = null;
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
    latestBodyFieldsRef.current = { noteId: selected.id, ...fields };
    const prev = selected;
    if (!selected.locked) {
      const nextNote = noteForRevisionSnapshot(selected, fields);
      rememberRevisionNote(nextNote);
      patchNote(selected.id, fields);
      captureRevision?.(prev, nextNote, 'autosave');
      return;
    }
    const key = unlock.read();
    if (!key) {
      setDecrypted(null);
      return;
    }
    setDecrypted({ noteId: selected.id, ...fields });
    // NOTE: do NOT publish a revision snapshot with the new plaintext signature
    // yet — the matching ciphertext is still encrypting below. Until it lands,
    // latestRevisionNoteRef must keep the previous (cipher ↔ signature
    // consistent) note so a mid-flight session/restore flush can never persist a
    // revision whose signature disagrees with its cipher.
    pendingLockedNoteRef.current = selected;
    const noteId = selected.id;
    const myGen = (encryptGenByNote.current.get(noteId) ?? 0) + 1;
    encryptGenByNote.current.set(noteId, myGen);
    void (async () => {
      const cipher = await encryptBodyWithMaster(key, fields.body);
      if (encryptGenByNote.current.get(noteId) !== myGen) return;
      const attachmentRefs = attachmentRefsFromAnyBody(fields.body, fields.bodyFormat);
      const lockedBodySignature = canonicalDocSignature(fields.body, fields.bodyFormat);
      update((d) =>
        patchNoteLockState(d, noteId, {
          cipher,
          bodyFormat: fields.bodyFormat,
          attachmentRefs,
          lockedBodySignature,
        }),
      );
      const nextNote: Note = {
        ...selected,
        body: '',
        locked: true,
        cipher,
        bodyFormat: fields.bodyFormat,
        bodyPlainText: undefined,
        attachmentRefs,
        lockedBodySignature,
      };
      rememberRevisionNote(nextNote);
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
    getLatestBodyFields: () => latestBodyFieldsRef.current,
  };
}
