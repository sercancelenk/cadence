import { STORAGE_PREFIX } from './appBranding';
import { isRecoveryEnvelope, type RecoveryEnvelope } from './accountRecovery';

const KEY = `${STORAGE_PREFIX}-pending-recovery-envelope`;

/** Hold a freshly generated envelope until the user confirms they saved the codes. */
export function stashPendingRecoveryEnvelope(envelope: RecoveryEnvelope): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    /* private mode */
  }
}

export function readPendingRecoveryEnvelope(): RecoveryEnvelope | null {
  if (typeof window === 'undefined' || !window.sessionStorage) return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isRecoveryEnvelope(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingRecoveryEnvelope(): void {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
