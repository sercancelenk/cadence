// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MAX_DIMENSION,
  blobToBase64,
  compressImageForAttachment,
} from './richTextImagePipeline';

function makeCanvasMock(opts: { webp: boolean; blobSize: number; secondBlobSize?: number }) {
  const toDataURL = vi
    .fn()
    .mockReturnValueOnce(`data:image/${opts.webp ? 'webp' : 'jpeg'};base64,${btoa('a'.repeat(opts.blobSize))}`)
    .mockReturnValueOnce(
      `data:image/${opts.webp ? 'webp' : 'jpeg'};base64,${btoa('b'.repeat(opts.secondBlobSize ?? opts.blobSize))}`,
    );

  return {
    width: 0,
    height: 0,
    getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
    toDataURL,
  } as unknown as HTMLCanvasElement;
}

describe('compressImageForAttachment', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({
        width: 4000,
        height: 3000,
        close: vi.fn(),
      }),
    );
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return makeCanvasMock({ webp: true, blobSize: 100 }) as unknown as HTMLElement;
      }
      return document.createElement.bind(document)(tag);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('throws for empty blobs', async () => {
    await expect(compressImageForAttachment(new Blob())).rejects.toThrow(/empty or unreadable/i);
  });

  it('downscales and returns compressed dimensions', async () => {
    const input = new Blob(['png'], { type: 'image/png' });
    const out = await compressImageForAttachment(input, { maxDimension: 1280, maxBytes: 500_000 });
    expect(out.width).toBe(1280);
    expect(out.height).toBe(960);
    expect(out.mimeType).toBe('image/webp');
    expect(out.blob.size).toBeGreaterThan(0);
  });

  it('falls back to jpeg when webp export is unsupported', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = makeCanvasMock({ webp: false, blobSize: 50 });
        (canvas.toDataURL as ReturnType<typeof vi.fn>).mockImplementation((mime: string) => {
          if (mime === 'image/webp') return 'data:image/png;base64,AA';
          return 'data:image/jpeg;base64,' + btoa('jpeg-data');
        });
        return canvas as unknown as HTMLElement;
      }
      return document.createElement.bind(document)(tag);
    });
    const out = await compressImageForAttachment(new Blob(['x'], { type: 'image/png' }), {
      maxBytes: 500_000,
    });
    expect(out.mimeType).toBe('image/jpeg');
  });

  it('retries with lower quality when first pass exceeds maxBytes', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        return makeCanvasMock({ webp: true, blobSize: 2_000_000, secondBlobSize: 100 }) as unknown as HTMLElement;
      }
      return document.createElement.bind(document)(tag);
    });
    const out = await compressImageForAttachment(new Blob(['x'], { type: 'image/png' }), {
      maxBytes: SCREENSHOT_MAX_BYTES,
      maxDimension: SCREENSHOT_MAX_DIMENSION,
      quality: 0.82,
    });
    expect(out.blob.size).toBeLessThanOrEqual(SCREENSHOT_MAX_BYTES);
  });

  it('throws when still too large after quality reduction', async () => {
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'canvas') {
        const canvas = makeCanvasMock({ webp: true, blobSize: 2_000_000, secondBlobSize: 2_000_000 });
        (canvas.toDataURL as ReturnType<typeof vi.fn>).mockImplementation((mime: string, _q?: number) => {
          const payload = 'x'.repeat(2_000_000);
          return `data:${mime};base64,${btoa(payload)}`;
        });
        return canvas as unknown as HTMLElement;
      }
      return document.createElement.bind(document)(tag);
    });
    await expect(
      compressImageForAttachment(new Blob(['x'], { type: 'image/png' }), { maxBytes: 1000 }),
    ).rejects.toThrow(/too large after compression/i);
  });

  it('uses image element decode when createImageBitmap rejects', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('unsupported')));
    const img = {
      onload: null as (() => void) | null,
      onerror: null as (() => void) | null,
      src: '',
    };
    vi.spyOn(globalThis, 'Image').mockImplementation(function ImageMock() {
      queueMicrotask(() => img.onload?.());
      return img as unknown as HTMLImageElement;
    });
    vi.stubGlobal(
      'createImageBitmap',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('unsupported'))
        .mockResolvedValueOnce({ width: 800, height: 600, close: vi.fn() }),
    );
    const out = await compressImageForAttachment(new Blob(['x'], { type: 'image/png' }), {
      maxBytes: 500_000,
    });
    expect(out.width).toBeGreaterThan(0);
  });
});

describe('blobToBase64', () => {
  it('returns base64 payload without data URL prefix', async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_blob: Blob) {
        this.result = 'data:image/png;base64,aGVsbG8=';
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
    const b64 = await blobToBase64(new Blob(['hello']));
    expect(b64).toBe('aGVsbG8=');
    vi.unstubAllGlobals();
  });

  it('rejects non-string reader results', async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(_blob: Blob) {
        this.result = new ArrayBuffer(8);
        this.onload?.();
      }
    }
    vi.stubGlobal('FileReader', MockFileReader);
    await expect(blobToBase64(new Blob(['x']))).rejects.toThrow(/Could not read image bytes/i);
    vi.unstubAllGlobals();
  });
});
