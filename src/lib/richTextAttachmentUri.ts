/**
 * Stable attachment references inside ProseMirror JSON.
 *
 * Persisted shape (never HTML):
 *   src: "cadence-attachment://{attachmentId}"
 *   attachmentId: "{attachmentId}"
 *
 * Legacy / external sources still work:
 *   - data:image/…  (old lab inserts — read-only compat)
 *   - https://…     (remote URL pointer)
 */

export const ATTACHMENT_URI_PREFIX = 'cadence-attachment://';

export function attachmentUri(attachmentId: string): string {
  return `${ATTACHMENT_URI_PREFIX}${attachmentId}`;
}

export function parseAttachmentId(src: string | null | undefined): string | null {
  if (!src) return null;
  if (src.startsWith(ATTACHMENT_URI_PREFIX)) {
    const id = src.slice(ATTACHMENT_URI_PREFIX.length).trim();
    return id && isValidAttachmentId(id) ? id : null;
  }
  return null;
}

/** Safe id for filesystem paths and IPC (8–128 chars). */
export function isValidAttachmentId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{8,128}$/.test(id);
}

export function createAttachmentId(documentKind: string, documentId: string): string {
  const scope = `${documentKind}-${documentId}`
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 48);
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `${scope}-${rand}`;
}

export type RichTextAttachmentScope = {
  documentKind: 'note' | 'todo' | 'lab' | 'utility' | 'item' | 'person';
  documentId: string;
};
