import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { IcPlus } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAccount } from '../AccountContext';

export function RegisterPage() {
  const { user, loading, register, hasLegacyData, refreshLegacyHint } = useAccount();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [migrateLegacy, setMigrateLegacy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    void refreshLegacyHint();
  }, [refreshLegacyHint]);

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
        <h1 className="auth-card__title">Create account</h1>
        <p className="muted">Sign up with email and password to create an account on this device. Your data is stored locally in your user file.</p>
        <form
          className="auth-form"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            setErr('');
            if (password.length < 8) {
              setErr('Password must be at least 8 characters.');
              return;
            }
            if (password !== password2) {
              setErr('Passwords do not match.');
              return;
            }
            const r = await register({ email, password, displayName, migrateLegacy: hasLegacyData ? migrateLegacy : false });
            if (r.ok) {
              if (displayName.trim()) sessionStorage.setItem('leeadman-profile-seed', displayName.trim());
              navigate('/', { replace: true });
            } else setErr(r.error ?? 'Sign-up failed.');
            if (r.warn) window.alert(r.warn);
          }}
        >
          <label className="field">
            <span>Display name</span>
            <input className="input" placeholder="e.g. Jane Doe" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>Password (8+ characters)</span>
            <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label className="field">
            <span>Confirm password</span>
            <input className="input" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
          </label>
          {hasLegacyData ? (
            <label className="row" style={{ gap: 8, marginTop: 4 }}>
              <input type="checkbox" checked={migrateLegacy} onChange={(e) => setMigrateLegacy(e.target.checked)} />
              <span className="small">Import legacy single-file data (leeadman-data.json) into this account</span>
            </label>
          ) : null}
          {err ? <p className="auth-err">{err}</p> : null}
          <Button type="submit" variant="primary" className="auth-form__submit" icon={<IcPlus size={18} />}>
            Create account
          </Button>
        </form>
        <p className="muted small" style={{ marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
