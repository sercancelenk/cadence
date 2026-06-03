// @ts-nocheck
import { useCallback, useState } from 'react';
import { useAccount } from '../../AccountContext';
import type { AppData } from '../../model';
import {
  createNotesLock,
  decryptBodyWithMaster,
  encryptBodyWithMaster,
  unlockMaster,
  unwrapPassphraseFromRecovery,
  wrapPassphraseForRecovery,
} from '../../lib/notesCrypto';
import type { NotesUnlockApi } from '../../providers/NotesUnlockContext';
import type { Note, NotesLock } from '../../model';
import type { RichTextBodyFields } from '../../lib/richTextBody';
import { FORCE_RESET_PHRASE, type PendingIntent } from './noteLockTypes';
import { PLACEHOLDER_TITLE } from './notePreferences';

/**
 * Notes lock / passphrase flows for the Notes page.
 *
 * Strict per-note unlock UX:
 *   - Lock encrypts the body, clears in-memory plaintext, and drops the session master key.
 *   - Hide on a viewed locked note clears plaintext and session key.
 *   - Unlock to view ALWAYS prompts for the passphrase (requestAction('view') calls unlock.clear() first).
 *   - performAction callers must pass a freshly-derived CryptoKey — not unlock.read() right after remember().
 */
type UseNotesLockArgs = {
  data: AppData;
  selected: Note | null;
  decrypted: ({ noteId: string } & RichTextBodyFields) | null;
  setDecrypted: React.Dispatch<
    React.SetStateAction<({ noteId: string } & RichTextBodyFields) | null>
  >;
  unlock: NotesUnlockApi;
  replaceNote: (note: Note) => void;
  setNotesLock: (lock: NotesLock | undefined) => void;
  update: (fn: (d: AppData) => AppData) => void;
  removeNote: (id: string) => void;
};

export function useNotesLock({
  data,
  selected,
  decrypted,
  setDecrypted,
  unlock,
  replaceNote,
  setNotesLock,
  update,
  removeNote,
}: UseNotesLockArgs) {
  const account = useAccount();

  const [setupOpen, setSetupOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<PendingIntent | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [confirmDisableLock, setConfirmDisableLock] = useState(false);

  const [setupPw1, setSetupPw1] = useState('');
  const [setupPw2, setSetupPw2] = useState('');
  const [setupEnableRecovery, setSetupEnableRecovery] = useState(true);
  const [setupAccountPw, setSetupAccountPw] = useState('');
  const [unlockPw, setUnlockPw] = useState('');
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const [unlockErr, setUnlockErr] = useState<string | null>(null);
  const [disableErr, setDisableErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forceResetOpen, setForceResetOpen] = useState(false);
  const [forceResetInput, setForceResetInput] = useState('');
  const [recoverOpen, setRecoverOpen] = useState(false);
  const [recoverPw, setRecoverPw] = useState('');
  const [recoverErr, setRecoverErr] = useState<string | null>(null);
  const [addRecoveryOpen, setAddRecoveryOpen] = useState(false);
  const [addRecoveryNotesPw, setAddRecoveryNotesPw] = useState('');
  const [addRecoveryAccountPw, setAddRecoveryAccountPw] = useState('');
  const [addRecoveryErr, setAddRecoveryErr] = useState<string | null>(null);

  const performAction = useCallback(
    async (intent: PendingIntent, key: CryptoKey, targetNote: Note | null) => {
      switch (intent) {
        case 'view': {
          if (targetNote?.locked && targetNote.cipher) {
            setBusy(true);
            try {
              const body = await decryptBodyWithMaster(key, targetNote.cipher);
              if (body === null) {
                setUnlockErr('That passphrase does not unlock this note.');
                setUnlockOpen(true);
                setPendingIntent('view');
                return;
              }
              setDecrypted({
                noteId: targetNote.id,
                body,
                bodyFormat: targetNote.bodyFormat,
                bodyPlainText: targetNote.bodyPlainText,
              });
            } finally {
              setBusy(false);
            }
          }
          return;
        }
        case 'lock': {
          if (!targetNote) return;
          setBusy(true);
          try {
            const bodyToLock = targetNote.locked
              ? decrypted?.noteId === targetNote.id
                ? decrypted.body
                : targetNote.body
              : targetNote.body;
            const cipher = await encryptBodyWithMaster(key, bodyToLock);
            replaceNote({
              ...targetNote,
              body: '',
              locked: true,
              cipher,
              bodyFormat: targetNote.bodyFormat ?? decrypted?.bodyFormat,
              bodyPlainText: undefined,
            });
            setDecrypted(null);
            unlock.clear();
          } finally {
            setBusy(false);
          }
          return;
        }
        case 'unlock-selected': {
          if (!targetNote || !targetNote.cipher) return;
          setBusy(true);
          try {
            const body = await decryptBodyWithMaster(key, targetNote.cipher);
            if (body === null) {
              setUnlockErr('That passphrase does not unlock this note.');
              setUnlockOpen(true);
              setPendingIntent('unlock-selected');
              return;
            }
            replaceNote({
              ...targetNote,
              body,
              locked: false,
              cipher: undefined,
              bodyFormat: targetNote.bodyFormat,
              bodyPlainText: targetNote.bodyPlainText,
            });
            setDecrypted({
              noteId: targetNote.id,
              body,
              bodyFormat: targetNote.bodyFormat,
              bodyPlainText: targetNote.bodyPlainText,
            });
          } finally {
            setBusy(false);
          }
          return;
        }
        case 'disable-locking': {
          setBusy(true);
          setDisableErr(null);
          try {
            const lockedNotes = data.notes.filter((n) => n.locked && n.cipher);
            const decryptedPairs: { id: string; body: string }[] = [];
            for (const n of lockedNotes) {
              const body = await decryptBodyWithMaster(key, n.cipher!);
              if (body === null) {
                setDisableErr(
                  `Could not decrypt "${n.title || PLACEHOLDER_TITLE}" with the current passphrase. ` +
                    `If this is a leftover from an earlier broken attempt, delete that note (the Delete button works even when locked) ` +
                    `and try "Remove lock" again.`,
                );
                return;
              }
              decryptedPairs.push({ id: n.id, body });
            }
            update((d) => {
              const lookup = new Map(decryptedPairs.map((p) => [p.id, p.body]));
              const now = new Date().toISOString();
              const nextNotes = d.notes.map((n) =>
                lookup.has(n.id)
                  ? { ...n, body: lookup.get(n.id)!, locked: false, cipher: undefined, updatedAt: now }
                  : n,
              );
              const { notesLock: _drop, ...rest } = d;
              return { ...(rest as typeof d), notes: nextNotes };
            });
            setNotesLock(undefined);
            unlock.clear();
            setConfirmDisableLock(false);
          } finally {
            setBusy(false);
          }
        }
      }
    },
    [data.notes, decrypted, replaceNote, setNotesLock, unlock, update, setDecrypted],
  );

  const requestAction = useCallback(
    (intent: PendingIntent) => {
      if (intent === 'view') {
        unlock.clear();
      }
      const key = intent === 'view' ? null : unlock.read();
      if (key) {
        void performAction(intent, key, selected);
        return;
      }
      if (!data.notesLock) {
        setSetupErr(null);
        setSetupPw1('');
        setSetupPw2('');
        setPendingIntent(intent);
        setSetupOpen(true);
        return;
      }
      setUnlockErr(null);
      setUnlockPw('');
      setPendingIntent(intent);
      setUnlockOpen(true);
    },
    [unlock, performAction, selected, data.notesLock],
  );

  const confirmDelete = () => {
    if (!confirmRemoveId) return;
    removeNote(confirmRemoveId);
    setConfirmRemoveId(null);
  };

  const submitSetup = async () => {
    setSetupErr(null);
    const a = setupPw1;
    const b = setupPw2;
    if (a.length < 6) {
      setSetupErr('Choose a passphrase of at least 6 characters.');
      return;
    }
    if (a !== b) {
      setSetupErr('Passphrases do not match.');
      return;
    }
    const wantsRecovery = setupEnableRecovery;
    const accountPw = setupAccountPw;
    if (wantsRecovery && !accountPw) {
      setSetupErr('Enter your account password (or untick "Enable recovery").');
      return;
    }
    setBusy(true);
    try {
      let recovery: NotesLock['recovery'] | undefined;
      if (wantsRecovery) {
        const v = await account.verifyPassword(accountPw);
        if (!v.ok) {
          setSetupErr(v.error ?? 'Could not verify account password.');
          return;
        }
        recovery = await wrapPassphraseForRecovery(a, accountPw);
      }
      const { lock, masterKey } = await createNotesLock(a);
      const fullLock: NotesLock = recovery ? { ...lock, recovery } : lock;
      setNotesLock(fullLock);
      unlock.remember(masterKey);
      setSetupOpen(false);
      setSetupPw1('');
      setSetupPw2('');
      setSetupAccountPw('');
      const intent = pendingIntent;
      setPendingIntent(null);
      if (intent) await performAction(intent, masterKey, selected);
    } catch (e) {
      setSetupErr(e instanceof Error ? e.message : 'Could not set passphrase.');
    } finally {
      setBusy(false);
    }
  };

  const submitRecover = async () => {
    setRecoverErr(null);
    if (!data.notesLock?.recovery) {
      setRecoverErr('There is no recovery envelope on this workspace.');
      return;
    }
    const accountPw = recoverPw;
    if (!accountPw) return;
    setBusy(true);
    try {
      const passphrase = await unwrapPassphraseFromRecovery(data.notesLock.recovery, accountPw);
      if (!passphrase) {
        setRecoverErr('That account password is not correct (or the recovery envelope is corrupt).');
        return;
      }
      const key = await unlockMaster(passphrase, data.notesLock);
      if (!key) {
        setRecoverErr('Recovery envelope decrypted but the passphrase did not unlock the notes.');
        return;
      }
      unlock.remember(key);
      setRecoverOpen(false);
      setRecoverPw('');
      setUnlockOpen(false);
      setUnlockPw('');
      const intent = pendingIntent;
      setPendingIntent(null);
      if (intent === 'disable-locking') {
        setConfirmDisableLock(true);
        return;
      }
      if (intent) await performAction(intent, key, selected);
    } finally {
      setBusy(false);
    }
  };

  const submitAddRecovery = async () => {
    setAddRecoveryErr(null);
    if (!data.notesLock) {
      setAddRecoveryErr('There is no Notes passphrase to recover.');
      return;
    }
    const notesPw = addRecoveryNotesPw;
    const accountPw = addRecoveryAccountPw;
    if (!notesPw || !accountPw) return;
    setBusy(true);
    try {
      const key = await unlockMaster(notesPw, data.notesLock);
      if (!key) {
        setAddRecoveryErr('That is not the current Notes passphrase.');
        return;
      }
      const v = await account.verifyPassword(accountPw);
      if (!v.ok) {
        setAddRecoveryErr(v.error ?? 'Incorrect account password.');
        return;
      }
      const recovery = await wrapPassphraseForRecovery(notesPw, accountPw);
      setNotesLock({ ...data.notesLock, recovery });
      unlock.remember(key);
      setAddRecoveryOpen(false);
      setAddRecoveryNotesPw('');
      setAddRecoveryAccountPw('');
    } finally {
      setBusy(false);
    }
  };

  const forceReset = useCallback(() => {
    update((d) => {
      const nextNotes = d.notes.filter((n) => !n.locked);
      const { notesLock: _drop, ...rest } = d;
      return { ...(rest as typeof d), notes: nextNotes };
    });
    setNotesLock(undefined);
    unlock.clear();
    setForceResetOpen(false);
    setForceResetInput('');
    setUnlockOpen(false);
    setConfirmDisableLock(false);
    setPendingIntent(null);
    setUnlockErr(null);
    setUnlockPw('');
  }, [update, setNotesLock, unlock]);

  const submitUnlock = async () => {
    setUnlockErr(null);
    const pw = unlockPw;
    if (!pw) return;
    if (!data.notesLock) return;
    setBusy(true);
    try {
      const key = await unlockMaster(pw, data.notesLock);
      if (!key) {
        setUnlockErr('That passphrase is not correct.');
        return;
      }
      unlock.remember(key);
      setUnlockOpen(false);
      setUnlockPw('');
      const intent = pendingIntent;
      setPendingIntent(null);
      if (intent === 'disable-locking') {
        setConfirmDisableLock(true);
        return;
      }
      if (intent) await performAction(intent, key, selected);
    } finally {
      setBusy(false);
    }
  };

  const openDisableLocking = () => {
    setDisableErr(null);
    unlock.clear();
    setUnlockErr(null);
    setUnlockPw('');
    setPendingIntent('disable-locking');
    setUnlockOpen(true);
  };

  const openAddRecovery = () => {
    setAddRecoveryErr(null);
    setAddRecoveryNotesPw('');
    setAddRecoveryAccountPw('');
    setAddRecoveryOpen(true);
  };

  const confirmDisableLockAction = () => {
    const key = unlock.read();
    if (!key) {
      setUnlockErr(null);
      setUnlockPw('');
      setPendingIntent('disable-locking');
      setConfirmDisableLock(false);
      setUnlockOpen(true);
      return;
    }
    void performAction('disable-locking', key, null);
  };

  return {
    busy,
    hasLock: !!data.notesLock,
    hasRecovery: !!data.notesLock?.recovery,
    setupOpen,
    setSetupOpen,
    unlockOpen,
    setUnlockOpen,
    pendingIntent,
    setPendingIntent,
    confirmRemoveId,
    setConfirmRemoveId,
    confirmDisableLock,
    setConfirmDisableLock,
    setupPw1,
    setSetupPw1,
    setupPw2,
    setSetupPw2,
    setupEnableRecovery,
    setSetupEnableRecovery,
    setupAccountPw,
    setSetupAccountPw,
    unlockPw,
    setUnlockPw,
    setupErr,
    setSetupErr,
    unlockErr,
    setUnlockErr,
    disableErr,
    setDisableErr,
    forceResetOpen,
    setForceResetOpen,
    forceResetInput,
    setForceResetInput,
    recoverOpen,
    setRecoverOpen,
    recoverPw,
    setRecoverPw,
    recoverErr,
    setRecoverErr,
    addRecoveryOpen,
    setAddRecoveryOpen,
    addRecoveryNotesPw,
    setAddRecoveryNotesPw,
    addRecoveryAccountPw,
    setAddRecoveryAccountPw,
    addRecoveryErr,
    setAddRecoveryErr,
    requestAction,
    performAction,
    confirmDelete,
    submitSetup,
    submitRecover,
    submitAddRecovery,
    forceReset,
    submitUnlock,
    openDisableLocking,
    openAddRecovery,
    confirmDisableLockAction,
    FORCE_RESET_PHRASE,
  };
}
