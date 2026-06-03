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
  if (text === view.state.doc.toString()) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: text },
    ...(preserveSelection ? { selection: view.state.selection } : {}),
    ...(recordHistory ? {} : { annotations: Transaction.addToHistory.of(false) }),
  });
}

/**
 * Record a toolbar-driven local edit (format, convert, …) before parent props catch up.
 * Prevents syncStructuredTextDocFromProp from reverting the editor on the next render.
 */
export function commitLocalStructuredTextEdit(
  view: EditorView,
  text: string,
  lastEmitted: MutableRefObject<string | null>,
  holdPropSync: MutableRefObject<boolean>,
): void {
  replaceStructuredTextDoc(view, text);
  lastEmitted.current = text;
  holdPropSync.current = true;
}

export function syncStructuredTextDocFromProp(
  view: EditorView,
  value: string,
  lastEmitted: MutableRefObject<string | null>,
  holdPropSync?: MutableRefObject<boolean>,
): boolean {
  const current = view.state.doc.toString();

  if (holdPropSync?.current) {
    if (value === current) {
      holdPropSync.current = false;
      lastEmitted.current = value;
    }
    return false;
  }

  if (current === value) {
    lastEmitted.current = value;
    return false;
  }
  if (value === lastEmitted.current) return false;
  replaceStructuredTextDoc(view, value, { recordHistory: false });
  lastEmitted.current = value;
  return true;
}
