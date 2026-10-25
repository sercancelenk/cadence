import type { NotesLock } from '../model';
import { unwrapPassphraseFromRecovery, wrapPassphraseForRecovery } from './notesCrypto';

/**
 * Whether the Notes passphrase recovery may not open with this account's password: it says it was
 * made for a different account, or it does not say whose it is (made before the account was
 * recorded). Such an envelope is never deleted, since it may still open; the user is pointed to
 * "Renew recovery" instead.
 */
export function notesRecoveryNeedsRenewal(lock: NotesLock | undefined, accountId: string): boolean {
  if (!lock?.recovery) return false;
  return lock.recovery.accountId !== accountId;
}

/**
 * Whether the envelope says outright that it was made for a different account. Unlike
 * `notesRecoveryNeedsRenewal`, one that does not say whose it is does not count: it is most likely this
 * account's own, made before the account was recorded.
 */
export function notesRecoveryIsForeign(lock: NotesLock | undefined, accountId: string): boolean {
  const owner = lock?.recovery?.accountId;
  return !!owner && owner !== accountId;
}

/**
 * When the account password changes, the Notes recovery (wrapped with the old password) can be moved
 * to the new one: the old password opens it, which yields the Notes passphrase, which is wrapped
 * again. If the old password does not open it, the lock is returned untouched.
 */
export async function rewrapNotesRecovery(
  lock: NotesLock | undefined,
  oldAccountPassword: string,
  newAccountPassword: string,
  accountId: string,
): Promise<{ lock: NotesLock | undefined; rewrapped: boolean }> {
  if (!lock?.recovery) return { lock, rewrapped: false };
  try {
    const passphrase = await unwrapPassphraseFromRecovery(lock.recovery, oldAccountPassword);
    if (!passphrase) return { lock, rewrapped: false };
    const recovery = await wrapPassphraseForRecovery(passphrase, newAccountPassword, accountId);
    return { lock: { ...lock, recovery }, rewrapped: true };
  } catch {
    // A damaged envelope must never turn a successful password change into an error.
    return { lock, rewrapped: false };
  }
}
