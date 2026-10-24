/**
 * Text file → rich-text document for "Open file as a new note".
 *
 * HTML is parsed against the editor schema (`generateJSON`), which only emits
 * known node/mark types, so script/style and event handlers never reach the
 * stored document.
 */

import { generateJSON } from '@tiptap/html';
import { EMPTY_RICH_DOC, type RichTextDoc } from './richText';
import { createRichTextExtensions } from './richTextEditorExtensions';
import { markdownToRichDoc } from './richTextImport';

const importExtensions = createRichTextExtensions('');

/** Mirrors `electron/noteFileIo.cjs`; the dialog path is checked there, drops here. */
export const NOTE_IMPORT_EXTENSIONS = ['md', 'markdown', 'txt', 'html', 'htm'] as const;
export const NOTE_IMPORT_MAX_BYTES = 5 * 1024 * 1024;

export function noteImportExtension(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  return (NOTE_IMPORT_EXTENSIONS as readonly string[]).includes(ext) ? ext : null;
}

function plainTextToDoc(text: string): RichTextDoc {
  if (!text.trim()) return EMPTY_RICH_DOC;
  const lines = text.replace(/\n+$/, '').split('\n');
  return {
    type: 'doc',
    content: lines.map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  };
}

function htmlToDoc(html: string): RichTextDoc {
  if (!html.trim()) return EMPTY_RICH_DOC;
  const doc = generateJSON(html, importExtensions) as RichTextDoc;
  return doc?.type === 'doc' ? doc : EMPTY_RICH_DOC;
}

/** @param ext file extension without the dot, any case */
export function importFileToDoc(text: string, ext: string): RichTextDoc {
  switch (ext.toLowerCase()) {
    case 'md':
    case 'markdown':
      return markdownToRichDoc(text);
    case 'html':
    case 'htm':
      return htmlToDoc(text);
    default:
      return plainTextToDoc(text);
  }
}

export function titleFromFileName(fileName: string): string {
  const name = fileName.trim();
  const dot = name.lastIndexOf('.');
  return (dot > 0 ? name.slice(0, dot) : dot === 0 ? '' : name).trim();
}
