import { describe, expect, it, vi } from 'vitest';
import {
  actOnRichTextPreviewLink,
  findRichTextPreviewLink,
  handleRichTextPreviewLinkClick,
  isSafeRichTextPreviewHref,
  richTextPreviewLinkAction,
} from './richTextPreviewLinks';

describe('richTextPreviewLinks', () => {
  it('finds anchor from nested click target', () => {
    const root = document.createElement('div');
    const anchor = document.createElement('a');
    anchor.href = 'https://example.com';
    const span = document.createElement('span');
    span.textContent = 'link';
    anchor.appendChild(span);
    root.appendChild(anchor);

    expect(findRichTextPreviewLink(span)).toBe(anchor);
    expect(findRichTextPreviewLink(root)).toBeNull();
  });

  it('opens or copies based on modifier keys', () => {
    expect(richTextPreviewLinkAction({ metaKey: false, ctrlKey: false })).toBe('open');
    expect(richTextPreviewLinkAction({ metaKey: true, ctrlKey: false })).toBe('copy');
    expect(richTextPreviewLinkAction({ metaKey: false, ctrlKey: true })).toBe('copy');
  });

  it('opens external links in a new window', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    await actOnRichTextPreviewLink('https://example.com/path', 'open');
    expect(open).toHaveBeenCalledWith('https://example.com/path', '_blank', 'noopener,noreferrer');
    expect(writeText).not.toHaveBeenCalled();

    open.mockRestore();
    vi.unstubAllGlobals();
  });

  it('copies link href to clipboard', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });

    await expect(actOnRichTextPreviewLink('https://example.com/path', 'copy')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://example.com/path');
    expect(open).not.toHaveBeenCalled();

    open.mockRestore();
    vi.unstubAllGlobals();
  });

  it('rejects unsafe link protocols', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(isSafeRichTextPreviewHref('javascript:alert(1)')).toBe(false);
    expect(await actOnRichTextPreviewLink('javascript:alert(1)', 'open')).toBe(false);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('returns false when clipboard copy fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await expect(actOnRichTextPreviewLink('https://example.com', 'copy')).resolves.toBe(false);
    vi.unstubAllGlobals();
  });

  it('allows mailto links', () => {
    expect(isSafeRichTextPreviewHref('mailto:hello@example.com')).toBe(true);
  });

  it('handleRichTextPreviewLinkClick ignores non-link targets', async () => {
    const div = document.createElement('div');
    const event = {
      target: div,
      preventDefault: () => {},
      stopPropagation: () => {},
      metaKey: false,
      ctrlKey: false,
    };
    await expect(handleRichTextPreviewLinkClick(event)).resolves.toBe(false);
  });
});
