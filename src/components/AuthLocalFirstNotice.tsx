/** Shared copy for sign-in / sign-up — sets expectations for a local-first app. */
export function AuthLocalFirstNotice({ variant }: { variant: 'login' | 'register' | 'recover' }) {
  return (
    <div className="auth-notice" role="note" aria-label="How Cadence accounts work">
      <p className="auth-notice__title">Local-first on this device</p>
      <ul className="auth-notice__list small">
        <li>
          Your workspace is stored <strong>on this computer or browser</strong>, not on our servers.
        </li>
        <li>
          Email is only a <strong>local sign-in label</strong>. We do not verify it and we never send
          mail.
        </li>
        {variant === 'register' ? (
          <>
            <li>
              Your password <strong>encrypts your data</strong> on desktop. Recovery codes are created
              automatically — you will save them in the setup walkthrough right after sign-up.
            </li>
            <li>
              If you lose the password and the recovery codes and have no backup, your data{' '}
              <strong>cannot be restored</strong> — nobody, including us, can open it. Export a backup now and
              then (backups are readable files, so keep them private).
            </li>
          </>
        ) : variant === 'recover' ? (
          <li>
            Recovery works only on <strong>this device</strong> where you saved recovery codes, and it needs{' '}
            <strong>all 8</strong> of them. No cloud service is involved — same model as a browser wallet.
          </li>
        ) : (
          <li>
            Forgot your password? Use your <strong>recovery codes</strong> (if you saved them) or a{' '}
            <strong>backup export</strong> from Settings. With neither, your data cannot be opened.
          </li>
        )}
      </ul>
    </div>
  );
}
