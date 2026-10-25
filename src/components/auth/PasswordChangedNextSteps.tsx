import { Link } from 'react-router-dom';

type Props = {
  /** The password change made the old recovery codes useless. */
  recoveryCodesInvalidated: boolean;
  /** Notes passphrase recovery could not be moved to the new password and still needs the old one. */
  notesRecoveryNeedsRenewal: boolean;
};

/** What to do after a password change, as links rather than a sentence to remember. */
export function PasswordChangedNextSteps({ recoveryCodesInvalidated, notesRecoveryNeedsRenewal }: Props) {
  return (
    <div className="form-msg form-msg--ok small" role="status">
      <p style={{ margin: 0 }}>Password updated.</p>
      {recoveryCodesInvalidated || notesRecoveryNeedsRenewal ? (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {recoveryCodesInvalidated ? (
            <li>
              Your previous recovery codes no longer work. <Link to="/settings#recovery-codes">Create new recovery codes</Link>
              {' '}so you can still get in if you forget this password.
            </li>
          ) : null}
          {notesRecoveryNeedsRenewal ? (
            <li>
              Notes passphrase recovery still needs your previous account password.{' '}
              <Link to="/notes">Renew Notes recovery</Link> to use the new one.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
