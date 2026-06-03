/**
 * Shared persistence helpers for Notes + Todos rich-text bodies.
 * Keeps `body` / `bodyFormat` / `bodyPlainText` in sync at save boundaries.
 */

import {
  EMPTY_RICH_DOC,
  extractPlainText,
  parseRichDoc,
  serializeRichDoc,
  type RichTextBodyFormat,
  type RichTextDoc,
  type RichTextPayload,
} from './richText';
import { normalizeDocAttachmentsForStorage } from './richTextDocAttachments';
import { resolveRichTextContent } from './richTextImport';

export type RichTextBodyFields = {
  body: string;
  bodyFormat?: RichTextBodyFormat;
  bodyPlainText?: string;
};

export function richTextPayloadToBodyFields(payload: RichTextPayload): RichTextBodyFields {
  const plain = payload.plainText.trim();
  return {
    body: serializeRichDoc(payload.doc),
    bodyFormat: 'prosemirror',
    bodyPlainText: plain || undefined,
  };
}

export function emptyRichBodyFields(): RichTextBodyFields {
  return {
    body: serializeRichDoc(EMPTY_RICH_DOC),
    bodyFormat: 'prosemirror',
    bodyPlainText: undefined,
  };
}

/** Plain text for search, sidebar preview, and AI — never raw ProseMirror JSON. */
export function plainTextFromBodyFields(fields: {
  body?: string;
  bodyFormat?: RichTextBodyFormat;
  bodyPlainText?: string;
}): string {
  if (fields.bodyPlainText?.trim()) return fields.bodyPlainText.trim();

  const raw = fields.body?.trim() ?? '';
  if (!raw) return '';

  // Legacy markdown — return as-is. ProseMirror (explicit or detected JSON doc)
  // always goes through extractPlainText so empty docs don't leak JSON into UI.
  if (fields.bodyFormat !== 'markdown') {
    const doc = parseRichDoc(raw);
    if (doc?.type === 'doc') {
      return extractPlainText(doc).trim();
    }
  }

  return raw;
}

/** Canonical JSON key for comparing stored vs in-editor document (ignores key order). */
export function canonicalDocSignature(
  value: RichTextDoc | string | null | undefined,
  format?: RichTextBodyFormat,
): string {
  const doc = resolveRichTextContent(value ?? '', format);
  return serializeRichDoc(normalizeDocAttachmentsForStorage(doc));
}

function canonicalBodyKey(fields: {
  body?: string;
  bodyFormat?: RichTextBodyFormat;
}): string {
  return canonicalDocSignature(fields.body ?? '', fields.bodyFormat);
}

/** True when a body patch would not change stored content — skip to avoid bumping `updatedAt`. */
export function noteBodyPatchIsNoOp(
  current: { body?: string; bodyFormat?: RichTextBodyFormat; bodyPlainText?: string },
  next: RichTextBodyFields,
): boolean {
  if (
    (current.body ?? '') === (next.body ?? '') &&
    (current.bodyFormat ?? undefined) === (next.bodyFormat ?? undefined) &&
    (current.bodyPlainText ?? undefined) === (next.bodyPlainText ?? undefined)
  ) {
    return true;
  }

  const curPlain = extractPlainText(
    resolveRichTextContent(current.body ?? '', current.bodyFormat),
  ).trim();
  const nextPlain = extractPlainText(resolveRichTextContent(next.body ?? '', next.bodyFormat)).trim();
  if (curPlain !== nextPlain) return false;

  // Same visible text but different JSON (e.g. image/table added) must still persist.
  return canonicalBodyKey(current) === canonicalBodyKey(next);
}

/** Append AI / external plain text to an existing task or note body. */
export function appendPlainTextToBodyFields(
  current: {
    body?: string;
    bodyFormat?: RichTextBodyFormat;
    bodyPlainText?: string;
  },
  appendText: string,
): RichTextBodyFields {
  const incoming = appendText.trim();
  if (!incoming) {
    return {
      body: current.body ?? '',
      bodyFormat: current.bodyFormat,
      bodyPlainText: current.bodyPlainText,
    };
  }

  if (current.bodyFormat === 'prosemirror' && current.body?.trim()) {
    const doc = parseRichDoc(current.body) ?? EMPTY_RICH_DOC;
    const content = [...(doc.content ?? [])];
    if (content.length > 0) {
      content.push({ type: 'horizontalRule' });
    }
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: incoming }],
    });
    const nextDoc: RichTextDoc = { type: 'doc', content };
    const plain = extractPlainText(nextDoc);
    return {
      body: serializeRichDoc(nextDoc),
      bodyFormat: 'prosemirror',
      bodyPlainText: plain || undefined,
    };
  }

  const existing = (current.body ?? '').trim();
  const body = existing ? `${existing}\n\n---\n\n${incoming}` : incoming;
  return {
    body,
    bodyFormat: current.bodyFormat ?? 'markdown',
    bodyPlainText: body,
  };
}

export function parseBodyFormat(raw: unknown): RichTextBodyFormat | undefined {
  return raw === 'markdown' || raw === 'prosemirror' ? raw : undefined;
}

export function backfillBodyPlainText(fields: {
  body: string;
  bodyFormat?: RichTextBodyFormat;
  bodyPlainText?: string;
}): RichTextBodyFields {
  if (fields.bodyPlainText?.trim()) return fields;
  const plain = plainTextFromBodyFields(fields);
  return plain ? { ...fields, bodyPlainText: plain } : fields;
}
