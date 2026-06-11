import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRichTextAttachmentUserId,
  primeRichTextAttachmentUserId,
  resetRichTextAttachmentUserIdCacheForTests,
  richTextAttachmentUserIdNow,
} from './richTextAttachmentUser';

describe('richTextAttachmentUser', () => {
  afterEach(() => {
    resetRichTextAttachmentUserIdCacheForTests();
    delete (window as { cadence?: unknown }).cadence;
  });

  it('prefers an explicit account user id', async () => {
    expect(await fetchRichTextAttachmentUserId('user-123')).toBe('user-123');
    expect(richTextAttachmentUserIdNow('user-123')).toBe('user-123');
  });

  it('falls back to Electron session when prop is anonymous', async () => {
    (window as { cadence?: { accountSession?: ReturnType<typeof vi.fn> } }).cadence = {
      accountSession: vi.fn().mockResolvedValue({ user: { id: 'session-uid' } }),
    };
    expect(await fetchRichTextAttachmentUserId('anonymous')).toBe('session-uid');
    expect(richTextAttachmentUserIdNow('anonymous')).toBe('session-uid');
  });

  it('uses primed cache without another session round-trip', async () => {
    primeRichTextAttachmentUserId('primed');
    expect(await fetchRichTextAttachmentUserId(null)).toBe('primed');
  });

  it('returns anonymous when no session is available', async () => {
    expect(await fetchRichTextAttachmentUserId(null)).toBe('anonymous');
    expect(richTextAttachmentUserIdNow(null)).toBe('anonymous');
  });
});
