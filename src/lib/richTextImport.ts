import MarkdownIt from 'markdown-it';
import markdownItTaskLists from 'markdown-it-task-lists';
import { generateJSON } from '@tiptap/html';
import { createRichTextExtensions } from './richTextEditorExtensions';
import {
  EMPTY_RICH_DOC,
  parseRichDoc,
  type RichTextBodyFormat,
  type RichTextDoc,
} from './richText';

const md = new MarkdownIt('default', {
  html: false,
  linkify: true,
  breaks: true,
})
  .enable(['table', 'strikethrough'])
  .use(markdownItTaskLists, { enabled: true, label: true });

/** Extensions frozen for import — placeholder text doesn't affect parse output. */
const importExtensions = createRichTextExtensions('');

/**
 * Convert legacy Cadence markdown (GFM-style notes / todo bodies) into
 * ProseMirror JSON for the rich editor. HTML is an intermediate step only
 * and is never persisted.
 */
export function markdownToRichDoc(markdown: string): RichTextDoc {
  const trimmed = markdown.trim();
  if (!trimmed) return EMPTY_RICH_DOC;
  const html = md.render(trimmed);
  const doc = generateJSON(html, importExtensions) as RichTextDoc;
  if (doc?.type === 'doc') return doc;
  return EMPTY_RICH_DOC;
}

/**
 * Normalise whatever is on disk into a ProseMirror doc for RichTextEditor.
 *
 *   - `bodyFormat: 'prosemirror'` → parse JSON string
 *   - `bodyFormat: 'markdown'` or **omitted** (legacy default) → markdown import
 *   - Already a RichTextDoc object → use as-is
 *
 * Notes/Todos pass `note.body` + optional `note.bodyFormat`. Legacy rows have
 * no bodyFormat → markdown path. After first edit, persist prosemirror JSON.
 */
export function resolveRichTextContent(
  input: RichTextDoc | string | null | undefined,
  bodyFormat?: RichTextBodyFormat,
): RichTextDoc {
  if (input == null) return EMPTY_RICH_DOC;
  if (typeof input !== 'string') {
    return input.type === 'doc' ? input : EMPTY_RICH_DOC;
  }
  const trimmed = input.trim();
  if (!trimmed) return EMPTY_RICH_DOC;

  if (bodyFormat === 'prosemirror') {
    return parseRichDoc(trimmed) ?? EMPTY_RICH_DOC;
  }

  if (bodyFormat === 'markdown') {
    return markdownToRichDoc(trimmed);
  }

  // Legacy default: try prosemirror JSON first (already migrated), else markdown.
  const asDoc = parseRichDoc(trimmed);
  if (asDoc) return asDoc;
  return markdownToRichDoc(trimmed);
}
