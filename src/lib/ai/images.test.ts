import { describe, expect, it } from 'vitest';
import { fileToAiImage, MAX_AI_IMAGES, MAX_AI_IMAGE_BYTES, validateAiImages, type AiImage } from './images';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR4nGO4IyJCEmIY1TCqYfhqAAACcQQQFwFJQgAAAABJRU5ErkJggg==';
const img = (over: Partial<AiImage> = {}): AiImage => ({ mediaType: 'image/png', base64: PNG_B64, ...over });

describe('validateAiImages', () => {
  it('accepts up to four ordinary images', () => {
    expect(validateAiImages([img()])).toEqual({ ok: true });
    expect(validateAiImages(Array.from({ length: MAX_AI_IMAGES }, () => img()))).toEqual({ ok: true });
  });

  it('refuses none, too many, an unsupported type, empty or non-base64 data', () => {
    expect(validateAiImages([])).toMatchObject({ ok: false });
    expect(validateAiImages(Array.from({ length: MAX_AI_IMAGES + 1 }, () => img()))).toMatchObject({ ok: false, error: expect.stringMatching(/at most 4/i) });
    expect(validateAiImages([img({ mediaType: 'image/svg+xml' as never })])).toMatchObject({ ok: false, error: expect.stringMatching(/PNG|JPEG/i) });
    expect(validateAiImages([img({ base64: '' })])).toMatchObject({ ok: false });
    expect(validateAiImages([img({ base64: 'not base64 !!' })])).toMatchObject({ ok: false });
  });

  it('refuses an image over the size limit', () => {
    const big = 'A'.repeat(Math.ceil((MAX_AI_IMAGE_BYTES * 4) / 3) + 8);
    expect(validateAiImages([img({ base64: big })])).toMatchObject({ ok: false, error: expect.stringMatching(/5 MB/i) });
  });
});

describe('fileToAiImage', () => {
  const file = (bytes: BlobPart[], type: string, name = 'shot.png') => new File(bytes, name, { type });

  it('reads a PNG into base64 with its type', async () => {
    const raw = Uint8Array.from(atob(PNG_B64), (c) => c.charCodeAt(0));
    const r = await fileToAiImage(file([raw], 'image/png'));
    expect(r).toEqual({ ok: true, image: { mediaType: 'image/png', base64: PNG_B64 } });
  });

  it('refuses a file that is not a supported image, before reading it', async () => {
    expect(await fileToAiImage(file(['hello'], 'text/plain', 'a.txt'))).toMatchObject({ ok: false });
    expect(await fileToAiImage(file(['<svg/>'], 'image/svg+xml', 'a.svg'))).toMatchObject({ ok: false });
  });

  it('refuses a file over the size limit', async () => {
    const big = new File([new Uint8Array(MAX_AI_IMAGE_BYTES + 1)], 'big.png', { type: 'image/png' });
    expect(await fileToAiImage(big)).toMatchObject({ ok: false, error: expect.stringMatching(/5 MB/i) });
  });

  it('refuses images whose total size is more than one request can carry', async () => {
    const { validateAiImages, MAX_AI_IMAGE_BYTES } = await import('./images');
    const half = 'A'.repeat(Math.floor(((MAX_AI_IMAGE_BYTES * 0.6) * 4) / 3 / 4) * 4);
    const one = { mediaType: 'image/png' as const, base64: half };
    expect(validateAiImages([one]).ok).toBe(true);
    expect(validateAiImages([one, one])).toMatchObject({ ok: false, error: expect.stringMatching(/together/i) });
  });
});
