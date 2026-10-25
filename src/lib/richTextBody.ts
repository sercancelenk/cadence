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

/**
 * Canonical signature of the empty document.
 *
 * A module-level constant rather than a call per comparison: it is the same
 * string every time, and the emptiness check runs on every editor flush.
 */
const EMPTY_DOC_SIGNATURE = canonicalDocSignature(EMPTY_RICH_DOC, 'prosemirror');

/**
 * Canonical body string for persistence.
 *
 * Always derived from `doc`. `payload.docSignature` is a flush-side hint the
 * editor uses to skip no-op compares; it is not a source of truth. Trusting it
 * here would let a stale or hand-built signature persist empty ProseMirror
 * JSON (or any other stand-in) while `doc` still holds the user's text.
 */
function payloadSignature(payload: RichTextPayload): string {
  return canonicalDocSignature(payload.doc, 'prosemirror');
}

/** Whether this payload's document has no structural content. */
function payloadIsEmptyDoc(payload: RichTextPayload): boolean {
  return payloadSignature(payload) === EMPTY_DOC_SIGNATURE;
}

export function richTextPayloadToBodyFields(payload: RichTextPayload): RichTextBodyFields {
  const plain = payload.plainText.trim();
  return {
    body: payloadSignature(payload),
    bodyFormat: 'prosemirror',
    bodyPlainText: plain || undefined,
  };
}

/** True when the doc is structurally empty (no images, tables, or text). */
export function richTextPayloadIsEmpty(payload: RichTextPayload): boolean {
  return payloadIsEmptyDoc(payload);
}

/** True when persisted body fields have no structural content (image-only counts). */
export function richBodyFieldsIsEmpty(fields: RichTextBodyFields): boolean {
  const raw = fields.body?.trim() ?? '';
  if (!raw) return true;
  return canonicalDocSignature(raw, fields.bodyFormat) === EMPTY_DOC_SIGNATURE;
}

/**
 * Map editor payload → persisted body fields.
 * Image-only / table-only docs have empty plainText but must still save.
 */
export function richBodyFieldsFromPayload(payload: RichTextPayload): RichTextBodyFields {
  if (payloadIsEmptyDoc(payload)) {
    return { body: '', bodyFormat: undefined, bodyPlainText: undefined };
  }
  const plain = payload.plainText.trim();
  return { body: payloadSignature(payload), bodyFormat: 'prosemirror', bodyPlainText: plain || undefined };
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

/** Canonical JSON for display — repairs blob/src drift and normalizes attachment URIs. */
export function prepareStoredRichBodyForDisplay(
  body: string,
  bodyFormat?: RichTextBodyFormat,
): string {
  if (bodyFormat !== 'prosemirror' || !body.trim()) return body;
  const doc = resolveRichTextContent(body, 'prosemirror');
  return serializeRichDoc(normalizeDocAttachmentsForStorage(doc));
}

/** Canonical JSON for revision persistence — never store transient blob: image src. */
export function prepareStoredRichBodyForRevision(
  body: string,
  bodyFormat?: RichTextBodyFormat,
): string {
  return prepareStoredRichBodyForDisplay(body, bodyFormat);
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

/**
 * True when a body patch would not change stored content — skip to avoid
 * bumping `updatedAt`.
 *
 * Compares canonical forms rather than raw strings, so a legacy markdown body
 * and its ProseMirror equivalent count as unchanged, while the same visible
 * text with a new image or table does not.
 *
 * `nextBodyIsCanonical` lets the editor path say "this body already is the
 * canonical serialization" (which `richBodyFieldsFromPayload` guarantees) and
 * skip one parse + normalize + serialize of the open document.
 */
export function noteBodyPatchIsNoOp(
  current: { body?: string; bodyFormat?: RichTextBodyFormat; bodyPlainText?: string },
  next: RichTextBodyFields,
  { nextBodyIsCanonical = false }: { nextBodyIsCanonical?: boolean } = {},
): boolean {
  if (
    (current.body ?? '') === (next.body ?? '') &&
    (current.bodyFormat ?? undefined) === (next.bodyFormat ?? undefined) &&
    (current.bodyPlainText ?? undefined) === (next.bodyPlainText ?? undefined)
  ) {
    return true;
  }

  const nextKey =
    nextBodyIsCanonical && next.bodyFormat === 'prosemirror'
      ? (next.body ?? '')
      : canonicalBodyKey(next);
  return canonicalBodyKey(current) === nextKey;
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

  const readable = current.bodyFormat === 'prosemirror' && current.body?.trim() ? parseRichDoc(current.body) : null;
  if (readable) {
    const doc = readable;
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
  // A body flagged ProseMirror that cannot be read stays as the text it is; the flag would hide it.
  const format = current.bodyFormat === 'prosemirror' ? 'markdown' : (current.bodyFormat ?? 'markdown');
  return {
    body,
    bodyFormat: format,
    bodyPlainText: body,
  };
}

/**
 * Append a checklist of steps to a task body without touching what is already there.
 * ProseMirror bodies (and empty ones) gain a "Steps" label and a task list; Markdown and
 * plain bodies gain a `- [ ]` list in their own format.
 */
export function appendChecklistToBodyFields(
  current: {
    body?: string;
    bodyFormat?: RichTextBodyFormat;
    bodyPlainText?: string;
  },
  steps: string[],
): RichTextBodyFields {
  const items = steps.map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) {
    return { body: current.body ?? '', bodyFormat: current.bodyFormat, bodyPlainText: current.bodyPlainText };
  }
  const existing = (current.body ?? '').trim();

  // A body that holds a ProseMirror document is a document whatever its format flag says (legacy
  // bodies have no flag), the same detection the readers use. Anything else is kept as text.
  const asDoc = existing && current.bodyFormat !== 'markdown' ? parseRichDoc(current.body ?? '') : null;
  if (!existing || asDoc) {
    const doc = asDoc ?? EMPTY_RICH_DOC;
    const content = [...(doc.content ?? [])];
    // A document that only holds an empty paragraph is "empty": the checklist replaces it.
    const hasContent = content.some((n) => n.type !== 'paragraph' || (n.content ?? []).length > 0);
    const kept = hasContent ? content : [];
    if (kept.length > 0) {
      kept.push({ type: 'paragraph', content: [{ type: 'text', text: 'Steps', marks: [{ type: 'bold' }] }] });
    }
    kept.push({
      type: 'taskList',
      content: items.map((text) => ({
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    });
    const nextDoc: RichTextDoc = { type: 'doc', content: kept };
    return {
      body: serializeRichDoc(nextDoc),
      bodyFormat: 'prosemirror',
      bodyPlainText: extractPlainText(nextDoc) || undefined,
    };
  }

  const body = `${existing}\n\n${items.map((s) => `- [ ] ${s}`).join('\n')}`;
  // A body flagged ProseMirror that cannot be read stays as the text it is; the flag would hide it.
  const format = current.bodyFormat === 'prosemirror' ? 'markdown' : (current.bodyFormat ?? 'markdown');
  return { body, bodyFormat: format, bodyPlainText: body };
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
