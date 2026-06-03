/** Max edge length after downscale — keeps retina screenshots sharp but bounded. */
// @ts-nocheck

export const SCREENSHOT_MAX_DIMENSION = 2560;

/** Target max bytes after compression (WebP/JPEG). */
export const SCREENSHOT_MAX_BYTES = 1_500_000;

export type CompressedImage = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: 'image/webp' | 'image/jpeg';
};

function supportsWebpExport(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL('image/webp', 0.8).startsWith('data:image/webp');
  } catch {
    return false;
  }
}

/**
 * Downscale + compress clipboard screenshots and picked files.
 * Optimised for macOS Cmd+Shift+3/4/5 captures (often PNG, multi‑MB).
 */
export async function compressImageForAttachment(
  input: Blob | File,
  opts?: { maxDimension?: number; maxBytes?: number; quality?: number },
): Promise<CompressedImage> {
  if (!(input instanceof Blob) || input.size === 0) {
    throw new Error('Clipboard image is empty or unreadable. Try copying the screenshot again.');
  }

  const maxDimension = opts?.maxDimension ?? SCREENSHOT_MAX_DIMENSION;
  const maxBytes = opts?.maxBytes ?? SCREENSHOT_MAX_BYTES;
  const quality = opts?.quality ?? 0.82;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(input);
  } catch {
    bitmap = await decodeBlobViaImageElement(input);
  }
  const ratio = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height, 1));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const useWebp = supportsWebpExport(canvas);
  const mimeType: CompressedImage['mimeType'] = useWebp ? 'image/webp' : 'image/jpeg';
  const dataUrl = canvas.toDataURL(mimeType, quality);
  let blob = dataUrlToBlob(dataUrl);

  if (blob.size > maxBytes && quality > 0.55) {
    const tighter = canvas.toDataURL(mimeType, 0.62);
    blob = dataUrlToBlob(tighter);
  }

  if (blob.size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1);
    throw new Error(
      `Image is still too large after compression (${(blob.size / (1024 * 1024)).toFixed(1)} MB). Try a smaller screenshot (max ~${mb} MB).`,
    );
  }

  return { blob, width, height, mimeType };
}

/** Fallback when `createImageBitmap` rejects (older WebKit / odd clipboard blobs). */
async function decodeBlobViaImageElement(input: Blob): Promise<ImageBitmap> {
  const url = URL.createObjectURL(input);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode pasted image.'));
      el.src = url;
    });
    return createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(',');
  const mime = header?.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64 ?? '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image bytes.'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Could not read image bytes.'));
        return;
      }
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
