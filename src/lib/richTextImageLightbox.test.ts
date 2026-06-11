import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentUri } from './richTextAttachmentUri';
import { findRichTextEditorImage } from './richTextImageLightbox';

const resolveDisplayUrl = vi.fn<(src: string, userId: string) => Promise<string>>();

vi.mock('./richTextAttachmentStore', () => ({
  resolveAttachmentDisplayUrl: (src: string, userId: string) => resolveDisplayUrl(src, userId),
}));

vi.mock('./richTextAttachmentUser', () => ({
  fetchRichTextAttachmentUserId: vi.fn(async (preferred?: string | null) => preferred ?? 'user-1'),
}));

describe('findRichTextEditorImage', () => {
  it('returns the img when the click target is inside a rich editor surface', () => {
    const surface = document.createElement('div');
    surface.className = 'rich-editor__surface';
    const img = document.createElement('img');
    img.className = 'rich-editor-image';
    img.src = 'blob:test';
    surface.appendChild(img);
    document.body.appendChild(surface);

    expect(findRichTextEditorImage(img)).toBe(img);
    expect(findRichTextEditorImage(surface)).toBeNull();

    surface.remove();
  });

  it('ignores images outside rich editor surfaces', () => {
    const img = document.createElement('img');
    img.src = 'https://example.com/x.png';
    document.body.appendChild(img);
    expect(findRichTextEditorImage(img)).toBeNull();
    img.remove();
  });
});

describe('resolveRichTextImageLightboxSrc', () => {
  beforeEach(() => {
    resolveDisplayUrl.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function loadModule() {
    return import('./richTextImageLightbox');
  }

  it('resolves attachment id from data attribute via sidecar store', async () => {
    resolveDisplayUrl.mockResolvedValue('blob:resolved');
    const { resolveRichTextImageLightboxSrc } = await loadModule();
    const img = document.createElement('img');
    img.setAttribute('data-attachment-id', 'note-doc-abc123456789');
    img.src = 'cadence-attachment://note-doc-abc123456789';

    const url = await resolveRichTextImageLightboxSrc(img, 'user-1');
    expect(url).toBe('blob:resolved');
    expect(resolveDisplayUrl).toHaveBeenCalledWith(
      attachmentUri('note-doc-abc123456789'),
      'user-1',
    );
  });

  it('falls back to blob or data src when attachment resolution fails', async () => {
    resolveDisplayUrl.mockResolvedValue('cadence-attachment://missing');
    const { resolveRichTextImageLightboxSrc } = await loadModule();
    const img = document.createElement('img');
    img.src = 'data:image/png;base64,abc';

    expect(await resolveRichTextImageLightboxSrc(img, 'user-1')).toBe('data:image/png;base64,abc');
  });

  it('returns null when no displayable url exists', async () => {
    resolveDisplayUrl.mockResolvedValue('cadence-attachment://missing');
    const { resolveRichTextImageLightboxSrc } = await loadModule();
    const img = document.createElement('img');
    img.src = 'cadence-attachment://missing';

    expect(await resolveRichTextImageLightboxSrc(img, 'user-1')).toBeNull();
  });
});

describe('resolveRichTextImageLightboxSrcById', () => {
  beforeEach(() => {
    resolveDisplayUrl.mockReset();
  });

  it('resolves by attachment id only', async () => {
    resolveDisplayUrl.mockResolvedValue('blob:by-id');
    const { resolveRichTextImageLightboxSrcById } = await import('./richTextImageLightbox');
    const url = await resolveRichTextImageLightboxSrcById('note-x-123456789012', 'user-2');
    expect(url).toBe('blob:by-id');
    expect(resolveDisplayUrl).toHaveBeenCalledWith(
      attachmentUri('note-x-123456789012'),
      'user-2',
    );
  });
});
