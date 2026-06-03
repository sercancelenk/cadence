/**
 * Collect attachment ids referenced by ProseMirror bodies in AppData.
 * Used for search, LAN sync, orphan GC (renderer hints), and export manifests.
 */

import type { AppData } from '../model';
import { parseRichDoc } from './richText';
import { collectAttachmentIds } from './richTextDocAttachments';

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

/** All sidecar attachment ids referenced by notes, todos, and the utilities document. */
export function collectReferencedAttachmentIds(data: AppData): string[] {
  const ids = new Set<string>();
  for (const n of data.notes) scanBody(n.body, n.bodyFormat, ids);
  for (const t of data.todoItems) scanBody(t.body, t.bodyFormat, ids);
  if (data.utilityDocument) {
    scanBody(data.utilityDocument.body, data.utilityDocument.bodyFormat, ids);
  }
  return [...ids];
}
