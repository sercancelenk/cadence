import { attachmentUri, parseAttachmentId } from './richTextAttachmentUri';
import { resolveAttachmentDisplayUrl } from './richTextAttachmentStore';
import { fetchRichTextAttachmentUserId } from './richTextAttachmentUser';

/** Nearest `<img>` inside a rich-text editor surface (Notes, Todos, etc.). */
export function findRichTextEditorImage(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element)) return null;
  const surface = target.closest('.rich-editor__surface');
  if (!surface) return null;
  const img = target.closest('img');
  if (!img || !surface.contains(img)) return null;
  return img;
}

function attachmentIdFromImage(img: HTMLImageElement): string | null {
  const fromAttr = img.getAttribute('data-attachment-id');
  if (fromAttr) return fromAttr;
  return (
    parseAttachmentId(img.getAttribute('src')) ||
    parseAttachmentId(img.currentSrc) ||
    null
  );
}

function isDisplayableImageUrl(src: string): boolean {
  return (
    src.startsWith('blob:') ||
    src.startsWith('data:') ||
    /^https?:\/\//i.test(src)
  );
}

/** Resolve an editor image element to a URL the lightbox can display. */
export async function resolveRichTextImageLightboxSrc(
  img: HTMLImageElement,
  userId: string | undefined,
): Promise<string | null> {
  const uid = await fetchRichTextAttachmentUserId(userId);
  const attachmentId = attachmentIdFromImage(img);

  if (attachmentId) {
    const resolved = await resolveAttachmentDisplayUrl(attachmentUri(attachmentId), uid);
    if (isDisplayableImageUrl(resolved)) return resolved;
  }

  const rawSrc = img.currentSrc || img.getAttribute('src') || '';
  if (isDisplayableImageUrl(rawSrc)) return rawSrc;

  return null;
}

export async function resolveRichTextImageLightboxSrcById(
  attachmentId: string,
  userId: string | undefined,
): Promise<string | null> {
  const uid = await fetchRichTextAttachmentUserId(userId);
  const resolved = await resolveAttachmentDisplayUrl(attachmentUri(attachmentId), uid);
  return isDisplayableImageUrl(resolved) ? resolved : null;
}
