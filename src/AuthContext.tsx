import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { IcLock } from './components/icons';
import { Button } from './components/ui/Button';

export type AuthPhase = 'loading' | 'open' | 'locked';

type Ctx = {
  phase: AuthPhase;
  pinEnabled: boolean;
  refresh: () => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  lockSession: () => void;
};

const SessionCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('loading');
  const [pinEnabled, setPinEnabled] = useState(false);

  const refresh = useCallback(async () => {
    const api = window.leeadman;
    if (!api?.authStatus) {
      setPinEnabled(false);
      setPhase('open');
      return;
    }
    try {
      const s = await api.authStatus();
      const en = !!s?.enabled;
      setPinEnabled(en);
      setPhase(en ? 'locked' : 'open');
    } catch {
      setPinEnabled(false);
      setPhase('open');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlockWithPin = useCallback(async (pin: string) => {
    const r = await window.leeadman?.authVerify?.({ pin });
    if (r?.ok) {
      setPhase('open');
      return true;
    }
    return false;
  }, []);

  const lockSession = useCallback(() => {
    if (pinEnabled) setPhase('locked');
  }, [pinEnabled]);

  const v = useMemo(
    () => ({ phase, pinEnabled, refresh, unlockWithPin, lockSession }),
    [phase, pinEnabled, refresh, unlockWithPin, lockSession],
  );

  return <SessionCtx.Provider value={v}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const x = useContext(SessionCtx);
  if (!x) throw new Error('useSession outside AuthProvider');
  return x;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { phase, unlockWithPin, refresh } = useSession();
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [recoveryPwd, setRecoveryPwd] = useState('');
  const [recoveryErr, setRecoveryErr] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    const ok = await unlockWithPin(pin);
    if (ok) {
      setPin('');
      setAttempts(0);
      return;
    }
    const next = attempts + 1;
    setAttempts(next);
    if (next >= 3) {
      // After 3 failed attempts, surface recovery upfront — typing the wrong
      // PIN three times almost always means the user has forgotten it (or hit
      // the now-fixed normalize bug) and would otherwise be locked out.
      setErr('Incorrect PIN. Reset it with your account password below.');
      setRecovering(true);
    } else {
      setErr(`Incorrect PIN. ${3 - next} more attempt${3 - next === 1 ? '' : 's'} before recovery opens.`);
    }
  };

  const submitRecovery = async (e: FormEvent) => {
    e.preventDefault();
    setRecoveryErr('');
    setRecoveryBusy(true);
    try {
      const r = await window.leeadman?.authResetWithAccountPassword?.({ password: recoveryPwd });
      if (!r) {
        setRecoveryErr('Recovery is only available in the desktop app.');
        return;
      }
      if (r.ok) {
        setRecoveryPwd('');
        setRecovering(false);
        await refresh();
      } else {
        setRecoveryErr(r.error || 'Could not reset PIN.');
      }
    } finally {
      setRecoveryBusy(false);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="boot">
        <div className="boot__card">Checking lock status…</div>
      </div>
    );
  }

  if (phase === 'locked') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <h1 className="auth-card__title">Leeadman</h1>
          {!recovering ? (
            <>
              <p className="muted">PIN protection is enabled on this device. Enter your PIN to continue.</p>
              <form onSubmit={submit}>
                <input
                  className="input"
                  style={{ width: '100%', marginTop: 12 }}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
                {err ? <p className="auth-err">{err}</p> : null}
                <Button variant="primary" className="auth-form__submit auth-unlock-submit" type="submit" icon={<IcLock size={18} />}>
                  Unlock
                </Button>
              </form>
              <button
                type="button"
                className="auth-link"
                onClick={() => { setErr(''); setRecovering(true); }}
              >
                Forgot PIN? Reset with account password
              </button>
            </>
          ) : (
            <>
              <p className="muted">
                Enter your <strong>account password</strong> to remove the PIN. Your data is already
                encrypted with this password, so resetting the PIN doesn't grant any new access.
              </p>
              <form onSubmit={submitRecovery}>
                <input
                  className="input"
                  style={{ width: '100%', marginTop: 12 }}
                  type="password"
                  autoComplete="current-password"
                  placeholder="Account password"
                  value={recoveryPwd}
                  onChange={(e) => setRecoveryPwd(e.target.value)}
                  disabled={recoveryBusy}
                />
                {recoveryErr ? <p className="auth-err">{recoveryErr}</p> : null}
                <Button
                  variant="primary"
                  className="auth-form__submit auth-unlock-submit"
                  type="submit"
                  icon={<IcLock size={18} />}
                  disabled={recoveryBusy}
                >
                  {recoveryBusy ? 'Resetting…' : 'Remove PIN'}
                </Button>
              </form>
              <button
                type="button"
                className="auth-link"
                onClick={() => { setRecoveryErr(''); setRecovering(false); }}
              >
                Back to PIN entry
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
