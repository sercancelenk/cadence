/**
 * What the user is trying to do when we prompt for the passphrase.
 *
 *   - 'view'              – temporarily decrypt for reading; note stays locked
 *   - 'lock'              – encrypt the current note body and mark it locked
 *   - 'unlock-selected'   – PERMANENTLY remove the lock from the selected note
 *                           (decrypts to plaintext on disk)
 *   - 'disable-locking'   – remove the workspace-wide passphrase, decrypting
 *                           every locked note back to plaintext on disk
 */
export type PendingIntent = 'lock' | 'unlock-selected' | 'disable-locking' | 'view';

/**
 * Minimum Notes passphrase length (workspace-wide lock, separate from account
 * password). Re-exported from the crypto module, which is the single source of
 * truth and enforces it at the boundary in `createNotesLock`.
 */
export { MIN_NOTES_PASSPHRASE_LENGTH } from '../../lib/notesCrypto';

export const FORCE_RESET_PHRASE = 'DELETE LOCKED NOTES';
