import type { ChainedCommands, Editor, Range } from '@tiptap/core';
import type { AiAction } from './ai/entryPoints';
import { createEditorTarget, type AiEditorTarget } from './ai/editorTarget';

export type SlashCommandItem = {
  id: string;
  title: string;
  hint: string;
  keywords: string;
  run: (editor: Editor, range: Range) => void;
};

/**
 * Delete the `/query` range and apply the structural command in one transaction
 * so Undo is a single step and a failed insert cannot leave a blank orphan line.
 */
export function runSlashCommand(
  editor: Editor,
  range: Range,
  build: (chain: ChainedCommands) => ChainedCommands,
): boolean {
  // Menu can stay open across a lock/read-only transition; never mutate then.
  if (!editor.isEditable) return false;
  return build(editor.chain().focus().deleteRange(range)).run();
}

function applyCodeLanguage(chain: ChainedCommands, editor: Editor, language: string): ChainedCommands {
  if (editor.isActive('codeBlock')) {
    return chain.updateAttributes('codeBlock', { language });
  }
  return chain.toggleCodeBlock({ language });
}

/** Slash menu entries — keep in sync with the sticky toolbar affordances. */
export const SLASH_COMMAND_ITEMS: readonly SlashCommandItem[] = [
  {
    id: 'text',
    title: 'Text',
    hint: 'Plain paragraph',
    keywords: 'paragraph body',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.setParagraph());
    },
  },
  {
    id: 'h1',
    title: 'Heading 1',
    hint: 'Large section title',
    keywords: 'h1 title',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleHeading({ level: 1 }));
    },
  },
  {
    id: 'h2',
    title: 'Heading 2',
    hint: 'Subsection',
    keywords: 'h2',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleHeading({ level: 2 }));
    },
  },
  {
    id: 'h3',
    title: 'Heading 3',
    hint: 'Small heading',
    keywords: 'h3',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleHeading({ level: 3 }));
    },
  },
  {
    id: 'bullet',
    title: 'Bullet list',
    hint: 'Unordered list',
    keywords: 'ul list',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleBulletList());
    },
  },
  {
    id: 'numbered',
    title: 'Numbered list',
    hint: 'Ordered list',
    keywords: 'ol numbered',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleOrderedList());
    },
  },
  {
    id: 'task',
    title: 'Checklist',
    hint: 'Task list',
    keywords: 'todo checkbox task',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleTaskList());
    },
  },
  {
    id: 'quote',
    title: 'Quote',
    hint: 'Blockquote',
    keywords: 'blockquote',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.toggleBlockquote());
    },
  },
  {
    id: 'code',
    title: 'Code block',
    hint: 'Fenced code',
    keywords: 'pre fence',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => applyCodeLanguage(chain, editor, 'javascript'));
    },
  },
  {
    id: 'mermaid',
    title: 'Mermaid diagram',
    hint: 'Flowchart / sequence',
    keywords: 'diagram chart',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => applyCodeLanguage(chain, editor, 'mermaid'));
    },
  },
  {
    id: 'table',
    title: 'Table',
    hint: '3×3 with header',
    keywords: 'grid',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) =>
        chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
      );
    },
  },
  {
    id: 'divider',
    title: 'Divider',
    hint: 'Horizontal rule',
    keywords: 'hr rule line',
    run: (editor, range) => {
      runSlashCommand(editor, range, (chain) => chain.setHorizontalRule());
    },
  },
];

/**
 * Slash items that start an AI action. Choosing one removes the `/query` and reports the
 * selection (or the whole note when nothing is selected) to `onAction`; the caller opens
 * the matching dialog. Nothing is changed in the document beyond removing the `/query`.
 */
export function createAiSlashItems(
  actions: readonly AiAction[],
  onAction: (actionId: string, text: string, target: AiEditorTarget) => void,
): SlashCommandItem[] {
  return actions.map((a) => ({
    id: `ai-${a.id}`,
    title: `AI: ${a.label}`,
    hint: a.hint,
    keywords: a.keywords,
    run: (editor, range) => {
      if (!editor.isEditable) return;
      // Read the text first: removing the `/query` changes the selection. Without a selection the
      // whole note is used, minus the typed `/query` itself.
      const { from, to, empty } = editor.state.selection;
      const { doc } = editor.state;
      const selected = empty ? '' : doc.textBetween(from, to, '\n');
      const text = selected.trim()
        ? selected
        : (doc.textBetween(0, range.from, '\n\n') + doc.textBetween(range.to, doc.content.size, '\n\n')).trim();
      runSlashCommand(editor, range, (chain) => chain);
      const after = editor.state.selection;
      onAction(a.id, text, createEditorTarget(editor, { from: after.from, to: after.to }, selected.trim() ? selected : ''));
    },
  }));
}

export function filterSlashCommandItems(
  query: string,
  extra: readonly SlashCommandItem[] = [],
): SlashCommandItem[] {
  const q = query.trim().toLowerCase();
  const all = [...SLASH_COMMAND_ITEMS, ...extra];
  if (!q) return all;
  return all.filter((item) => {
    const hay = `${item.title} ${item.hint} ${item.keywords} ${item.id}`.toLowerCase();
    return hay.includes(q);
  });
}
