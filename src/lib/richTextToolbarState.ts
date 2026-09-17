/**
 * Active-state snapshots for the editor toolbars.
 *
 * The toolbars used to bump React state on every ProseMirror transaction, so
 * every keystroke re-rendered thirty-odd buttons. They now read a snapshot and
 * only re-render when that snapshot actually differs.
 *
 * Both the snapshot and the rendered buttons come from these functions, so the
 * two can never drift: if a button reads something not in the snapshot, it
 * simply would not be in the snapshot's signature either — hence every value
 * the toolbars render lives here.
 */

import type { Editor } from '@tiptap/react';
import { taskTitleFromEditorSelection } from './richTextSelectionTask';

export type RichTextToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  code: boolean;
  paragraph: boolean;
  heading1: boolean;
  heading2: boolean;
  heading3: boolean;
  blockquote: boolean;
  bulletList: boolean;
  orderedList: boolean;
  taskList: boolean;
  codeBlock: boolean;
  mermaidBlock: boolean;
  link: boolean;
  inTable: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

export type RichTextBubbleToolbarState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  highlight: boolean;
  code: boolean;
  link: boolean;
  /** Whether the selection yields a usable “Create task” title. */
  hasTaskTitle: boolean;
};

export function readRichTextToolbarState(editor: Editor): RichTextToolbarState {
  const mermaidBlock = editor.isActive('codeBlock', { language: 'mermaid' });
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    highlight: editor.isActive('highlight'),
    code: editor.isActive('code'),
    paragraph: editor.isActive('paragraph'),
    heading1: editor.isActive('heading', { level: 1 }),
    heading2: editor.isActive('heading', { level: 2 }),
    heading3: editor.isActive('heading', { level: 3 }),
    blockquote: editor.isActive('blockquote'),
    bulletList: editor.isActive('bulletList'),
    orderedList: editor.isActive('orderedList'),
    taskList: editor.isActive('taskList'),
    codeBlock: editor.isActive('codeBlock'),
    mermaidBlock,
    link: editor.isActive('link'),
    inTable: editor.isActive('table'),
    // No `.focus()` in these dry-runs: focusing always reports true, so it adds
    // a command to the probe without changing its answer, and this snapshot is
    // re-read on every transaction.
    canUndo: editor.can().chain().undo().run(),
    canRedo: editor.can().chain().redo().run(),
  };
}

export function readRichTextBubbleToolbarState(editor: Editor): RichTextBubbleToolbarState {
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    highlight: editor.isActive('highlight'),
    code: editor.isActive('code'),
    link: editor.isActive('link'),
    hasTaskTitle: taskTitleFromEditorSelection(editor) !== null,
  };
}

/**
 * Compact key for a snapshot. Comparing keys keeps the change check independent
 * of how many fields a snapshot happens to have.
 */
export function toolbarStateKey(state: Record<string, boolean>): string {
  let key = '';
  for (const flag of Object.values(state)) key += flag ? '1' : '0';
  return key;
}
