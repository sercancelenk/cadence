/**
 * Clipboard serialization for rich-text notes.
 *
 * ProseMirror’s default plain-text copy joins *every* block (heading, list,
 * listItem, nested paragraph) with `\n\n`, so a tight on-screen list pastes
 * into VS Code / WhatsApp / Notes with huge blank gaps. We emit one visual
 * line per textblock (with list markers) and compact HTML margins for apps
 * that prefer `text/html`.
 *
 * Code-only selections copy as plain source in both mime types (no ``` fences,
 * no `<pre>`) so paste inside Cadence becomes paragraphs, not a new codeBlock.
 */

import type { EditorView } from '@tiptap/pm/view';
import { DOMSerializer } from '@tiptap/pm/model';
import type { RichTextDoc } from './richText';

const BLOCK_MARGIN_RESET = 'margin:0;padding-top:0;padding-bottom:0;';

/** Marker so paste skips markdown heuristics for code-only Cadence copies. */
export const CADENCE_PLAIN_CLIPBOARD_MARKER = '<!--cadence-clipboard:plain-->';

function unwrapClipboardNodes(nodes: RichTextDoc[]): RichTextDoc[] {
  if (nodes.length === 1 && nodes[0]?.type === 'doc' && nodes[0].content) {
    return nodes[0].content;
  }
  return nodes;
}

/**
 * True when the slice is only code-block source (selection inside / of code blocks).
 * Mixed selections (paragraph + code, etc.) keep structured HTML.
 */
export function isCodeOnlyClipboardNodes(nodes: RichTextDoc[]): boolean {
  const top = unwrapClipboardNodes(nodes);
  // Single code block only — multi-fence selections keep structured HTML.
  return top.length === 1 && top[0]?.type === 'codeBlock';
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build paste-safe HTML from plain text so TipTap does not recreate a codeBlock
 * from a `<pre>` fragment.
 */
export function plainTextToClipboardHtml(plain: string): string {
  const lines = plain.split('\n');
  const paragraphs = lines
    .map((line) => {
      const body = escapeHtmlText(line);
      return `<p style="${BLOCK_MARGIN_RESET}">${body || '<br>'}</p>`;
    })
    .join('');
  return wrapHtmlForClipboard(
    `${CADENCE_PLAIN_CLIPBOARD_MARKER}<div style="line-height:1.35">${paragraphs}</div>`,
  );
}

function inlinePlainText(node: RichTextDoc): string {
  const parts: string[] = [];

  const walk = (n: RichTextDoc) => {
    if (n.type === 'hardBreak') {
      parts.push('\n');
      return;
    }
    if (n.type === 'dateChip' && n.attrs) {
      const label =
        (typeof n.attrs.label === 'string' && n.attrs.label) ||
        (typeof n.attrs.iso === 'string' ? n.attrs.iso : '');
      if (label) parts.push(label);
      return;
    }
    if (typeof n.text === 'string') {
      parts.push(n.text);
      return;
    }
    n.content?.forEach(walk);
  };

  node.content?.forEach(walk);
  return parts.join('');
}

function cellPlainText(cell: RichTextDoc): string {
  const bits: string[] = [];
  const walk = (n: RichTextDoc) => {
    if (n.type === 'paragraph' || n.type === 'heading') {
      bits.push(inlinePlainText(n));
      return;
    }
    if (typeof n.text === 'string') {
      bits.push(n.text);
      return;
    }
    n.content?.forEach(walk);
  };
  walk(cell);
  return bits.join(' ').trim();
}

function walkListItem(
  item: RichTextDoc,
  marker: string,
  prefix: string,
  lines: string[],
  walkNode: (node: RichTextDoc, prefix: string) => void,
) {
  let firstTextblock = true;
  for (const child of item.content ?? []) {
    if (child.type === 'paragraph' || child.type === 'heading') {
      const lead = firstTextblock ? marker : ' '.repeat(marker.length);
      lines.push(prefix + lead + inlinePlainText(child));
      firstTextblock = false;
      continue;
    }
    if (
      child.type === 'bulletList' ||
      child.type === 'orderedList' ||
      child.type === 'taskList'
    ) {
      walkNode(child, `${prefix}  `);
      continue;
    }
    walkNode(child, `${prefix}  `);
  }
}

export type SerializeClipboardPlainOptions = {
  /**
   * When true, wrap code blocks in ``` fences so markdown paste (if HTML is
   * stripped) can recreate them. Code-only copies keep this false.
   */
  fenceCodeBlocks?: boolean;
};

/**
 * Serialize selected rich nodes to compact plain text (one line per visual row).
 */
export function serializeRichNodesToClipboardPlainText(
  nodes: RichTextDoc[],
  options?: SerializeClipboardPlainOptions,
): string {
  const fenceCodeBlocks = Boolean(options?.fenceCodeBlocks);
  const lines: string[] = [];

  const walk = (node: RichTextDoc, prefix: string) => {
    switch (node.type) {
      case 'doc':
        node.content?.forEach((child) => walk(child, prefix));
        return;
      case 'paragraph':
      case 'heading':
        lines.push(prefix + inlinePlainText(node));
        return;
      case 'bulletList':
        node.content?.forEach((item) => walkListItem(item, '• ', prefix, lines, walk));
        return;
      case 'orderedList': {
        let i = 0;
        node.content?.forEach((item) => {
          i += 1;
          walkListItem(item, `${i}. `, prefix, lines, walk);
        });
        return;
      }
      case 'taskList':
        node.content?.forEach((item) => {
          const checked = Boolean(item.attrs?.checked);
          walkListItem(item, checked ? '☑ ' : '☐ ', prefix, lines, walk);
        });
        return;
      case 'blockquote':
        node.content?.forEach((child) => walk(child, `${prefix}> `));
        return;
      case 'codeBlock': {
        const source = inlinePlainText(node);
        if (fenceCodeBlocks) {
          const lang =
            typeof node.attrs?.language === 'string' && node.attrs.language.trim()
              ? node.attrs.language.trim()
              : '';
          lines.push(`${prefix}\`\`\`${lang}`);
          for (const line of source.split('\n')) {
            lines.push(prefix + line);
          }
          lines.push(`${prefix}\`\`\``);
        } else {
          // Code-only copies: raw source for terminals / VS Code (no fences).
          for (const line of source.split('\n')) {
            lines.push(prefix + line);
          }
        }
        return;
      }
      case 'horizontalRule':
        lines.push(`${prefix}---`);
        return;
      case 'image': {
        const alt =
          typeof node.attrs?.alt === 'string' ? node.attrs.alt.trim() : '';
        lines.push(prefix + (alt ? `[image: ${alt}]` : '[image]'));
        return;
      }
      case 'table':
        node.content?.forEach((row) => {
          if (row.type !== 'tableRow') return;
          const cells = (row.content ?? []).map(cellPlainText);
          lines.push(prefix + cells.join('\t'));
        });
        return;
      default:
        node.content?.forEach((child) => walk(child, prefix));
    }
  };

  for (const node of nodes) walk(node, '');

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * Zero default browser margins on clipboard HTML so Apple Notes / Mail don’t
 * inflate heading/list spacing the way raw `<p>` / `<h1>` defaults do.
 */
export function compactClipboardHtml(fragmentHtml: string): string {
  const withReset = fragmentHtml.replace(
    /<(p|h[1-6]|ul|ol|li|pre|blockquote)(\s[^>]*)?>/gi,
    (full, tag: string, attrs = '') => {
      if (/\sstyle\s*=/i.test(attrs)) {
        return full.replace(/style\s*=\s*(["'])(.*?)\1/i, (_m, q: string, style: string) => {
          if (style.includes('margin:')) return _m;
          return `style=${q}${BLOCK_MARGIN_RESET}${style}${q}`;
        });
      }
      return `<${tag}${attrs} style="${BLOCK_MARGIN_RESET}">`;
    },
  );
  return `<div style="line-height:1.35">${withReset}</div>`;
}

export function wrapHtmlForClipboard(innerHtml: string): string {
  return `<!DOCTYPE html><html><body><!--StartFragment-->${innerHtml}<!--EndFragment--></body></html>`;
}

export type RichClipboardPayload = {
  plain: string;
  html: string;
};

/** Build compact plain + HTML payloads for the current selection. */
export function buildRichClipboardPayload(view: EditorView): RichClipboardPayload | null {
  const { selection } = view.state;
  if (selection.empty) return null;

  const slice = selection.content();
  if (slice.content.size === 0) return null;

  const rawJson = slice.content.toJSON() as RichTextDoc[] | RichTextDoc | null;
  const nodes = Array.isArray(rawJson) ? rawJson : rawJson ? [rawJson] : [];
  const codeOnly = isCodeOnlyClipboardNodes(nodes);
  // Mixed selections: fence code in plain so markdown fallback cannot eat `#` lines.
  const plain = serializeRichNodesToClipboardPlainText(nodes, {
    fenceCodeBlocks: !codeOnly,
  });

  // TipTap prefers text/html on paste. A `<pre>` fragment becomes a codeBlock
  // again — so code-only copies must emit paragraph HTML, not DOMSerializer.
  if (codeOnly) {
    return { plain, html: plainTextToClipboardHtml(plain) };
  }

  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const holder = document.createElement('div');
  holder.appendChild(serializer.serializeFragment(slice.content));
  const html = wrapHtmlForClipboard(compactClipboardHtml(holder.innerHTML));

  return { plain, html };
}

/** Write compact clipboard data; returns false when there is nothing to copy. */
export function writeRichClipboard(
  view: EditorView,
  event: ClipboardEvent,
): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  const payload = buildRichClipboardPayload(view);
  if (!payload) return false;
  data.setData('text/plain', payload.plain);
  data.setData('text/html', payload.html);
  event.preventDefault();
  return true;
}
