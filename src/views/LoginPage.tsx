import { FormEvent, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { IcLogIn } from '../components/icons';
import { Button } from '../components/ui/Button';
import { useAccount } from '../AccountContext';

export function LoginPage() {
  const { user, loading, login } = useAccount();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');

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
        <p className="muted">Your data is stored locally on this device, in a file tied to your account.</p>
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
        </p>
      </div>
    </div>
  );
}
