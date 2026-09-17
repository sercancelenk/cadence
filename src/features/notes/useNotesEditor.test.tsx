/**
 * `onChangeBody` is handed to a memoized editor pane, so it must keep its
 * identity across renders. Reading the note from a ref instead of a closure is
 * what makes that possible, and is also what makes the note id an editor
 * flush carries load-bearing: the ref has already moved on by the time the
 * editor being replaced flushes what the user typed into the old note.
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AppData, Note } from '../../model';
import type { NotesUnlockApi } from '../../providers/NotesUnlockContext';
import { useNotesEditor } from './useNotesEditor';

const AT = '2024-01-01T00:00:00.000Z';

function note(id: string, body = ''): Note {
  return {
    id,
    title: '',
    body,
    bodyFormat: 'prosemirror',
    locked: false,
    createdAt: AT,
    updatedAt: AT,
  };
}

function payload(text: string) {
  return {
    doc: {
      type: 'doc' as const,
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text }] }],
    },
    plainText: text,
  };
}

const unlock: NotesUnlockApi = {
  read: () => null,
  set: () => {},
  clear: () => {},
} as unknown as NotesUnlockApi;

function lockedNote(id: string): Note {
  return { ...note(id), locked: true, body: '', cipher: { ivB64: 'x', cipherB64: 'y' } };
}

function setup(initial: Note) {
  const patchNote = vi.fn();
  const update = vi.fn<(fn: (d: AppData) => AppData) => void>();
  const captureRevision = vi.fn();
  const onEncryptError = vi.fn();
  const view = renderHook(
    ({ selected }: { selected: Note }) =>
      useNotesEditor(
        selected,
        patchNote,
        update,
        unlock,
        captureRevision,
        undefined,
        onEncryptError,
      ),
    { initialProps: { selected: initial } },
  );
  return { view, patchNote, update, onEncryptError };
}

describe('useNotesEditor.onChangeBody', () => {
  it('keeps the same identity when the selected note object changes', () => {
    const { view } = setup(note('n1'));
    const first = view.result.current.onChangeBody;

    view.rerender({ selected: { ...note('n1'), updatedAt: '2024-02-02T00:00:00.000Z' } });

    expect(view.result.current.onChangeBody).toBe(first);
  });

  it('writes an untagged flush to the note currently selected', () => {
    const { view, patchNote } = setup(note('n1'));
    const stableOnChange = view.result.current.onChangeBody;

    view.rerender({ selected: note('n2') });
    stableOnChange(payload('typed in n2'));

    expect(patchNote).toHaveBeenCalledTimes(1);
    expect(patchNote.mock.calls[0][0]).toBe('n2');
  });

  /**
   * The body editor is keyed by note id, so switching notes unmounts it and its
   * cleanup flushes the debounced buffer — after the selection has already
   * moved. That text belongs to the note it was typed into.
   */
  it('writes the unmount flush of the previous editor to the previous note', () => {
    const { view, patchNote } = setup(note('n1'));
    const stableOnChange = view.result.current.onChangeBody;

    view.rerender({ selected: note('n2') });
    stableOnChange(payload('typed in n1 just before switching'), 'n1');

    expect(patchNote).toHaveBeenCalledTimes(1);
    expect(patchNote.mock.calls[0][0]).toBe('n1');
    expect(patchNote.mock.calls[0][1]).toMatchObject({
      bodyPlainText: 'typed in n1 just before switching',
    });
  });

  /**
   * The unmount flush arrives from a passive effect cleanup, so it can land
   * after the selection has moved on more than once. Remembering only the
   * immediately previous note would silently discard what the user typed.
   */
  it('writes a flush that arrives after several further switches', () => {
    const { view, patchNote } = setup(note('n1'));
    const stableOnChange = view.result.current.onChangeBody;

    for (const id of ['n2', 'n3', 'n4', 'n5']) view.rerender({ selected: note(id) });
    stableOnChange(payload('typed in n1 several switches ago'), 'n1');

    expect(patchNote).toHaveBeenCalledTimes(1);
    expect(patchNote.mock.calls[0][0]).toBe('n1');
    expect(patchNote.mock.calls[0][1]).toMatchObject({
      bodyPlainText: 'typed in n1 several switches ago',
    });
  });

  it('drops a flush for a note it can no longer identify', () => {
    const { view, patchNote } = setup(note('n1'));
    const stableOnChange = view.result.current.onChangeBody;

    view.rerender({ selected: note('n2') });
    stableOnChange(payload('orphaned text'), 'never-selected');

    expect(patchNote).not.toHaveBeenCalled();
  });

  it('skips the patch when the body did not actually change', () => {
    const { view, patchNote } = setup(note('n1'));
    view.result.current.onChangeBody(payload('hello'));
    expect(patchNote).toHaveBeenCalledTimes(1);

    const stored = patchNote.mock.calls[0][1] as Partial<Note>;
    view.rerender({ selected: { ...note('n1'), ...stored } as Note });
    view.result.current.onChangeBody(payload('hello'));

    expect(patchNote).toHaveBeenCalledTimes(1);
  });

  it('does not drop a locked edit or blank the editor when the session key is gone', () => {
    const n1 = lockedNote('n1');
    const { view, patchNote, update, onEncryptError } = setup(n1);
    const plaintext = {
      noteId: 'n1',
      body: '{"type":"doc","content":[]}',
      bodyFormat: 'prosemirror' as const,
    };
    act(() => {
      view.result.current.setDecrypted(plaintext);
    });

    act(() => {
      view.result.current.onChangeBody(payload('typed while locked'));
    });

    expect(patchNote).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(onEncryptError).toHaveBeenCalledTimes(1);
    expect(view.result.current.decrypted).toEqual(plaintext);
  });

  it('a late locked flush for a previous note does not blank the note on screen', () => {
    const { view, onEncryptError } = setup(lockedNote('n1'));
    const stableOnChange = view.result.current.onChangeBody;
    const onScreen = {
      noteId: 'n2',
      body: '{"type":"doc","content":[]}',
      bodyFormat: 'prosemirror' as const,
    };

    view.rerender({ selected: lockedNote('n2') });
    act(() => {
      view.result.current.setDecrypted(onScreen);
    });
    act(() => {
      stableOnChange(payload('typed in n1 just before switching'), 'n1');
    });

    expect(onEncryptError).toHaveBeenCalledTimes(1);
    expect(view.result.current.decrypted).toEqual(onScreen);
  });
});
