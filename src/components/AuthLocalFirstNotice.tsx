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
          <li>
            Your password <strong>encrypts your data</strong> on desktop. Recovery codes are created
            automatically — you will save them in the setup walkthrough right after sign-up.
          </li>
        ) : variant === 'recover' ? (
          <li>
            Recovery works only on <strong>this device</strong> where you saved recovery codes. No cloud
            service is involved — same model as a browser wallet.
          </li>
        ) : (
          <li>
            Forgot your password? Use your <strong>recovery codes</strong> (if you saved them) or a{' '}
            <strong>backup export</strong> from Settings.
          </li>
        )}
      </ul>
    </div>
  );
}
