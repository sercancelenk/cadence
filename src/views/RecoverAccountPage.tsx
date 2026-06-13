import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthLocalFirstNotice } from '../components/AuthLocalFirstNotice';
import { Button } from '../components/ui/Button';
import { useAccount } from '../providers/AccountContext';
import { RECOVERY_CODE_COUNT, normalizeRecoveryCodes } from '../lib/accountRecovery';

export function RecoverAccountPage() {
  const { user, loading, recoverWithCodes } = useAccount();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [codes, setCodes] = useState<string[]>(() => Array(RECOVERY_CODE_COUNT).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return (
      <div className="boot">
        <div className="boot__card">Loading…</div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card auth-card--wide">
        <h1 className="auth-card__title">Recover account</h1>
        <AuthLocalFirstNotice variant="recover" />
        <form
          className="auth-form"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            setErr('');
            if (newPassword.length < 8) {
              setErr('New password must be at least 8 characters.');
              return;
            }
            if (newPassword !== newPassword2) {
              setErr('Passwords do not match.');
              return;
            }
            const normalized = normalizeRecoveryCodes(codes);
            if (normalized.length !== RECOVERY_CODE_COUNT) {
              setErr('Each recovery code field must be filled in.');
              return;
            }
            setBusy(true);
            const r = await recoverWithCodes({ email, codes, newPassword });
            setBusy(false);
            if (!r.ok) {
              setErr(r.error ?? 'Recovery failed.');
              return;
            }
            if (r.needsRecoverySetup) {
              navigate('/settings', {
                replace: true,
                state: { recoverySetupRequired: true },
              });
              return;
            }
            navigate('/', { replace: true });
          }}
        >
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <fieldset className="recovery-codes__fieldset">
            <legend className="small muted">Recovery codes (all {RECOVERY_CODE_COUNT})</legend>
            {codes.map((code, i) => (
              <label key={i} className="field recovery-codes__field">
                <span className="sr-only">Recovery code {i + 1}</span>
                <input
                  className="input recovery-codes__input"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={`Code ${i + 1}`}
                  value={code}
                  onChange={(e) => {
                    const next = [...codes];
                    next[i] = e.target.value;
                    setCodes(next);
                  }}
                />
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>
              New password
              <button type="button" className="auth-link auth-link--inline" onClick={() => setShowPwd((v) => !v)}>
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </span>
            <input
              className="input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input
              className="input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              value={newPassword2}
              onChange={(e) => setNewPassword2(e.target.value)}
              required
            />
          </label>
          {err ? <p className="auth-err">{err}</p> : null}
          <Button type="submit" variant="primary" className="auth-form__submit" disabled={busy}>
            {busy ? 'Recovering…' : 'Reset password'}
          </Button>
        </form>
        <p className="muted small" style={{ marginTop: 16 }}>
          Remember your password? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
