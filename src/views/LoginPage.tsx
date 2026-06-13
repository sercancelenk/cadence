import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { IcLogIn } from '../components/icons';
import { AuthLocalFirstNotice } from '../components/AuthLocalFirstNotice';
import { Button } from '../components/ui/Button';
import { useAccount } from '../AccountContext';

export function LoginPage() {
  const { user, loading, login, pendingReauth } = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState(pendingReauth?.email ?? '');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');

  // When the session resume detects a missing data key (e.g. process
  // restart after a PIN-protected boot), pre-fill the email so the user
  // doesn't have to remember which address they registered with.
  useEffect(() => {
    if (pendingReauth?.email && !email) setEmail(pendingReauth.email);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReauth?.email]);

  if (!loading && user) {
    return <Navigate to={from === '/login' ? '/' : from} replace />;
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
        <h1 className="auth-card__title">Sign in</h1>
        <AuthLocalFirstNotice variant="login" />
        {pendingReauth ? (
          <div className="auth-banner" role="status" aria-live="polite">
            Welcome back{pendingReauth.displayName ? `, ${pendingReauth.displayName}` : ''}. Your
            workspace is encrypted at rest, so we need your account password once per app launch to
            unlock it. Your notes and todos are safe on disk — they will appear as soon as you sign
            in.
          </div>
        ) : null}
        <form
          className="auth-form"
          onSubmit={async (e: FormEvent) => {
            e.preventDefault();
            setErr('');
            const r = await login(email, password);
            if (r.ok) navigate(from, { replace: true });
            else setErr(r.error ?? 'Sign-in failed.');
          }}
        >
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>
              Password
              <button
                type="button"
                className="auth-link auth-link--inline"
                onClick={() => setShowPwd((v) => !v)}
              >
                {showPwd ? 'Hide' : 'Show'}
              </button>
            </span>
            <input
              className="input"
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {err ? <p className="auth-err">{err}</p> : null}
          <Button type="submit" variant="primary" className="auth-form__submit" icon={<IcLogIn size={18} />}>
            Sign in
          </Button>
        </form>
        <p className="muted small" style={{ marginTop: 16 }}>
          Don&apos;t have an account? <Link to="/register">Create one</Link>
          {' · '}
          <Link to="/recover">Recover with codes</Link>
        </p>
      </div>
    </div>
  );
}
