/**
 * Rich-text (tiptap / ProseMirror) find & replace, built on the official
 * `prosemirror-search` package. The `RichTextSearchExtension` installs the
 * search plugin (highlighting + query state); the helpers below build queries
 * and enumerate matches so the UI can show an "N of M" counter and keep its
 * cursor aligned with the editor selection.
 *
 * Match enumeration is bounded (`MAX_MATCHES`) so a pathological query on a
 * huge document can never lock up the renderer.
 */
import { Extension } from '@tiptap/core';
import type { EditorState } from 'prosemirror-state';
import { search, SearchQuery } from 'prosemirror-search';

export interface RichTextMatch {
  from: number;
  to: number;
}

/** Installs the ProseMirror search plugin. Inert until a query is set. */
export const RichTextSearchExtension = Extension.create({
  name: 'richTextSearch',
  addProseMirrorPlugins() {
    return [search()];
  },
});

/** Build a case-(in)sensitive plain-text search query with a replacement. */
export function buildSearchQuery(find: string, replace: string, caseSensitive: boolean): SearchQuery {
  // `literal: true` keeps the query as a literal string (no \n/\t expansion)
  // and `regexp` stays off — this is a plain find, matching user expectation.
  return new SearchQuery({ search: find, replace, caseSensitive, literal: true });
}

/** Upper bound on enumerated matches — guards against huge-doc pathologies. */
const MAX_MATCHES = 20000;

/** Enumerate every match of `query` in the document, left to right. */
export function collectRichTextMatches(state: EditorState, query: SearchQuery): RichTextMatch[] {
  const out: RichTextMatch[] = [];
  if (!query.valid) return out;
  const end = state.doc.content.size;
  let from = 0;
  for (let i = 0; i < MAX_MATCHES; i += 1) {
    const r = query.findNext(state, from, end);
    if (!r) break;
    out.push({ from: r.from, to: r.to });
    // Advance past this match; guard against zero-width matches looping.
    from = r.to > r.from ? r.to : r.from + 1;
    if (from > end) break;
  }
  return out;
}

/**
 * 1-based index of the match that starts exactly at `selectionFrom`
 * (i.e. the currently-selected match), or 0 when the selection isn't on a
 * match yet.
 */
export function currentRichTextMatchIndex(matches: RichTextMatch[], selectionFrom: number): number {
  for (let i = 0; i < matches.length; i += 1) {
    if (matches[i]!.from === selectionFrom) return i + 1;
  }
  return 0;
}
