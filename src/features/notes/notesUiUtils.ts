import type { PendingIntent } from './noteLockTypes';

/** Inclusive clamp — kept inline (not in lib/) because we currently only
 *  need it for the sidebar resize math; promoting it can wait until a
 *  second caller shows up. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Intent-aware copy for the passphrase prompt. When the workspace already
 * has a passphrase set, the user needs to enter it ONCE per session before
 * any encryption / decryption can happen — including locking a brand-new
 * note. The button they tap to get here ("Lock", "Unlock", "Remove lock",
 * or simply selecting a locked note) tells us what they're trying to do,
 * and the dialog should mirror that so they aren't shown "to view locked
 * notes" copy while they're really just trying to lock the current note.
 */
export function unlockDialogTitle(intent: PendingIntent | null): string {
  switch (intent) {
    case 'lock':
      return 'Enter Notes passphrase to lock';
    case 'unlock-selected':
      return 'Enter Notes passphrase to unlock';
    case 'disable-locking':
      return 'Enter Notes passphrase to remove lock';
    case 'view':
    default:
      return 'Unlock notes';
  }
}

export function unlockDialogBody(intent: PendingIntent | null): string {
  switch (intent) {
    case 'lock':
      return 'This workspace already has a Notes passphrase. Enter it once to encrypt this note (and any other locked notes) for the rest of this session.';
    case 'unlock-selected':
      return 'Enter your Notes passphrase to decrypt this note for the rest of this session.';
    case 'disable-locking':
      return 'Enter your Notes passphrase. We need to decrypt every locked note before removing the workspace passphrase.';
    case 'view':
    default:
      return 'Enter your Notes passphrase to view locked notes in this session.';
  }
}

export function unlockDialogButton(intent: PendingIntent | null): string {
  switch (intent) {
    case 'lock':
      return 'Unlock & lock';
    case 'unlock-selected':
      return 'Unlock';
    case 'disable-locking':
      return 'Unlock & continue';
    case 'view':
    default:
      return 'Unlock';
  }
}
