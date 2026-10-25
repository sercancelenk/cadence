import { describe, expect, it } from 'vitest';
import type { NotesLock } from '../model';
import { createNotesLock, unwrapPassphraseFromRecovery, wrapPassphraseForRecovery } from './notesCrypto';
import { notesRecoveryIsForeign, notesRecoveryNeedsRenewal, rewrapNotesRecovery } from './notesRecovery';

const base: NotesLock = { saltB64: 's', verifierIvB64: 'iv', verifierCipherB64: 'c' };
const withRecovery = (accountId?: string): NotesLock => ({
  ...base,
  recovery: { saltB64: 'a', ivB64: 'b', cipherB64: 'c', ...(accountId ? { accountId } : {}) },
});

describe('notesRecoveryNeedsRenewal', () => {
  it('is false when the envelope was made for this account', () => {
    expect(notesRecoveryNeedsRenewal(withRecovery('acct-1'), 'acct-1')).toBe(false);
  });

  it('is true when it was made for a different account', () => {
    expect(notesRecoveryNeedsRenewal(withRecovery('acct-1'), 'acct-2')).toBe(true);
  });

  it('is true when it does not say whose it is: it may not open with this account password', () => {
    expect(notesRecoveryNeedsRenewal(withRecovery(), 'acct-1')).toBe(true);
  });

  it('is false when there is no envelope or no lock', () => {
    expect(notesRecoveryNeedsRenewal(base, 'acct-1')).toBe(false);
    expect(notesRecoveryNeedsRenewal(undefined, 'acct-1')).toBe(false);
  });
});

describe('notesRecoveryIsForeign', () => {
  it('is true only when the envelope says it was made for a different account', () => {
    expect(notesRecoveryIsForeign(withRecovery('acct-1'), 'acct-2')).toBe(true);
    expect(notesRecoveryIsForeign(withRecovery('acct-1'), 'acct-1')).toBe(false);
  });

  it('is false when it does not say whose it is, or there is nothing to judge', () => {
    expect(notesRecoveryIsForeign(withRecovery(), 'acct-1')).toBe(false);
    expect(notesRecoveryIsForeign(base, 'acct-1')).toBe(false);
    expect(notesRecoveryIsForeign(undefined, 'acct-1')).toBe(false);
  });
});

describe('rewrapNotesRecovery', () => {
  const NOTES_PASS = 'notes-passphrase-1';

  async function lockWithRealRecovery(accountPw: string) {
    const { lock } = await createNotesLock(NOTES_PASS);
    const recovery = await wrapPassphraseForRecovery(NOTES_PASS, accountPw, 'acct-1');
    return { ...lock, recovery };
  }

  it('moves the recovery to the new account password, keeping the same Notes passphrase', async () => {
    const lock = await lockWithRealRecovery('old-account-pw');

    const r = await rewrapNotesRecovery(lock, 'old-account-pw', 'new-account-pw', 'acct-1');

    expect(r.rewrapped).toBe(true);
    expect(r.lock?.saltB64).toBe(lock.saltB64);
    expect(r.lock?.verifierCipherB64).toBe(lock.verifierCipherB64);
    expect(r.lock?.recovery?.accountId).toBe('acct-1');
    expect(await unwrapPassphraseFromRecovery(r.lock!.recovery!, 'new-account-pw')).toBe(NOTES_PASS);
    expect(await unwrapPassphraseFromRecovery(r.lock!.recovery!, 'old-account-pw')).toBeNull();
  });

  it('leaves the lock exactly as it was when the old password does not open it', async () => {
    const lock = await lockWithRealRecovery('old-account-pw');
    const r = await rewrapNotesRecovery(lock, 'some-other-pw', 'new-account-pw', 'acct-1');
    expect(r.rewrapped).toBe(false);
    expect(r.lock).toBe(lock);
  });

  it('does nothing when there is no recovery or no lock', async () => {
    expect((await rewrapNotesRecovery(base, 'a', 'b', 'acct-1')).rewrapped).toBe(false);
    expect((await rewrapNotesRecovery(undefined, 'a', 'b', 'acct-1')).lock).toBeUndefined();
  });

  it('never throws: a damaged envelope is left as it is', async () => {
    const lock: NotesLock = { ...base, recovery: { saltB64: '***', ivB64: '***', cipherB64: '***' } };
    const r = await rewrapNotesRecovery(lock, 'old', 'new', 'acct-1');
    expect(r.rewrapped).toBe(false);
    expect(r.lock).toBe(lock);
  });
});
