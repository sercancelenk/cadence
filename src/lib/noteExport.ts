/**
 * Note → file text for "Save to computer" (Cmd+S).
 *
 * Images are exported as `[image: alt]` placeholders: attachment URIs only
 * resolve inside Cadence, so a link to them would be a dead reference in the
 * saved file.
 */

import { generateHTML } from '@tiptap/html';
import type { RichTextDoc } from './richText';
import { createRichTextExtensions } from './richTextEditorExtensions';
import { serializeRichNodesToClipboardPlainText } from './richTextClipboard';

export type NoteExportFormat = 'md' | 'txt' | 'html';

export const NOTE_EXPORT_FORMATS: { value: NoteExportFormat; label: string; ext: string }[] = [
  { value: 'md', label: 'Markdown (.md)', ext: 'md' },
  { value: 'txt', label: 'Plain text (.txt)', ext: 'txt' },
  { value: 'html', label: 'HTML (.html)', ext: 'html' },
];

/** Mirrors `PLACEHOLDER_TITLE` in features/notes (lib must not import features). */
const UNTITLED = 'New note';
const MAX_FILE_STEM = 120;

export function parseNoteExportFormat(raw: unknown): NoteExportFormat {
  return raw === 'txt' || raw === 'html' || raw === 'md' ? raw : 'md';
}

export function exportFileName(title: string, format: NoteExportFormat): string {
  const stem = title.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-') || UNTITLED;
  const ext = NOTE_EXPORT_FORMATS.find((f) => f.value === format)?.ext ?? format;
  return `${stem.slice(0, MAX_FILE_STEM)}.${ext}`;
}

function imageToPlaceholder(node: RichTextDoc): RichTextDoc {
  if (node.type === 'image') {
    const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt.trim() : '';
    return {
      type: 'paragraph',
      content: [{ type: 'text', text: alt ? `[image: ${alt}]` : '[image]' }],
    };
  }
  if (!node.content) return node;
  return { ...node, content: node.content.map(imageToPlaceholder) };
}

function escapeMarkdownText(text: string): string {
  return text.replace(/([\\*_`])/g, '\\$1');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownInline(node: RichTextDoc): string {
  if (node.type === 'hardBreak') return '  \n';
  if (node.type === 'dateChip') {
    const label = node.attrs?.label;
    const iso = node.attrs?.iso;
    return typeof label === 'string' && label ? label : typeof iso === 'string' ? iso : '';
  }
  if (typeof node.text !== 'string') return (node.content ?? []).map(markdownInline).join('');

  const marks = new Set((node.marks ?? []).map((m) => m.type));
  let out = marks.has('code') ? `\`${node.text}\`` : escapeMarkdownText(node.text);
  if (marks.has('bold')) out = `**${out}**`;
  if (marks.has('italic')) out = `*${out}*`;
  if (marks.has('strike')) out = `~~${out}~~`;
  const link = node.marks?.find((m) => m.type === 'link');
  const href = link?.attrs?.href;
  if (typeof href === 'string' && href) out = `[${out}](${href})`;
  return out;
}

function inlineChildren(node: RichTextDoc): string {
  return (node.content ?? []).map(markdownInline).join('');
}

function indentContinuation(text: string, width: number): string {
  const pad = ' '.repeat(width);
  return text
    .split('\n')
    .map((line, i) => (i === 0 || line === '' ? line : pad + line))
    .join('\n');
}

function markdownListItem(item: RichTextDoc, marker: string): string {
  const body = (item.content ?? []).map(markdownBlock).filter(Boolean).join('\n');
  return marker + indentContinuation(body, marker.length);
}

function markdownTable(table: RichTextDoc): string {
  const rows = (table.content ?? []).filter((r) => r.type === 'tableRow');
  if (rows.length === 0) return '';
  const cells = rows.map((row) =>
    (row.content ?? []).map((cell) =>
      (cell.content ?? [])
        .map((b) => inlineChildren(b))
        .join(' ')
        .replace(/\|/g, '\\|')
        .trim(),
    ),
  );
  const width = Math.max(...cells.map((r) => r.length), 1);
  const line = (r: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  const separator = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  return [line(cells[0]!), separator, ...cells.slice(1).map(line)].join('\n');
}

function markdownBlock(node: RichTextDoc): string {
  switch (node.type) {
    case 'paragraph':
      return inlineChildren(node);
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `${'#'.repeat(level)} ${inlineChildren(node)}`;
    }
    case 'bulletList':
      return (node.content ?? []).map((i) => markdownListItem(i, '- ')).join('\n');
    case 'orderedList':
      return (node.content ?? []).map((i, n) => markdownListItem(i, `${n + 1}. `)).join('\n');
    case 'taskList':
      return (node.content ?? [])
        .map((i) => markdownListItem(i, i.attrs?.checked ? '- [x] ' : '- [ ] '))
        .join('\n');
    case 'blockquote':
      return (node.content ?? [])
        .map(markdownBlock)
        .join('\n\n')
        .split('\n')
        .map((l) => (l ? `> ${l}` : '>'))
        .join('\n');
    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language.trim() : '';
      const source = (node.content ?? []).map((c) => c.text ?? '').join('');
      return `\`\`\`${lang}\n${source}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'table':
      return markdownTable(node);
    default:
      return node.content?.length ? node.content.map(markdownBlock).join('\n\n') : inlineChildren(node);
  }
}

function resolvedTitle(title: string): string {
  return title.trim() || UNTITLED;
}

export function exportNoteContent(
  doc: RichTextDoc,
  title: string,
  format: NoteExportFormat,
): string {
  const safeDoc = imageToPlaceholder(doc);
  const heading = resolvedTitle(title);

  if (format === 'txt') {
    const body = serializeRichNodesToClipboardPlainText([safeDoc]);
    return body ? `${heading}\n\n${body}\n` : `${heading}\n`;
  }

  if (format === 'html') {
    const body = generateHTML(safeDoc, createRichTextExtensions(''));
    return [
      '<!DOCTYPE html>',
      '<html><head><meta charset="utf-8">',
      `<title>${escapeHtml(heading)}</title></head>`,
      `<body><h1>${escapeHtml(heading)}</h1>`,
      body,
      '</body></html>',
      '',
    ].join('\n');
  }

  const blocks = (safeDoc.content ?? []).map(markdownBlock).filter((b) => b !== '');
  return `${['# ' + heading, ...blocks].join('\n\n')}\n`;
}
