import { IcLock } from '../../components/icons';
import type { Note } from '../../model';
import type { AppData } from '../../model';
import { NotesDialog } from './NotesDialog';
import type { useNotesLock } from './useNotesLock';
import { MIN_NOTES_PASSPHRASE_LENGTH } from './noteLockTypes';
import {
  unlockDialogBody,
  unlockDialogButton,
  unlockDialogTitle,
} from './notesUiUtils';

export type NotesLockDialogsProps = {
  notes: Note[];
  data: AppData;
  lock: ReturnType<typeof useNotesLock>;
};

export function NotesLockDialogs({ notes, data, lock }: NotesLockDialogsProps) {
  const {
    busy,
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
    submitSetup,
    submitUnlock,
    submitRecover,
    submitAddRecovery,
    forceReset,
    confirmDelete,
    confirmDisableLockAction,
    FORCE_RESET_PHRASE,
  } = lock;

  return (
    <>
      {setupOpen ? (
        <NotesDialog
          title="Set a Notes passphrase"
          icon={<IcLock size={18} />}
          onClose={() => {
            setSetupOpen(false);
            setPendingIntent(null);
            setSetupPw1('');
            setSetupPw2('');
            setSetupAccountPw('');
            setSetupErr(null);
          }}
          footer={
            <div className="notes-dialog__footer-actions">
              {setupErr ? <p className="text-error notes-dialog__footer-error">{setupErr}</p> : null}
              <button type="button" className="btn btn--primary" onClick={submitSetup} disabled={busy}>
                {busy ? 'Saving…' : 'Save passphrase'}
              </button>
            </div>
          }
        >
          <p>
            This passphrase is required to lock and unlock notes. It's <strong>different from your account
            password</strong> and is <strong>never stored on disk</strong> — only a verifier blob is saved, used to
            check whether the passphrase you type later is correct.
          </p>
          <label className="field">
            <span>Passphrase</span>
            <input
              type="password"
              className="input"
              value={setupPw1}
              onChange={(e) => setSetupPw1(e.target.value)}
              autoFocus
              autoComplete="new-password"
              minLength={MIN_NOTES_PASSPHRASE_LENGTH}
            />
            <span className="muted small">
              At least {MIN_NOTES_PASSPHRASE_LENGTH} characters — separate from your account login password.
            </span>
          </label>
          <label className="field">
            <span>Confirm passphrase</span>
            <input
              type="password"
              className="input"
              value={setupPw2}
              onChange={(e) => setSetupPw2(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !setupEnableRecovery) void submitSetup();
              }}
            />
          </label>
          <label className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={setupEnableRecovery}
              onChange={(e) => setSetupEnableRecovery(e.target.checked)}
            />
            <span>Enable recovery using my account password (recommended)</span>
          </label>
          {setupEnableRecovery ? (
            <>
              <p style={{ fontSize: 12, opacity: 0.8 }}>
                We'll wrap this passphrase with a key derived from your account password and store the encrypted
                blob alongside the verifier. If you forget the Notes passphrase, you can recover by entering your
                account password. The strongest of the two passwords is what protects your notes at rest.
              </p>
              <label className="field">
                <span>Account password</span>
                <input
                  type="password"
                  className="input"
                  value={setupAccountPw}
                  onChange={(e) => setSetupAccountPw(e.target.value)}
                  autoComplete="current-password"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitSetup();
                  }}
                />
              </label>
            </>
          ) : (
            <p className="text-warn">
              Without recovery: if you forget this passphrase, locked notes <strong>cannot be recovered</strong>.
            </p>
          )}
        </NotesDialog>
      ) : null}

      {unlockOpen ? (
        <NotesDialog
          title={unlockDialogTitle(pendingIntent)}
          icon={<IcLock size={18} />}
          onClose={() => {
            setUnlockOpen(false);
            setPendingIntent(null);
            setUnlockPw('');
            setUnlockErr(null);
          }}
          footer={
            <button type="button" className="btn btn--primary" onClick={submitUnlock} disabled={busy}>
              {busy ? 'Checking…' : unlockDialogButton(pendingIntent)}
            </button>
          }
        >
          <p>{unlockDialogBody(pendingIntent)}</p>
          <label className="field">
            <span>Passphrase</span>
            <input
              type="password"
              className="input"
              value={unlockPw}
              onChange={(e) => setUnlockPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitUnlock();
              }}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {unlockErr ? <p className="text-error">{unlockErr}</p> : null}
          <p style={{ marginTop: 12, fontSize: 12 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                if (data.notesLock?.recovery) {
                  setRecoverErr(null);
                  setRecoverPw('');
                  setRecoverOpen(true);
                } else {
                  setForceResetOpen(true);
                }
              }}
            >
              Forgot passphrase?
            </button>
          </p>
        </NotesDialog>
      ) : null}

      {recoverOpen ? (
        <NotesDialog
          title="Recover with your account password"
          icon={<IcLock size={18} />}
          onClose={() => {
            setRecoverOpen(false);
            setRecoverPw('');
            setRecoverErr(null);
          }}
          footer={
            <button
              type="button"
              className="btn btn--primary"
              onClick={submitRecover}
              disabled={busy || !recoverPw}
            >
              {busy ? 'Recovering…' : 'Recover & unlock'}
            </button>
          }
        >
          <p>
            Enter your <strong>account password</strong> (the one you log in with). We'll use it to decrypt the
            Notes passphrase that was stored at setup time, then unlock the workspace.
          </p>
          <label className="field">
            <span>Account password</span>
            <input
              type="password"
              className="input"
              value={recoverPw}
              onChange={(e) => setRecoverPw(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRecover();
              }}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          {recoverErr ? <p className="text-error">{recoverErr}</p> : null}
          <p style={{ marginTop: 12, fontSize: 12 }}>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                setRecoverOpen(false);
                setRecoverPw('');
                setRecoverErr(null);
                setForceResetOpen(true);
              }}
            >
              Account password also lost? Delete locked notes &amp; reset
            </button>
          </p>
        </NotesDialog>
      ) : null}

      {addRecoveryOpen ? (
        <NotesDialog
          title="Add account-password recovery"
          icon={<IcLock size={18} />}
          onClose={() => {
            setAddRecoveryOpen(false);
            setAddRecoveryNotesPw('');
            setAddRecoveryAccountPw('');
            setAddRecoveryErr(null);
          }}
          footer={
            <button
              type="button"
              className="btn btn--primary"
              onClick={submitAddRecovery}
              disabled={busy || !addRecoveryNotesPw || !addRecoveryAccountPw}
            >
              {busy ? 'Saving…' : 'Enable recovery'}
            </button>
          }
        >
          <p>
            Add a recovery path so a forgotten Notes passphrase can be recovered using your account password.
            We need both the current Notes passphrase (to confirm it's you) and your account password (so the
            wrap actually works).
          </p>
          <label className="field">
            <span>Current Notes passphrase</span>
            <input
              type="password"
              className="input"
              value={addRecoveryNotesPw}
              onChange={(e) => setAddRecoveryNotesPw(e.target.value)}
              autoFocus
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <span>Account password</span>
            <input
              type="password"
              className="input"
              value={addRecoveryAccountPw}
              onChange={(e) => setAddRecoveryAccountPw(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitAddRecovery();
              }}
            />
          </label>
          {addRecoveryErr ? <p className="text-error">{addRecoveryErr}</p> : null}
        </NotesDialog>
      ) : null}

      {forceResetOpen ? (
        <NotesDialog
          title="Forgot the Notes passphrase?"
          icon={<IcLock size={18} />}
          onClose={() => {
            setForceResetOpen(false);
            setForceResetInput('');
          }}
          footer={
            <button
              type="button"
              className="btn btn--danger"
              onClick={forceReset}
              disabled={forceResetInput !== FORCE_RESET_PHRASE}
            >
              Delete locked notes &amp; reset
            </button>
          }
        >
          <p>
            There is no recovery path for the Notes passphrase — that's the whole point of at-rest encryption.
            If you proceed, we will:
          </p>
          <ul>
            <li>Permanently delete every note that's currently locked (ciphertext gone, unrecoverable).</li>
            <li>Remove the workspace passphrase so you can start fresh.</li>
            <li>Leave every plaintext note untouched.</li>
          </ul>
          <p className="text-warn">
            This cannot be undone. Type <code>{FORCE_RESET_PHRASE}</code> below to confirm.
          </p>
          <label className="field">
            <span>Confirmation</span>
            <input
              type="text"
              className="input"
              value={forceResetInput}
              onChange={(e) => setForceResetInput(e.target.value)}
              placeholder={FORCE_RESET_PHRASE}
              autoFocus
            />
          </label>
        </NotesDialog>
      ) : null}

      {confirmRemoveId ? (
        <NotesDialog
          title="Delete note?"
          onClose={() => setConfirmRemoveId(null)}
          footer={
            <button type="button" className="btn btn--danger" onClick={confirmDelete}>
              Delete
            </button>
          }
        >
          <p>
            {(() => {
              const n = notes.find((x) => x.id === confirmRemoveId);
              if (!n) return 'This note will be removed permanently.';
              if (n.locked) {
                return "This note is locked. Deleting it removes the ciphertext — once it is gone you can't recover it even if you remember the passphrase.";
              }
              return 'This note will be removed permanently. There is no undo.';
            })()}
          </p>
        </NotesDialog>
      ) : null}

      {confirmDisableLock ? (
        <NotesDialog
          title="Remove the Notes passphrase?"
          icon={<IcLock size={18} />}
          onClose={() => {
            setConfirmDisableLock(false);
            setDisableErr(null);
          }}
          footer={
            <button
              type="button"
              className="btn btn--danger"
              onClick={confirmDisableLockAction}
              disabled={busy}
            >
              {busy ? 'Decrypting…' : 'Remove passphrase'}
            </button>
          }
        >
          <p>
            This will decrypt every locked note back to plain text on disk and remove the workspace passphrase.
            After that, anyone who can open this file can read your notes.
          </p>
          <p className="text-warn">
            We will refuse to proceed if even one locked note fails to decrypt — your data will be left unchanged.
          </p>
          {disableErr ? (
            <>
              <p className="text-error">{disableErr}</p>
              <p style={{ marginTop: 12, fontSize: 12 }}>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  onClick={() => setForceResetOpen(true)}
                >
                  Can't recover? Delete locked notes &amp; reset
                </button>
              </p>
            </>
          ) : null}
        </NotesDialog>
      ) : null}
    </>
  );
}
