import type { Editor } from '@tiptap/core';
import type { RichTextDoc } from './richText';
import { markdownToRichDoc } from './richTextImport';

/** Block-level markdown syntax at line start (multiline flag). */
const MD_BLOCK_LINE =
  /^(?:#{1,6}\s+\S|>\s+\S|(?:\d+\.|[-*+])\s+\S|-\s+\[[ xX]\]\s|```|\|.+\|.*\||(?:\*{3}|-{3}|_{3})\s*$)/m;

const MD_INLINE =
  /(?:\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]]+\]\([^)]+\))/;

/** Rich HTML from Word/Docs/browsers — prefer native paste over markdown re-parse. */
const SEMANTIC_RICH_HTML =
  // Include <pre>: mixed Cadence copies keep code in <pre> while plain drops ```
  // fences — without this, markdown paste turns `# comment` into headings.
  /<(?:h[1-6]|ul|ol|table|blockquote|pre)\b[^>]*>/i;

const STYLED_RICH_HTML =
  /<(?:strong|em|b\b|i\b)\b[^>]*>/i;

/**
 * Heuristic: pasted plain text looks like markdown source (GFM-style), not
 * arbitrary prose. Intentionally conservative on single-line pastes.
 */
export function looksLikeMarkdown(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (MD_BLOCK_LINE.test(trimmed)) return true;

  const lines = trimmed.split('\n');
  if (lines.length >= 2 && MD_INLINE.test(trimmed)) return true;

  if (lines.length === 1 && MD_INLINE.test(trimmed) && /[#*`>\[\]|~]/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Clipboard HTML that already carries document structure from a rich editor.
 * Syntax-highlighter wrappers (e.g. VS Code copying a .md file) are ignored.
 */
export function hasSemanticRichHtml(html: string): boolean {
  const trimmed = html.trim();
  if (!trimmed) return false;
  if (SEMANTIC_RICH_HTML.test(trimmed)) return true;
  if (STYLED_RICH_HTML.test(trimmed)) return true;
  return false;
}

/** Cadence code-only copy marker — must not be re-parsed as markdown. */
const CADENCE_PLAIN_CLIPBOARD_RE = /<!--\s*cadence-clipboard\s*:\s*plain\s*-->/i;

export function isCadencePlainClipboardHtml(html: string): boolean {
  return CADENCE_PLAIN_CLIPBOARD_RE.test(html);
}

/** True when clipboard plain text should be parsed as markdown on paste. */
export function shouldPasteClipboardAsMarkdown(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const plain = dataTransfer.getData('text/plain');
  if (!plain.trim()) return false;
  const html = dataTransfer.getData('text/html') ?? '';
  // Code-only Cadence copies intentionally use <p> HTML; never markdown-parse them.
  if (isCadencePlainClipboardHtml(html)) return false;
  if (hasSemanticRichHtml(html)) return false;
  return looksLikeMarkdown(plain);
}

/** Convert pasted markdown into ProseMirror nodes for `insertContent`. */
export function markdownPasteContent(markdown: string): RichTextDoc['content'] | null {
  const doc = markdownToRichDoc(markdown);
  const content = doc.content;
  if (!content?.length) return null;
  const onlyEmptyParagraph =
    content.length === 1 &&
    content[0]?.type === 'paragraph' &&
    !content[0].content?.length;
  if (onlyEmptyParagraph) return null;
  return content;
}

/**
 * Insert markdown at the current selection (replacing any selected text).
 * Returns false when insert fails so callers can fall back to native paste.
 * Leaves the editor focused with the caret after the inserted content.
 */
export function insertMarkdownPaste(editor: Editor, markdown: string): boolean {
  const nodes = markdownPasteContent(markdown);
  if (!nodes?.length) return false;
  return editor.chain().focus().insertContent(nodes).scrollIntoView().run();
}
