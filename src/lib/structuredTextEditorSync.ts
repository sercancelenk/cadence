import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { MutableRefObject } from 'react';

type ReplaceDocOptions = {
  preserveSelection?: boolean;
  /** When false, the change is excluded from undo/redo. Default true. */
  recordHistory?: boolean;
};

/** Replace the full document in a CodeMirror view. */
export function replaceStructuredTextDoc(
  view: EditorView,
  text: string,
  { preserveSelection = true, recordHistory = true }: ReplaceDocOptions = {},
) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    ...(preserveSelection ? { selection: view.state.selection } : {}),
    ...(recordHistory ? {} : { annotations: Transaction.addToHistory.of(false) }),
  });
}

/**
 * Apply a prop-driven value to the editor without polluting undo history.
 * Returns true when the document was updated.
 */
export function syncStructuredTextDocFromProp(
  view: EditorView,
  value: string,
  lastEmitted: MutableRefObject<string | null>,
): boolean {
  if (value === lastEmitted.current) return false;
  if (value === view.state.doc.toString()) {
    lastEmitted.current = value;
    return false;
  }
  replaceStructuredTextDoc(view, value, { recordHistory: false });
  lastEmitted.current = value;
  return true;
}
