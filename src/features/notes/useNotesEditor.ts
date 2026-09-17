import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
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
import { registerBeforeFlushHook, runBeforeFlushHooks } from '../../lib/pendingSaveFlush';
import { deriveStoredTitleFromPlainText } from './noteDisplay';

/**
 * How many previously selected notes stay eligible to receive a late flush.
 * Bounded because each entry pins a full note body in memory, and a flush that
 * has not arrived within this many switches is never going to.
 */
const FLUSH_TARGET_HISTORY = 8;

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
  createNoteEditIntentRef?: MutableRefObject<string | null>,
  onEncryptError?: (message: string) => void,
) {
  const [decrypted, setDecrypted] = useState<
    ({ noteId: string } & RichTextBodyFields) | null
  >(null);
  const [editorAutoFocus, setEditorAutoFocus] = useState(false);
  const lastSelectedIdRef = useRef<string | null>(null);
  const encryptGenByNote = useRef(new Map<string, number>());
  const latestRevisionNoteRef = useRef<Note | null>(null);
  const latestBodyFieldsRef = useRef<({ noteId: string } & RichTextBodyFields) | null>(null);
  const pendingLockedNoteRef = useRef<Note | null>(null);
  const selectedRef = useRef(selected);
  /**
   * Notes selected earlier in this session, oldest first.
   *
   * The body editor is keyed by note id, so switching notes unmounts it — and
   * its cleanup flushes the debounced buffer *after* this render has already
   * pointed `selectedRef` at the new note. That flush still carries the old
   * note's text, so the old note has to stay reachable to receive it.
   *
   * The flush arrives from a passive effect cleanup. React normally drains
   * those before the next commit, but nothing in the contract promises it, so
   * two quick switches can leave the first note's flush still queued while the
   * selection has already moved on twice. Remembering only the immediately
   * previous note would drop that edit; a short history cannot.
   */
  const recentlySelectedRef = useRef(new Map<string, Note>());
  if (selectedRef.current?.id !== selected?.id) {
    const leaving = selectedRef.current;
    if (leaving) {
      const recent = recentlySelectedRef.current;
      // Re-inserted rather than updated in place so the map stays ordered
      // oldest-first and eviction always drops the least recent note.
      recent.delete(leaving.id);
      recent.set(leaving.id, leaving);
      while (recent.size > FLUSH_TARGET_HISTORY) {
        const oldest = recent.keys().next().value;
        if (oldest === undefined) break;
        recent.delete(oldest);
      }
    }
  }
  selectedRef.current = selected;
  // Kept in a ref so the encrypt callbacks below don't need it in their
  // dependency arrays (which would re-register the flush hook on every render).
  const onEncryptErrorRef = useRef(onEncryptError);
  onEncryptErrorRef.current = onEncryptError;

  const ENCRYPT_FAIL_MESSAGE =
    'Could not encrypt this locked note — your latest changes are NOT saved. Copy them elsewhere and try again.';

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
    let cipher: Note['cipher'];
    try {
      cipher = await encryptBodyWithMaster(key, pending.body);
    } catch (err) {
      // Leave latestBodyFieldsRef / pendingLockedNoteRef intact so a later flush
      // retries this body instead of silently dropping the user's edit.
      console.error('[cadence] locked-note encrypt failed during flush', err);
      onEncryptErrorRef.current?.(ENCRYPT_FAIL_MESSAGE);
      return;
    }
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
    if (!selected?.id) {
      lastSelectedIdRef.current = null;
      setEditorAutoFocus(false);
      return;
    }

    const intentId = createNoteEditIntentRef?.current ?? null;
    const selectionChanged = lastSelectedIdRef.current !== selected.id;
    lastSelectedIdRef.current = selected.id;

    if (intentId === selected.id) {
      setEditorAutoFocus(true);
      if (createNoteEditIntentRef) createNoteEditIntentRef.current = null;
      return;
    }

    if (selectionChanged) {
      setEditorAutoFocus(false);
    }
  }, [selected?.id, createNoteEditIntentRef]);

  const clearEditorAutoFocus = useCallback(() => {
    setEditorAutoFocus(false);
  }, []);

  const rememberRevisionNote = useCallback((next: Note) => {
    latestRevisionNoteRef.current = next;
  }, []);

  const getRevisionSnapshot = useCallback((): NoteRevisionSnapshot | null => {
    const note = latestRevisionNoteRef.current;
    if (!note) return null;
    return noteSnapshotFromNote(note);
  }, []);

  /**
   * The note a flush belongs to.
   *
   * An editor that tags its flush with a note id is authoritative: that is the
   * document the user was typing into, whatever has been selected since. An id
   * matching neither the current note nor one selected recently is dropped —
   * losing the last few hundred milliseconds of typing is recoverable, writing
   * it over a different note is not.
   */
  const noteForFlush = useCallback((noteId?: string): Note | null => {
    const current = selectedRef.current;
    if (!noteId) return current;
    if (current?.id === noteId) return current;
    const recent = recentlySelectedRef.current.get(noteId);
    if (recent) return recent;
    // No known way to reach this, but a discarded edit must never be invisible:
    // this is the only trace a field report would have to go on.
    console.error('[cadence] dropped editor flush for unreachable note', noteId);
    return null;
  }, []);

  /**
   * Stable across renders so the editor subtree can be memoized, which is why
   * the note comes from `noteForFlush` rather than a closure: by the time an
   * unmounting editor flushes, the render that replaced it has already moved
   * the selection on.
   */
  const onChangeBody = useCallback((payload: RichTextPayload, flushedNoteId?: string) => {
    const selected = noteForFlush(flushedNoteId);
    if (!selected) return;
    const fields = richBodyFieldsFromPayload(payload);
    const derivedTitle = deriveStoredTitleFromPlainText(payload.plainText);
    const titleChanged = (selected.title ?? '') !== derivedTitle;
    if (noteBodyPatchIsNoOp(selected, fields, { nextBodyIsCanonical: true }) && !titleChanged) {
      return;
    }
    latestBodyFieldsRef.current = { noteId: selected.id, ...fields };
    const prev = selected;
    if (!selected.locked) {
      const nextNote = noteForRevisionSnapshot(
        { ...selected, title: derivedTitle },
        fields,
      );
      rememberRevisionNote(nextNote);
      patchNote(selected.id, { ...fields, title: derivedTitle });
      captureRevision?.(prev, nextNote, 'autosave');
      return;
    }
    const key = unlock.read();
    if (!key) {
      // Keep the plaintext and the pending refs so a later flush (quit, unlock)
      // can retry. Clearing `decrypted` would set editorBody to '' for a locked
      // note — and if this flush belongs to a *previous* locked note, it would
      // blank the note currently on screen. The user must be told the last
      // keystrokes are not on disk yet, or they will close the window thinking
      // they are.
      pendingLockedNoteRef.current = selected;
      onEncryptErrorRef.current?.(ENCRYPT_FAIL_MESSAGE);
      return;
    }
    setDecrypted({ noteId: selected.id, ...fields });
    if (titleChanged) {
      patchNote(selected.id, { title: derivedTitle });
      rememberRevisionNote({ ...selected, title: derivedTitle });
    }
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
      let cipher: Note['cipher'];
      try {
        cipher = await encryptBodyWithMaster(key, fields.body);
      } catch (err) {
        // The plaintext is held in `decrypted` and the pending refs still point
        // at this edit, so a later autosave / flush retries. Tell the user their
        // change is not yet persisted instead of failing silently.
        console.error('[cadence] locked-note encrypt failed', err);
        onEncryptErrorRef.current?.(ENCRYPT_FAIL_MESSAGE);
        return;
      }
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
        title: derivedTitle,
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
  }, [captureRevision, noteForFlush, patchNote, rememberRevisionNote, unlock, update]);

  const hideSelected = async () => {
    if (!selected || !selected.locked) return;
    // Flush the debounced editor buffer AND encrypt the pending locked body
    // before dropping the session key / unmounting into NotesLockedView.
    // Order is critical: unlock.clear() before flush would drop up to one
    // debounce of edits (editor onChangeBody bails with no key).
    await runBeforeFlushHooks();
    setDecrypted(null);
    unlock.clear();
  };

  return {
    decrypted,
    setDecrypted,
    editorAutoFocus,
    clearEditorAutoFocus,
    decryptedForSelected,
    editorReady,
    editorBodyFormat,
    editorBody,
    onChangeBody,
    hideSelected,
    getRevisionSnapshot,
    getLatestBodyFields: () => latestBodyFieldsRef.current,
  };
}
