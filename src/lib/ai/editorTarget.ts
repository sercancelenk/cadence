import type { Editor, JSONContent } from '@tiptap/core';

/**
 * The only way an AI dialog touches an open editor. Changes go through the editor's own
 * transactions, so autosave, ⌘Z and the note's version history apply as for any edit, and each
 * call is one undo step. The target remembers the document it was created on: when the note has
 * changed since, it never overwrites text it can no longer find.
 */
export type AiEditorTarget = {
  /** The text the action started on; `''` when it started on the whole note. */
  readonly selectedText: string;
  /** True while the document is unchanged since the action started. */
  isCurrent(): boolean;
  /**
   * Adds blocks. `'after-selection'` puts them after the top-level block that holds the
   * selection; `'end'` after the last block. When the document changed in the meantime, or the
   * editor has no usable position, they go to the end instead of being lost. Returns where they
   * went, or `null` (nothing changed) when the editor is read-only or gone.
   */
  insertBlocks(nodes: JSONContent[], at: 'after-selection' | 'end'): 'after-selection' | 'end' | null;
  /**
   * Replaces the selected text with inline text (`\n` becomes a hard break). Returns `false`
   * and changes nothing unless the document is unchanged, the range still holds the text, and
   * the range holds only text (no images, lists, tables or other content that would be lost).
   */
  replaceSelection(text: string): boolean;
};

export function createEditorTarget(
  editor: Editor,
  range: { from: number; to: number },
  selectedText: string,
): AiEditorTarget {
  const captured = editor.state.doc;
  const isCurrent = () => !editor.isDestroyed && editor.state.doc.eq(captured);

  return {
    selectedText,
    isCurrent,
    insertBlocks(nodes, at) {
      if (editor.isDestroyed || !editor.isEditable || nodes.length === 0) return null;
      const doc = editor.state.doc;
      let pos = doc.content.size;
      let placed: 'after-selection' | 'end' = 'end';
      if (at === 'after-selection' && isCurrent()) {
        const $to = doc.resolve(Math.min(range.to, doc.content.size));
        if ($to.depth >= 1) {
          pos = $to.after(1);
          placed = 'after-selection';
        }
      }
      return editor.chain().focus().insertContentAt(pos, nodes).run() ? placed : null;
    },
    replaceSelection(text) {
      if (!selectedText || !text.trim() || !isCurrent() || !editor.isEditable) return false;
      if (editor.state.doc.textBetween(range.from, range.to, '\n') !== selectedText) return false;
      if (!rangeIsPlainText(editor, range)) return false;
      const content: JSONContent[] = [];
      text.split('\n').forEach((line, i) => {
        if (i > 0) content.push({ type: 'hardBreak' });
        if (line) content.push({ type: 'text', text: line });
      });
      return editor.chain().focus().insertContentAt({ from: range.from, to: range.to }, content).run();
    },
  };
}

/** Only text, paragraphs and line breaks: replacing the range with inline text drops nothing else. */
function rangeIsPlainText(editor: Editor, range: { from: number; to: number }): boolean {
  // Both ends must sit in the same container (the same list item, quote or cell, or the document
  // itself), or replacing the range with inline text would join two of them into one.
  const doc = editor.state.doc;
  const $from = doc.resolve(range.from);
  const $to = doc.resolve(range.to);
  if ($from.depth !== $to.depth) return false;
  if ($from.depth > 0 && $from.start($from.depth - 1) !== $to.start($to.depth - 1)) return false;
  let plain = true;
  editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!plain) return false;
    if (node.isText || node.type.name === 'paragraph' || node.type.name === 'hardBreak') return true;
    if (node.isLeaf) {
      plain = false;
    } else if (pos >= range.from && pos + node.nodeSize <= range.to) {
      // A container (list item, table, quote, …) that the range swallows whole.
      plain = false;
    }
    return plain;
  });
  return plain;
}
