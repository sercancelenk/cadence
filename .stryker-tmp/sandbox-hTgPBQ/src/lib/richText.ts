/**
 * Rich-text document helpers for the Tiptap / ProseMirror pipeline.
 *
 * Persistence contract (target for Notes + Todos):
 *   - `body` stores `JSON.stringify(doc)` — never HTML.
 *   - `bodyFormat: 'prosemirror'` marks the new shape; absent = legacy markdown.
 *   - `bodyPlainText` is a denormalised search / AI index updated on every save.
 *   - Embedded images use sidecar files + `cadence-attachment://{id}` pointers in JSON
 *     (legacy `data:image/…` in old docs still renders).
 *
 * This module is intentionally free of React / Tiptap imports so unit tests
 * can exercise serialisation without pulling the editor chunk.
 */
// @ts-nocheck


/** Minimal ProseMirror JSON shape — mirrors Tiptap's `JSONContent`. */
export type RichTextDoc = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichTextDoc[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

export type RichTextBodyFormat = 'markdown' | 'prosemirror';

export type RichTextPayload = {
  doc: RichTextDoc;
  plainText: string;
};

/**
 * Performance guardrails for a single note/todo body (plain-text length).
 * Thousands of short notes are fine — cost scales with ONE open document.
 */
export const RICH_TEXT_SOFT_CHAR_LIMIT = 100_000;
export const RICH_TEXT_HARD_CHAR_LIMIT = 250_000;

export function isRichTextOverSoftLimit(plainTextLength: number): boolean {
  return plainTextLength > RICH_TEXT_SOFT_CHAR_LIMIT;
}

export const EMPTY_RICH_DOC: RichTextDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

/** Lab / demo content — checklist + code block + link. */
export const SAMPLE_RICH_DOC: RichTextDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Editor lab sample' }],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Select text and use the toolbar — ' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'always WYSIWYG' },
        { type: 'text', text: ', no Preview tab.' },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: { checked: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Try a checkbox row' }] }],
        },
        {
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Checked item' }] }],
        },
      ],
    },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Inline ' },
        { type: 'text', marks: [{ type: 'code' }], text: 'npm run dev' },
        { type: 'text', text: ' and a ' },
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: 'https://tiptap.dev', target: '_blank' } }],
          text: 'link',
        },
        { type: 'text', text: '.' },
      ],
    },
    {
      type: 'codeBlock',
      attrs: { language: 'text' },
      content: [{ type: 'text', text: 'const answer = 42;' }],
    },
  ],
};

/** Walk a ProseMirror JSON tree and collect plain text (for search / AI). */
export function extractPlainText(doc: RichTextDoc | null | undefined): string {
  if (!doc) return '';
  const chunks: string[] = [];

  const walk = (node: RichTextDoc) => {
    if (node.type === 'dateChip' && node.attrs) {
      const label =
        (typeof node.attrs.label === 'string' && node.attrs.label) ||
        (typeof node.attrs.iso === 'string' ? node.attrs.iso : '');
      if (label) chunks.push(label);
      return;
    }
    if (node.type === 'image' && node.attrs && typeof node.attrs.alt === 'string') {
      const alt = node.attrs.alt.trim();
      if (alt) chunks.push(alt);
      return;
    }
    if (typeof node.text === 'string') {
      chunks.push(node.text);
      return;
    }
    const kids = node.content;
    if (!kids?.length) return;
    for (const child of kids) walk(child);
    if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'listItem') {
      chunks.push('\n');
    }
  };

  walk(doc);
  return chunks
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function serializeRichDoc(doc: RichTextDoc): string {
  return JSON.stringify(doc);
}

export function parseRichDoc(raw: string | null | undefined): RichTextDoc | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as RichTextDoc;
    if (o.type !== 'doc') return null;
    return o;
  } catch {
    return null;
  }
}

export function richPayloadFromDoc(doc: RichTextDoc): RichTextPayload {
  return { doc, plainText: extractPlainText(doc) };
}

/** Typical note/todo body from a pre-rich-editor Cadence install. */
export const SAMPLE_LEGACY_MARKDOWN = `## Legacy markdown note

This is how **existing** notes and todo details are stored today — a plain **markdown string**, not HTML.

- Bullet one
- Bullet two

1. Numbered item
2. Another step

Inline \`code\` and a [Cadence link](https://github.com).

\`\`\`
const legacy = true;
\`\`\`

> Blockquote from an older backup should still render.`;
