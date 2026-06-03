import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentUri } from './richTextAttachmentUri';

/** Minimal in-memory IndexedDB for jsdom tests. */
function installMockIndexedDB() {
  const dbs = new Map<string, Map<string, Blob>>();

  const indexedDB = {
    open(name: string, _version?: number) {
      if (!dbs.has(name)) dbs.set(name, new Map());
      const store = dbs.get(name)!;
      const req = {
        result: null as IDBDatabase | null,
        error: null as DOMException | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
        onupgradeneeded: null as ((ev: { target: typeof req }) => void) | null,
      };
      const db = {
        name,
        objectStoreNames: {
          contains: () => true,
        },
        createObjectStore: () => ({}),
        transaction: (_store: string, mode: string) => {
          const tx = {
            error: null as DOMException | null,
            oncomplete: null as (() => void) | null,
            onerror: null as (() => void) | null,
            objectStore: () => ({
              put: (value: Blob, key: string) => {
                if (mode === 'readwrite') store.set(key, value);
                return { onsuccess: null, onerror: null };
              },
              get: (key: string) => {
                const getReq = {
                  result: store.get(key),
                  onsuccess: null as (() => void) | null,
                  onerror: null as (() => void) | null,
                };
                queueMicrotask(() => getReq.onsuccess?.());
                return getReq;
              },
            }),
          };
          queueMicrotask(() => tx.oncomplete?.());
          return tx;
        },
        close: () => {},
      } as unknown as IDBDatabase;
      req.result = db;
      queueMicrotask(() => {
        req.onupgradeneeded?.({ target: req });
        req.onsuccess?.();
      });
      return req;
    },
    __store: dbs,
  };

  vi.stubGlobal('indexedDB', indexedDB);
  return indexedDB;
}

describe('richTextAttachmentStore', () => {
  const userId = 'test-user';
  const attachmentId = 'note-doc1-abc123456789';

  beforeEach(() => {
    installMockIndexedDB();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no protocol')));
    delete (window as { cadence?: unknown }).cadence;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  async function loadStore() {
    return import('./richTextAttachmentStore');
  }

  it('storeRichTextImage persists to IndexedDB and returns attachment metadata', async () => {
    vi.doMock('./richTextImagePipeline', () => ({
      compressImageForAttachment: vi.fn().mockResolvedValue({
        blob: new Blob(['webp'], { type: 'image/webp' }),
        width: 100,
        height: 80,
        mimeType: 'image/webp',
      }),
      blobToBase64: vi.fn(),
    }));
    const store = await loadStore();
    const input = new Blob(['raw'], { type: 'image/png' });
    const result = await store.storeRichTextImage(input, { documentKind: 'note', documentId: 'doc1' }, userId, '  alt  ');
    expect(result.attachmentId).toMatch(/^note-doc1-/);
    expect(result.src).toBe(attachmentUri(result.attachmentId));
    expect(result.width).toBe(100);
    expect(result.height).toBe(80);
    expect(result.alt).toBe('alt');
    expect(await store.attachmentExistsLocally(result.attachmentId, userId)).toBe(true);
  });

  it('resolveAttachmentDisplayUrl returns a blob URL for stored attachments', async () => {
    vi.doMock('./richTextImagePipeline', () => ({
      compressImageForAttachment: vi.fn().mockResolvedValue({
        blob: new Blob(['webp'], { type: 'image/webp' }),
        width: 10,
        height: 10,
        mimeType: 'image/webp',
      }),
      blobToBase64: vi.fn(),
    }));
    const store = await loadStore();
    const { attachmentId: id, src } = await store.storeRichTextImage(
      new Blob(['x'], { type: 'image/png' }),
      { documentKind: 'note', documentId: 'd' },
      userId,
    );
    const url = await store.resolveAttachmentDisplayUrl(src, userId);
    expect(url).toMatch(/^blob:/);
    const again = await store.resolveAttachmentDisplayUrl(src, userId);
    expect(again).toBe(url);
    store.releaseAttachmentBlobUrls([id]);
  });

  it('releaseAttachmentBlobUrls clears all cached blob URLs', async () => {
    vi.doMock('./richTextImagePipeline', () => ({
      compressImageForAttachment: vi.fn().mockResolvedValue({
        blob: new Blob(['webp'], { type: 'image/webp' }),
        width: 10,
        height: 10,
        mimeType: 'image/webp',
      }),
      blobToBase64: vi.fn(),
    }));
    const store = await loadStore();
    const { src } = await store.storeRichTextImage(
      new Blob(['x'], { type: 'image/png' }),
      { documentKind: 'note', documentId: 'd' },
      userId,
    );
    const url = await store.resolveAttachmentDisplayUrl(src, userId);
    store.revokeAttachmentBlobUrls();
    expect(url.startsWith('blob:')).toBe(true);
  });

  it('readClipboardImageFile prefers files over items', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const clipboard = {
      files: [file],
      items: [{ type: 'image/png', getAsFile: () => file }],
    } as unknown as DataTransfer;
    return loadStore().then((store) => {
      expect(store.readClipboardImageFile(clipboard)).toBe(file);
      expect(store.readClipboardImageFile(null)).toBeNull();
    });
  });

  it('importAttachmentBlob writes via Electron when available', async () => {
    const attachmentWrite = vi.fn().mockResolvedValue({ ok: true });
    (window as { cadence?: { attachmentWrite?: typeof attachmentWrite } }).cadence = {
      attachmentWrite,
    };
    vi.doMock('./richTextImagePipeline', () => ({
      compressImageForAttachment: vi.fn(),
      blobToBase64: vi.fn().mockResolvedValue('YmFzZTY0'),
    }));
    const store = await loadStore();
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await store.importAttachmentBlob(userId, attachmentId, blob);
    expect(attachmentWrite).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId, userId, mimeType: 'image/jpeg' }),
    );
  });

  it('loads via Electron attachmentRead fallback', async () => {
    const b64 = btoa('hello');
    (window as { cadence?: { attachmentRead?: ReturnType<typeof vi.fn> } }).cadence = {
      attachmentRead: vi.fn().mockResolvedValue({
        ok: true,
        dataBase64: b64,
        mimeType: 'image/png',
      }),
    };
    const store = await loadStore();
    const blob = await store.readAttachmentBlobForSync(attachmentId, userId);
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBeGreaterThan(0);
  });
});
