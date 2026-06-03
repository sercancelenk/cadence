// @ts-nocheck
import type { MergeView } from '@codemirror/merge';
import { openSearchPanel } from '@codemirror/search';
import type { EditorView } from '@codemirror/view';

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
