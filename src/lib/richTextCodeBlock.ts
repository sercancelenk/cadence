import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import type { Editor } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { RichTextCodeBlockView } from '../components/ui/RichTextCodeBlockView';
import { richTextLowlight } from './richTextLowlight';

/**
 * Syntax-highlighted code blocks (lowlight) with a React chrome for language
 * selection and Mermaid preview. Replaces StarterKit's default codeBlock.
 *
 * Persisted shape is unchanged: `{ type: 'codeBlock', attrs: { language }, content }`.
 * Mermaid diagrams store source text only — never rendered SVG.
 */
export const RichTextCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(RichTextCodeBlockView);
  },
}).configure({
  lowlight: richTextLowlight,
  defaultLanguage: 'plaintext',
  HTMLAttributes: {
    class: 'rich-editor-codeblock__native',
  },
});

/**
 * Insert or switch a code block language without unwrapping.
 * TipTap's `toggleCodeBlock` exits any active code block — so switching
 * Code ↔ Mermaid via toggle would destroy the fence and risk losing context.
 */
export function applyCodeBlockLanguage(editor: Editor, language: string | null): boolean {
  if (editor.isActive('codeBlock')) {
    return editor
      .chain()
      .focus()
      .updateAttributes('codeBlock', { language })
      .run();
  }
  if (language) {
    return editor.chain().focus().toggleCodeBlock({ language }).run();
  }
  return editor.chain().focus().toggleCodeBlock().run();
}
