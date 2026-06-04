import type { MergeView } from '@codemirror/merge';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';
import { semanticPathToSearchHints } from './structuredTextSemanticDiff';

/** Keep CodeMirror layout in sync when the host flexes (resize / fullscreen). */
export function observeStructuredTextHostResize(
  host: HTMLElement,
  view: EditorView,
): () => void {
  const ro = new ResizeObserver(() => {
    view.requestMeasure();
  });
  ro.observe(host);
  return () => ro.disconnect();
}

export function observeStructuredTextMergeHostResize(
  host: HTMLElement,
  merge: MergeView,
): () => void {
  const ro = new ResizeObserver(() => {
    merge.a.requestMeasure();
    merge.b.requestMeasure();
  });
  ro.observe(host);
  return () => ro.disconnect();
}

/** Open the in-editor search panel (⌘F / ⌘G). In diff mode, targets the focused side. */
export function openStructuredTextSearch(
  view: EditorView | null | undefined,
  merge?: MergeView | null,
): void {
  if (view) {
    openSearchPanel(view);
    view.focus();
    return;
  }
  if (!merge) return;
  const target = merge.b.hasFocus ? merge.b : merge.a;
  openSearchPanel(target);
  target.focus();
}

/** Scroll the editor to a semantic path by walking segments in document order. */
export function jumpStructuredTextToPath(view: EditorView, path: string): boolean {
  const hints = semanticPathToSearchHints(path);
  if (hints.length === 0) return false;

  const doc = view.state.doc.toString();
  let cursor = 0;
  let anchor = -1;
  let head = -1;

  for (const hint of hints) {
    const idx = doc.indexOf(hint, cursor);
    if (idx < 0) return false;
    anchor = idx;
    head = idx + hint.length;
    cursor = head;
  }

  view.dispatch({
    selection: { anchor, head },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}

/** Scroll the editor to the first occurrence of `query` and select it. */
export function jumpStructuredTextToQuery(view: EditorView, query: string): boolean {
  const needle = query.trim();
  if (!needle) return false;
  const doc = view.state.doc.toString();
  const idx = doc.indexOf(needle);
  if (idx < 0) return false;
  view.dispatch({
    selection: { anchor: idx, head: idx + needle.length },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
