import { STORAGE_PREFIX } from './appBranding';
import {
  attachmentUri,
  createAttachmentId,
  parseAttachmentId,
  type RichTextAttachmentScope,
} from './richTextAttachmentUri';
import { blobToBase64, compressImageForAttachment } from './richTextImagePipeline';
import { fetchRichTextAttachmentUserId } from './richTextAttachmentUser';

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

export function electronAttachmentsAvailable(): boolean {
  return hasElectronAttachments();
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
  attachmentId: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const dataBase64 = await blobToBase64(blob);
  const r = await window.cadence!.attachmentWrite!({
    attachmentId,
    dataBase64,
    mimeType,
  });
  if (!r?.ok) throw new Error(r?.error ?? 'Could not save image attachment.');
}

async function mirrorAttachmentToIdb(
  userId: string,
  attachmentId: string,
  blob: Blob,
): Promise<void> {
  const ids = new Set<string>();
  if (userId) ids.add(userId);
  const sessionId = await fetchRichTextAttachmentUserId(userId);
  if (sessionId) ids.add(sessionId);
  for (const uid of ids) {
    try {
      await idbPut(uid, attachmentId, blob);
      return;
    } catch {
      /* try next scope */
    }
  }
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
    await storeViaElectron(attachmentId, compressed.blob, compressed.mimeType);
    await mirrorAttachmentToIdb(userId, attachmentId, compressed.blob);
  } else {
    await idbPut(userId, attachmentId, compressed.blob);
  }

  // Keep an in-memory blob URL so the image renders immediately after paste
  // without a read-after-write round trip (Electron IPC / protocol can lag).
  const prev = blobUrlCache.get(attachmentId);
  if (prev) URL.revokeObjectURL(prev);
  blobUrlCache.set(attachmentId, URL.createObjectURL(compressed.blob));

  return {
    attachmentId,
    src: attachmentUri(attachmentId),
    width: compressed.width,
    height: compressed.height,
    alt: alt?.trim() || undefined,
  };
}

async function loadAttachmentBlob(id: string, userId: string): Promise<Blob | null> {
  // 1) IPC read — uses Electron session uid (no renderer userId needed).
  if (window.cadence?.attachmentRead) {
    try {
      const r = await window.cadence.attachmentRead({ attachmentId: id });
      if (r?.ok && r.dataBase64) {
        return base64ToBlob(r.dataBase64, r.mimeType ?? 'image/webp');
      }
    } catch {
      /* stale main process — fall through */
    }
  }

  // 2) Custom protocol (Electron img + fetch previews).
  try {
    const resp = await fetch(attachmentUri(id));
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob.size > 0) return blob;
    }
  } catch {
    /* not in Electron or protocol unavailable */
  }

  // 3) IndexedDB — try session scope then prop scope (PWA + Electron mirror).
  const idbScopes = new Set<string>();
  if (userId) idbScopes.add(userId);
  const sessionId = await fetchRichTextAttachmentUserId(userId);
  if (sessionId) idbScopes.add(sessionId);
  for (const uid of idbScopes) {
    try {
      const blob = await idbGet(uid, id);
      if (blob?.size) return blob;
    } catch {
      /* try next scope */
    }
  }
  return null;
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
 * Read an image from clipboard or drag-and-drop data transfer.
 * Must stay synchronous — ProseMirror paste/drop handlers cannot await.
 */
export function readDataTransferImageFile(clipboardData: DataTransfer | null): Blob | null {
  if (!clipboardData) return null;

  for (const file of clipboardData.files) {
    if (file.type.startsWith('image/') && file.size > 0) return file;
  }

  for (const item of clipboardData.items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file instanceof Blob && file.size > 0) return file;
  }

  // macOS screenshot paste often ships HTML with a file:// src but no file item.
  const html = clipboardData.getData('text/html') ?? '';
  const dataUrlMatch = html.match(/\bsrc=["'](data:image\/[^"']+)["']/i);
  if (dataUrlMatch?.[1]) {
    try {
      return dataUrlToBlob(dataUrlMatch[1]);
    } catch {
      /* fall through */
    }
  }

  return null;
}

/**
 * Cap the base64 payload we will `atob` from clipboard HTML. base64 inflates
 * bytes by ~4/3, so this bounds the decoded image to roughly 40 MB and prevents
 * a crafted multi-hundred-MB clipboard data: URL from exhausting renderer
 * memory before the compression pipeline's own size guard runs.
 */
const MAX_DATA_URL_BASE64_LENGTH = 56 * 1024 * 1024;

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  if (!b64) throw new Error('Invalid data URL.');
  if (b64.length > MAX_DATA_URL_BASE64_LENGTH) {
    throw new Error('Pasted image is too large.');
  }
  const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** @deprecated Use readDataTransferImageFile */
export function readClipboardImageFile(clipboardData: DataTransfer | null): Blob | null {
  return readDataTransferImageFile(clipboardData);
}

export function dataTransferHasImageFiles(dataTransfer: DataTransfer | null): boolean {
  return readDataTransferImageFile(dataTransfer) !== null;
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
    await storeViaElectron(attachmentId, blob, type);
    await mirrorAttachmentToIdb(userId, attachmentId, blob);
  } else {
    await idbPut(userId, attachmentId, blob);
  }
  const prev = blobUrlCache.get(attachmentId);
  if (prev) URL.revokeObjectURL(prev);
  blobUrlCache.set(attachmentId, URL.createObjectURL(blob));
}
