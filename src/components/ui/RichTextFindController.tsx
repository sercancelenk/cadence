import { useCallback, useEffect, useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { Command } from 'prosemirror-state';
import { findNext, findPrev, replaceAll, replaceNext, setSearchState } from 'prosemirror-search';
import {
  buildSearchQuery,
  collectRichTextMatches,
  currentRichTextMatchIndex,
} from '../../lib/richTextSearch';
import { FindReplaceBar } from './FindReplaceBar';

/**
 * Stateful bridge between {@link FindReplaceBar} and a tiptap editor's
 * `prosemirror-search` plugin. Owns the query/replace/case state, pushes the
 * query into the editor, and keeps the "N of M" counter aligned with the
 * active match. Replace operations flow through normal editor transactions,
 * so the existing debounce/persist path handles saving with no extra work.
 */
export function RichTextFindController({
  editor,
  editable,
  onClose,
}: {
  editor: Editor;
  editable: boolean;
  onClose: () => void;
}) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);

  const recompute = useCallback(
    (find_: string, replace_: string, caseSensitive_: boolean) => {
      const query = buildSearchQuery(find_, replace_, caseSensitive_);
      const matches = collectRichTextMatches(editor.state, query);
      setMatchCount(matches.length);
      setCurrentIndex(currentRichTextMatchIndex(matches, editor.state.selection.from));
    },
    [editor],
  );

  // Push the query into the editor (highlights + replace target) and refresh
  // counts whenever the query changes.
  useEffect(() => {
    if (editor.isDestroyed) return;
    const query = buildSearchQuery(find, replace, caseSensitive);
    editor.view.dispatch(setSearchState(editor.state.tr, query));
    recompute(find, replace, caseSensitive);
  }, [find, replace, caseSensitive, editor, recompute]);

  // Clear highlights + query when the bar closes.
  useEffect(() => {
    return () => {
      if (editor.isDestroyed) return;
      editor.view.dispatch(setSearchState(editor.state.tr, buildSearchQuery('', '', false)));
    };
  }, [editor]);

  const run = useCallback(
    (command: Command) => {
      if (editor.isDestroyed) return;
      command(editor.state, editor.view.dispatch);
      recompute(find, replace, caseSensitive);
    },
    [editor, recompute, find, replace, caseSensitive],
  );

  return (
    <FindReplaceBar
      find={find}
      replace={replace}
      caseSensitive={caseSensitive}
      replaceOpen={replaceOpen}
      canReplace={editable}
      matchCount={matchCount}
      currentIndex={currentIndex}
      onFindChange={setFind}
      onReplaceChange={setReplace}
      onToggleCase={() => setCaseSensitive((v) => !v)}
      onToggleReplace={() => setReplaceOpen((v) => !v)}
      onNext={() => run(findNext)}
      onPrev={() => run(findPrev)}
      onReplaceOne={() => run(replaceNext)}
      onReplaceAll={() => run(replaceAll)}
      onClose={onClose}
    />
  );
}
