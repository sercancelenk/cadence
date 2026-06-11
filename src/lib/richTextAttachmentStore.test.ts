import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentUri } from './richTextAttachmentUri';

/** Minimal in-memory IndexedDB for jsdom tests. */
function installMockIndexedDB() {
  const dbs = new Map<string, Map<string, Blob>>();

  const indexedDB = {
    open(name: string, _version?: number) {
      if (!dbs.has(name)) dbs.set(name, new Map());
      const store = dbs.get(name)!;
      type MockOpenRequest = {
        result: IDBDatabase | null;
        error: DOMException | null;
        onsuccess: (() => void) | null;
        onerror: (() => void) | null;
        onupgradeneeded: ((ev: { target: MockOpenRequest }) => void) | null;
      };
      const req: MockOpenRequest = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
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

  it('readDataTransferImageFile prefers files over items', () => {
    const file = new File(['x'], 'shot.png', { type: 'image/png' });
    const clipboard = {
      files: [file],
      items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
      getData: () => '',
    } as unknown as DataTransfer;
    return loadStore().then((store) => {
      expect(store.readDataTransferImageFile(clipboard)).toBe(file);
      expect(store.readClipboardImageFile(clipboard)).toBe(file);
      expect(store.dataTransferHasImageFiles(clipboard)).toBe(true);
      expect(store.readDataTransferImageFile(null)).toBeNull();
    });
  });

  it('readDataTransferImageFile extracts embedded data URLs from HTML paste', () => {
    const clipboard = {
      files: [],
      items: [],
      getData: (type: string) =>
        type === 'text/html'
          ? '<img src="data:image/png;base64,iVBORw0KGgo=" />'
          : '',
    } as unknown as DataTransfer;
    return loadStore().then((store) => {
      const blob = store.readDataTransferImageFile(clipboard);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob?.type).toBe('image/png');
    });
  });

  it('storeRichTextImage caches a blob URL for immediate display', async () => {
    vi.doMock('./richTextImagePipeline', () => ({
      compressImageForAttachment: vi.fn().mockResolvedValue({
        blob: new Blob(['webp'], { type: 'image/webp' }),
        width: 10,
        height: 10,
        mimeType: 'image/webp',
      }),
      blobToBase64: vi.fn(),
    }));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no protocol')));
    const store = await loadStore();
    const { attachmentId, src } = await store.storeRichTextImage(
      new Blob(['x'], { type: 'image/png' }),
      { documentKind: 'note', documentId: 'd' },
      userId,
    );
    const url = await store.resolveAttachmentDisplayUrl(src, userId);
    expect(url).toMatch(/^blob:/);
    store.releaseAttachmentBlobUrls([attachmentId]);
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
      expect.objectContaining({ attachmentId, mimeType: 'image/jpeg' }),
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

  it('loads attachment blob via custom protocol fetch when IPC is unavailable', async () => {
    const payload = new Blob(['png-bytes'], { type: 'image/png' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        blob: async () => payload,
      }),
    );
    const store = await loadStore();
    const blob = await store.readAttachmentBlobForSync(attachmentId, userId);
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(payload.size);
  });

  it('dataTransferHasImageFiles is false for empty transfers', async () => {
    const store = await loadStore();
    expect(store.dataTransferHasImageFiles(null)).toBe(false);
    expect(
      store.dataTransferHasImageFiles({
        files: [],
        items: [],
        getData: () => '',
      } as unknown as DataTransfer),
    ).toBe(false);
  });

  it('electronAttachmentsAvailable reflects cadence IPC', async () => {
    const store = await loadStore();
    expect(store.electronAttachmentsAvailable()).toBe(false);
    (window as { cadence?: { attachmentWrite?: ReturnType<typeof vi.fn> } }).cadence = {
      attachmentWrite: vi.fn(),
    };
    expect(store.electronAttachmentsAvailable()).toBe(true);
  });

  it('importAttachmentBlob persists to IndexedDB when Electron is unavailable', async () => {
    vi.doMock('./richTextImagePipeline', () => ({
      compressImageForAttachment: vi.fn(),
      blobToBase64: vi.fn(),
    }));
    const store = await loadStore();
    const blob = new Blob(['local'], { type: 'image/webp' });
    await store.importAttachmentBlob(userId, attachmentId, blob);
    expect(await store.attachmentExistsLocally(attachmentId, userId)).toBe(true);
  });
});
