import { STORAGE_PREFIX } from './appBranding';

const KEY = `${STORAGE_PREFIX}-pending-recovery-codes`;

/** Hold freshly generated codes until the onboarding tour shows them once. */
export function stashPendingRecoveryCodes(codes: string[]): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(codes));
  } catch {
    /* private mode */
  }
}

export function readPendingRecoveryCodes(): string[] | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((c) => typeof c !== 'string')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingRecoveryCodes(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
