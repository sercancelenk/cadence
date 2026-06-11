/**
 * Resolve the user id used for rich-text attachment sidecars.
 * Electron IPC always reads/writes under the signed-in session uid; the
 * renderer should mirror that id for IndexedDB fallbacks.
 */

let cachedSessionUserId: string | null | undefined;

export function primeRichTextAttachmentUserId(userId: string | null | undefined): void {
  if (userId) cachedSessionUserId = userId;
}

export async function fetchRichTextAttachmentUserId(
  preferred?: string | null,
): Promise<string> {
  if (preferred && preferred !== 'anonymous') return preferred;

  if (cachedSessionUserId && cachedSessionUserId !== 'anonymous') {
    return cachedSessionUserId;
  }

  if (typeof window !== 'undefined' && window.cadence?.accountSession) {
    try {
      const session = await window.cadence.accountSession();
      const id = session?.user?.id;
      if (id) {
        cachedSessionUserId = id;
        return id;
      }
    } catch {
      /* session unavailable — fall through */
    }
  }

  return preferred && preferred !== 'anonymous' ? preferred : 'anonymous';
}

/** Sync helper for paste handlers — uses primed session or prop fallback. */
export function richTextAttachmentUserIdNow(preferred?: string | null): string {
  if (preferred && preferred !== 'anonymous') return preferred;
  if (cachedSessionUserId && cachedSessionUserId !== 'anonymous') return cachedSessionUserId;
  return preferred ?? 'anonymous';
}

export function clearRichTextAttachmentUserIdCache(): void {
  cachedSessionUserId = undefined;
}

export function resetRichTextAttachmentUserIdCacheForTests(): void {
  clearRichTextAttachmentUserIdCache();
}
