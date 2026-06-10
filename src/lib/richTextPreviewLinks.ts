/** Find the nearest anchor in a rich-text preview surface. */
export function findRichTextPreviewLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

export type RichTextPreviewLinkAction = 'open' | 'copy';

const SAFE_PREVIEW_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Only http(s) and mailto links are opened or copied from note preview. */
export function isSafeRichTextPreviewHref(href: string): boolean {
  try {
    const url = new URL(href);
    return SAFE_PREVIEW_LINK_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/** Modifier-click copies; plain click opens in the system browser. */
export function richTextPreviewLinkAction(event: {
  metaKey: boolean;
  ctrlKey: boolean;
}): RichTextPreviewLinkAction {
  return event.metaKey || event.ctrlKey ? 'copy' : 'open';
}

export async function actOnRichTextPreviewLink(
  href: string,
  action: RichTextPreviewLinkAction,
): Promise<boolean> {
  if (!isSafeRichTextPreviewHref(href)) return false;

  if (action === 'copy') {
    try {
      await navigator.clipboard.writeText(href);
      return true;
    } catch {
      return false;
    }
  }
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}

export async function handleRichTextPreviewLinkClick(
  event: Pick<MouseEvent, 'target' | 'preventDefault' | 'stopPropagation' | 'metaKey' | 'ctrlKey'>,
): Promise<boolean> {
  const anchor = findRichTextPreviewLink(event.target);
  if (!anchor) return false;

  const href = anchor.href;
  if (!href) return false;

  event.preventDefault();
  event.stopPropagation();

  return actOnRichTextPreviewLink(href, richTextPreviewLinkAction(event));
}
