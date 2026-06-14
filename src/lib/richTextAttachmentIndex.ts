/**
 * Collect attachment ids referenced by ProseMirror bodies in AppData.
 * Used for search, LAN sync, orphan GC (renderer hints), and export manifests.
 */

import type { AppData } from '../model';
import { parseRichDoc } from './richText';
import { collectAttachmentIds } from './richTextDocAttachments';
import { ATTACHMENT_URI_PREFIX, isValidAttachmentId } from './richTextAttachmentUri';

const MARKDOWN_ATTACHMENT_RE = /cadence-attachment:\/\/([a-zA-Z0-9_-]+)/g;

/**
 * Markdown / legacy bodies store attachments as raw `cadence-attachment://<id>`
 * URIs (inside `![](…)` or inline HTML). The prosemirror scan can't see these,
 * so we scan the text directly. Used only for locked-note ref bookkeeping where
 * the format may be markdown.
 */
function scanMaybeMarkdownBody(body: string | undefined, sink: Set<string>): void {
  if (!body || !body.includes(ATTACHMENT_URI_PREFIX)) return;
  for (const match of body.matchAll(MARKDOWN_ATTACHMENT_RE)) {
    const id = match[1];
    if (id && isValidAttachmentId(id)) sink.add(id);
  }
}

function scanBody(
  body: string | undefined,
  bodyFormat: string | undefined,
  sink: Set<string>,
): void {
  if (bodyFormat !== 'prosemirror' || !body?.trim()) return;
  const doc = parseRichDoc(body);
  if (!doc) return;
  for (const id of collectAttachmentIds(doc)) sink.add(id);
}

/** Attachment ids referenced by a single rich-text body. */
export function attachmentRefsFromBody(
  body: string | undefined,
  bodyFormat: string | undefined,
): string[] {
  const ids = new Set<string>();
  scanBody(body, bodyFormat, ids);
  return [...ids];
}

/**
 * Format-aware attachment refs for locked notes. Prosemirror bodies are scanned
 * structurally; markdown / legacy / unknown-format bodies are scanned for raw
 * attachment URIs (which the prosemirror-only scan misses). This lets the lock
 * flow and the on-unlock backfill record an accurate `attachmentRefs` list for
 * BOTH formats, so orphan GC can safely run without losing a locked note's
 * images.
 */
export function attachmentRefsFromAnyBody(
  body: string | undefined,
  bodyFormat: string | undefined,
): string[] {
  const ids = new Set<string>();
  if (bodyFormat === 'prosemirror') {
    scanBody(body, bodyFormat, ids);
  } else {
    scanMaybeMarkdownBody(body, ids);
  }
  return [...ids];
}

/** All sidecar attachment ids referenced by notes, todos, and the utilities document. */
export function collectReferencedAttachmentIds(data: AppData): string[] {
  const ids = new Set<string>();
  // Defensive against partially-shaped data (e.g. mid-sync snapshots): the
  // collections are optional-iterated so a missing array can never throw and
  // abort attachment bookkeeping.
  for (const n of data.notes ?? []) {
    scanBody(n.body, n.bodyFormat, ids);
    if (Array.isArray(n.attachmentRefs)) {
      for (const id of n.attachmentRefs) ids.add(id);
    }
  }
  for (const t of data.todoItems ?? []) scanBody(t.body, t.bodyFormat, ids);
  if (data.utilityDocument) {
    scanBody(data.utilityDocument.body, data.utilityDocument.bodyFormat, ids);
  }
  return [...ids];
}
