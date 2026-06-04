import { useEffect, useMemo, useRef, useState } from 'react';
import type { RichTextPayload, RichTextBodyFormat } from '../../lib/richText';
import {
  noteBodyPatchIsNoOp,
  plainTextFromBodyFields,
  richTextPayloadToBodyFields,
  type RichTextBodyFields,
} from '../../lib/richTextBody';
import { encryptBodyWithMaster } from '../../lib/notesCrypto';
import type { NotesUnlockApi } from '../../providers/NotesUnlockContext';
import type { Note } from '../../model';

export function useNotesEditor(
  selected: Note | null,
  patchNote: (id: string, patch: Partial<Note>) => void,
  replaceNote: (note: Note) => void,
  unlock: NotesUnlockApi,
) {
  const [decrypted, setDecrypted] = useState<
    ({ noteId: string } & RichTextBodyFields) | null
  >(null);
  const [bodyEditing, setBodyEditing] = useState(false);
  const encryptGen = useRef(0);

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
    if (!selected) {
      setDecrypted(null);
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
    const fields: RichTextBodyFields | null = selected.locked
      ? decryptedForSelected
      : {
          body: selected.body ?? '',
          bodyFormat: selected.bodyFormat,
          bodyPlainText: selected.bodyPlainText,
        };
    setBodyEditing(!plainTextFromBodyFields(fields ?? { body: '' }).trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, editorReady]);

  const onChangeTitle = (next: string) => {
    if (!selected) return;
    patchNote(selected.id, { title: next });
  };

  const onChangeBody = (payload: RichTextPayload) => {
    if (!selected) return;
    const fields = payload.plainText.trim()
      ? richTextPayloadToBodyFields(payload)
      : { body: '', bodyFormat: undefined, bodyPlainText: undefined };
    if (noteBodyPatchIsNoOp(selected, fields)) return;
    if (!selected.locked) {
      patchNote(selected.id, fields);
      return;
    }
    setDecrypted({ noteId: selected.id, ...fields });
    const key = unlock.read();
    if (!key) return;
    if (!payload.plainText.trim()) return;
    const myGen = ++encryptGen.current;
    void (async () => {
      const cipher = await encryptBodyWithMaster(key, fields.body);
      if (myGen !== encryptGen.current) return;
      replaceNote({
        ...selected,
        body: '',
        locked: true,
        cipher,
        bodyFormat: fields.bodyFormat,
        bodyPlainText: undefined,
      });
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
  };
}
