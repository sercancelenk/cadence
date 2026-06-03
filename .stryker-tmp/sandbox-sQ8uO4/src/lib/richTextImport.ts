// @ts-nocheck
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

/** Map markdown-it-task-lists HTML to Tiptap taskList / taskItem nodes. */
function upgradeTaskListHtml(html: string): string {
  return html.replace(
    /<ul class="contains-task-list">([\s\S]*?)<\/ul>/gi,
    (_match, body: string) => {
      const items = body.replace(
        /<li class="task-list-item">([\s\S]*?)<\/li>/gi,
        (_li, content: string) => {
          const checked = /<input[^>]*\bchecked\b/i.test(content);
          const inner = content.replace(/<input[^>]*>/i, '').trim();
          return `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}">${inner}</li>`;
        },
      );
      return `<ul data-type="taskList">${items}</ul>`;
    },
  );
}

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
  const html = upgradeTaskListHtml(md.render(trimmed));
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
