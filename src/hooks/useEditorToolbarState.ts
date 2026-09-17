import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { toolbarStateKey } from '../lib/richTextToolbarState';

/**
 * Keeps a toolbar's active-state snapshot in sync with the editor, re-rendering
 * only when the snapshot changes.
 *
 * ProseMirror fires a transaction for every keystroke, but the formatting state
 * a toolbar shows changes far more rarely — typically only on selection moves
 * and format commands. Diffing the snapshot turns a per-keystroke re-render of
 * the whole button row into an occasional one.
 */
export function useEditorToolbarState<T extends Record<string, boolean>>(
  editor: Editor,
  read: (editor: Editor) => T,
): T {
  const readRef = useRef(read);
  readRef.current = read;

  const [state, setState] = useState<T>(() => read(editor));
  const keyRef = useRef(toolbarStateKey(state));

  useEffect(() => {
    const sync = () => {
      const next = readRef.current(editor);
      const nextKey = toolbarStateKey(next);
      if (nextKey === keyRef.current) return;
      keyRef.current = nextKey;
      setState(next);
    };
    // The editor may have changed identity (or content) between the initial
    // read and this effect running.
    sync();
    // `transaction` alone: every selection change is dispatched as a
    // transaction, so `selectionUpdate` only ever fires alongside one. Listening
    // to both ran the whole snapshot — eighteen `isActive` probes plus two
    // undo/redo dry-runs — twice per keystroke on the editor's hot path.
    editor.on('transaction', sync);
    return () => {
      editor.off('transaction', sync);
    };
  }, [editor]);

  return state;
}
