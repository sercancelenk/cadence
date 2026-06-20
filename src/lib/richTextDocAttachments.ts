import type { RichTextDoc } from './richText';
import { attachmentUri, isValidAttachmentId, parseAttachmentId } from './richTextAttachmentUri';

/** A valid attachment id from the node's `attachmentId` attr, else null. */
function validAttachmentIdAttr(attrs: Record<string, unknown>): string | null {
  const raw = typeof attrs.attachmentId === 'string' ? attrs.attachmentId : '';
  return raw && isValidAttachmentId(raw) ? raw : null;
}

type ImageNode = RichTextDoc & {
  attrs?: Record<string, unknown>;
};

function mapDoc(doc: RichTextDoc, fn: (node: RichTextDoc) => RichTextDoc): RichTextDoc {
  const next = fn(doc);
  if (!next.content?.length) return next;
  return {
    ...next,
    content: next.content.map((child) => mapDoc(child, fn)),
  };
}

/**
 * Before persisting: ensure attachment images use canonical cadence-attachment://
 * URIs (never transient blob: URLs from browser hydration).
 */
export function normalizeDocAttachmentsForStorage(doc: RichTextDoc): RichTextDoc {
  return mapDoc(doc, (node) => {
    if (node.type !== 'image' || !node.attrs) return node;
    const attId = validAttachmentIdAttr(node.attrs) ?? parseAttachmentId(String(node.attrs.src ?? ''));
    if (!attId) {
      // No VALID attachment id. If an invalid attachmentId attr is present,
      // strip it so it can never be persisted as a broken `cadence-attachment://`
      // pointer or pollute orphan-GC ref collection. Legacy data:/https images
      // (which legitimately have no attachmentId) are left untouched.
      if (typeof node.attrs.attachmentId === 'string' && node.attrs.attachmentId) {
        const { attachmentId: _drop, ...restAttrs } = node.attrs;
        return { ...node, attrs: restAttrs } as ImageNode;
      }
      return node;
    }
    return {
      ...node,
      attrs: {
        ...node.attrs,
        attachmentId: attId,
        src: attachmentUri(attId),
      },
    } as ImageNode;
  });
}

/** Collect attachment ids referenced by a document (for future GC / export). */
export function collectAttachmentIds(doc: RichTextDoc): string[] {
  const ids = new Set<string>();
  const walk = (node: RichTextDoc) => {
    if (node.type === 'image' && node.attrs) {
      const id = validAttachmentIdAttr(node.attrs) ?? parseAttachmentId(String(node.attrs.src ?? ''));
      if (id) ids.add(id);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}
