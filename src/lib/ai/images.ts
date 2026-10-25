/**
 * Images the user picks or pastes into an AI dialog. They are sent only with that request, as
 * base64, after the user has seen them (a thumbnail) and pressed the button.
 */

export const AI_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export type AiImageType = (typeof AI_IMAGE_TYPES)[number];

export type AiImage = { mediaType: AiImageType; base64: string };

export const MAX_AI_IMAGES = 4;
export const MAX_AI_IMAGE_BYTES = 5 * 1024 * 1024;
/** All images of one request together; the desktop request body is capped at 8 million characters. */
export const MAX_AI_TOTAL_BYTES = 5 * 1024 * 1024;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Bytes a base64 string stands for. */
function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

export function validateAiImages(images: readonly AiImage[]): { ok: true } | { ok: false; error: string } {
  if (images.length === 0) return { ok: false, error: 'Add an image first.' };
  if (images.length > MAX_AI_IMAGES) return { ok: false, error: `Send at most ${MAX_AI_IMAGES} images at a time.` };
  for (const image of images) {
    if (!(AI_IMAGE_TYPES as readonly string[]).includes(image.mediaType)) {
      return { ok: false, error: 'Use a PNG, JPEG, WebP or GIF image.' };
    }
    if (!image.base64 || !BASE64.test(image.base64)) return { ok: false, error: 'That image could not be read.' };
    if (base64Bytes(image.base64) > MAX_AI_IMAGE_BYTES) {
      return { ok: false, error: `Each image can be at most ${MAX_AI_IMAGE_BYTES / (1024 * 1024)} MB.` };
    }
  }
  const total = images.reduce((sum, i) => sum + base64Bytes(i.base64), 0);
  if (total > MAX_AI_TOTAL_BYTES) {
    return { ok: false, error: `The images together can be at most ${MAX_AI_TOTAL_BYTES / (1024 * 1024)} MB.` };
  }
  return { ok: true };
}

/** Reads a picked or pasted file. Type and size are checked before anything is read. */
export async function fileToAiImage(file: File): Promise<{ ok: true; image: AiImage } | { ok: false; error: string }> {
  if (!(AI_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: 'Use a PNG, JPEG, WebP or GIF image.' };
  }
  if (file.size > MAX_AI_IMAGE_BYTES) {
    return { ok: false, error: `Each image can be at most ${MAX_AI_IMAGE_BYTES / (1024 * 1024)} MB.` };
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  }).catch(() => '');
  const comma = dataUrl.indexOf(',');
  const base64 = comma === -1 ? '' : dataUrl.slice(comma + 1);
  const image: AiImage = { mediaType: file.type as AiImageType, base64 };
  const checked = validateAiImages([image]);
  return checked.ok ? { ok: true, image } : checked;
}
