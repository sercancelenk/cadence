// @ts-nocheck
import type { RichTextDoc } from './richText';
import { attachmentUri, parseAttachmentId } from './richTextAttachmentUri';

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
    const attId =
      (typeof node.attrs.attachmentId === 'string' && node.attrs.attachmentId) ||
      parseAttachmentId(String(node.attrs.src ?? ''));
    if (!attId) return node;
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
      const id =
        (typeof node.attrs.attachmentId === 'string' && node.attrs.attachmentId) ||
        parseAttachmentId(String(node.attrs.src ?? ''));
      if (id) ids.add(id);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return [...ids];
}
