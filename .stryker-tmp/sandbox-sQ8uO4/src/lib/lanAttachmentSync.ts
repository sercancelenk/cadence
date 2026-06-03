/**
 * Bidirectional LAN sync for rich-text image sidecars.
 * Runs after a successful JSON snapshot push/pull when paired with a LAN host.
 */
// @ts-nocheck


import type { AppData } from '../model';
import { collectReferencedAttachmentIds } from './richTextAttachmentIndex';
import {
  downloadAttachment,
  fetchAttachmentManifest,
  loadPair,
  uploadAttachment,
} from './lanSyncClient';
import {
  attachmentExistsLocally,
  importAttachmentBlob,
  readAttachmentBlobForSync,
} from './richTextAttachmentStore';

/**
 * Push missing referenced attachments to the host and pull any the local
 * workspace references but does not yet have on disk / in IndexedDB.
 */
export async function syncLanAttachments(localData: AppData, userId: string): Promise<void> {
  const pair = loadPair();
  if (!pair || !userId) return;

  const referenced = collectReferencedAttachmentIds(localData);
  if (referenced.length === 0) return;

  const remoteIds = new Set(await fetchAttachmentManifest(pair.url, pair.token));

  for (const id of referenced) {
    if (remoteIds.has(id)) continue;
    const blob = await readAttachmentBlobForSync(id, userId);
    if (!blob) continue;
    const ok = await uploadAttachment(pair.url, pair.token, id, blob);
    if (ok) remoteIds.add(id);
  }

  for (const id of referenced) {
    if (await attachmentExistsLocally(id, userId)) continue;
    if (!remoteIds.has(id)) continue;
    const blob = await downloadAttachment(pair.url, pair.token, id);
    if (blob) await importAttachmentBlob(userId, id, blob);
  }
}
