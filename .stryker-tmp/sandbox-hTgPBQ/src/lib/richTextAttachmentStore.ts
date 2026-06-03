// @ts-nocheck
import { STORAGE_PREFIX } from './appBranding';
import {
  attachmentUri,
  createAttachmentId,
  parseAttachmentId,
  type RichTextAttachmentScope,
} from './richTextAttachmentUri';
import { blobToBase64, compressImageForAttachment } from './richTextImagePipeline';

export type StoredRichTextImage = {
  attachmentId: string;
  src: string;
  width: number;
  height: number;
  alt?: string;
};

const IDB_NAME = `${STORAGE_PREFIX}-attachments`;
const IDB_VERSION = 1;
const IDB_STORE = 'blobs';

const blobUrlCache = new Map<string, string>();

function base64ToBlob(b64: string, mimeType: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function hasElectronAttachments(): boolean {
  return typeof window !== 'undefined' && !!window.cadence?.attachmentWrite;
}

function idbOpen(userId: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(`${IDB_NAME}-${userId}`, IDB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed.'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbPut(userId: string, attachmentId: string, blob: Blob): Promise<void> {
  const db = await idbOpen(userId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'));
    tx.objectStore(IDB_STORE).put(blob, attachmentId);
  });
}

async function idbGet(userId: string, attachmentId: string): Promise<Blob | null> {
  const db = await idbOpen(userId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed.'));
    const req = tx.objectStore(IDB_STORE).get(attachmentId);
    req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB read failed.'));
  });
}

async function storeViaElectron(
  userId: string,
  attachmentId: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const dataBase64 = await blobToBase64(blob);
  const r = await window.cadence!.attachmentWrite!({
    attachmentId,
    dataBase64,
    mimeType,
    userId,
  });
  if (!r?.ok) throw new Error(r?.error ?? 'Could not save image attachment.');
}

/**
 * Compress, persist as a sidecar attachment, return stable URI for JSON.
 */
export async function storeRichTextImage(
  input: Blob | File,
  scope: RichTextAttachmentScope,
  userId: string,
  alt?: string,
): Promise<StoredRichTextImage> {
  const compressed = await compressImageForAttachment(input);
  const attachmentId = createAttachmentId(scope.documentKind, scope.documentId);

  if (hasElectronAttachments()) {
    await storeViaElectron(userId, attachmentId, compressed.blob, compressed.mimeType);
  } else {
    await idbPut(userId, attachmentId, compressed.blob);
  }

  return {
    attachmentId,
    src: attachmentUri(attachmentId),
    width: compressed.width,
    height: compressed.height,
    alt: alt?.trim() || undefined,
  };
}

async function loadAttachmentBlob(id: string, userId: string): Promise<Blob | null> {
  try {
    const resp = await fetch(attachmentUri(id));
    if (resp.ok) return await resp.blob();
  } catch {
    /* not in Electron or protocol unavailable */
  }

  // 2) IPC read (older fallback when fetch is blocked).
  if (window.cadence?.attachmentRead) {
    try {
      const r = await window.cadence.attachmentRead({ attachmentId: id });
      if (r?.ok && r.dataBase64) {
        return base64ToBlob(r.dataBase64, r.mimeType ?? 'image/webp');
      }
    } catch {
      /* stale main process — user should restart Electron */
    }
  }

  // 3) Browser / PWA IndexedDB.
  try {
    return await idbGet(userId, id);
  } catch {
    return null;
  }
}

/**
 * Resolve attachment URI for in-editor display.
 * Always returns a `blob:` URL when the sidecar exists.
 */
export async function resolveAttachmentDisplayUrl(
  src: string,
  userId: string,
): Promise<string> {
  const id = parseAttachmentId(src);
  if (!id) return src;

  const cached = blobUrlCache.get(id);
  if (cached) return cached;

  const blob = await loadAttachmentBlob(id, userId);
  if (!blob) return src;
  const prev = blobUrlCache.get(id);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(id, url);
  return url;
}

/** Drop cached blob URLs (call when leaving a screen — not global page unload). */
export function releaseAttachmentBlobUrls(ids?: Iterable<string>): void {
  if (!ids) {
    for (const url of blobUrlCache.values()) URL.revokeObjectURL(url);
    blobUrlCache.clear();
    return;
  }
  for (const id of ids) {
    const url = blobUrlCache.get(id);
    if (url) URL.revokeObjectURL(url);
    blobUrlCache.delete(id);
  }
}

/** @deprecated Prefer releaseAttachmentBlobUrls(ids) from the owning screen. */
export function revokeAttachmentBlobUrls(): void {
  releaseAttachmentBlobUrls();
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp,image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

/**
 * Read an image from the clipboard (macOS screenshot paste = image/png).
 * Must stay synchronous — ProseMirror `handlePaste` cannot await.
 */
export function readClipboardImageFile(clipboardData: DataTransfer | null): Blob | null {
  if (!clipboardData) return null;

  for (const file of clipboardData.files) {
    if (file.type.startsWith('image/') && file.size > 0) return file;
  }

  for (const item of clipboardData.items) {
    if (!item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file instanceof Blob && file.size > 0) return file;
  }

  return null;
}

export async function attachmentExistsLocally(id: string, userId: string): Promise<boolean> {
  const blob = await loadAttachmentBlob(id, userId);
  return !!blob && blob.size > 0;
}

export async function readAttachmentBlobForSync(id: string, userId: string): Promise<Blob | null> {
  return loadAttachmentBlob(id, userId);
}

export async function importAttachmentBlob(
  userId: string,
  attachmentId: string,
  blob: Blob,
  mimeType?: string,
): Promise<void> {
  const type = mimeType || blob.type || 'image/webp';
  if (hasElectronAttachments()) {
    await storeViaElectron(userId, attachmentId, blob, type);
  } else {
    await idbPut(userId, attachmentId, blob);
  }
}
