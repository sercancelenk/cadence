/** Find the nearest anchor in a rich-text surface. */
export function findRichTextPreviewLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  const anchor = target.closest('a[href]');
  return anchor instanceof HTMLAnchorElement ? anchor : null;
}

export type RichTextPreviewLinkAction = 'open' | 'copy';

const SAFE_PREVIEW_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** Only http(s) and mailto links are opened or copied from note surfaces. */
export function isSafeRichTextPreviewHref(href: string): boolean {
  try {
    const url = new URL(href);
    return SAFE_PREVIEW_LINK_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/**
 * Read-only surface (e.g. version history): plain click opens; modifier copies.
 */
export function richTextPreviewLinkAction(event: {
  metaKey: boolean;
  ctrlKey: boolean;
}): RichTextPreviewLinkAction {
  return event.metaKey || event.ctrlKey ? 'copy' : 'open';
}

/**
 * Editable surface: plain click leaves caret placement to the editor.
 * Modifier opens; modifier+Shift copies (preserves former preview affordances).
 */
export function richTextEditableLinkAction(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
}): RichTextPreviewLinkAction | null {
  if (!(event.metaKey || event.ctrlKey)) return null;
  return event.shiftKey ? 'copy' : 'open';
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

async function handleLinkClick(
  event: Pick<
    MouseEvent,
    'target' | 'preventDefault' | 'stopPropagation' | 'metaKey' | 'ctrlKey' | 'shiftKey'
  >,
  action: RichTextPreviewLinkAction | null,
): Promise<boolean> {
  if (!action) return false;
  const anchor = findRichTextPreviewLink(event.target);
  if (!anchor) return false;

  const href = anchor.href;
  if (!href) return false;

  event.preventDefault();
  event.stopPropagation();

  return actOnRichTextPreviewLink(href, action);
}

export async function handleRichTextPreviewLinkClick(
  event: Pick<
    MouseEvent,
    'target' | 'preventDefault' | 'stopPropagation' | 'metaKey' | 'ctrlKey' | 'shiftKey'
  >,
): Promise<boolean> {
  return handleLinkClick(event, richTextPreviewLinkAction(event));
}

export async function handleRichTextEditableLinkClick(
  event: Pick<
    MouseEvent,
    'target' | 'preventDefault' | 'stopPropagation' | 'metaKey' | 'ctrlKey' | 'shiftKey'
  >,
): Promise<boolean> {
  return handleLinkClick(event, richTextEditableLinkAction(event));
}
