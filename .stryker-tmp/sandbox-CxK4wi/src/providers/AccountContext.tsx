// @ts-nocheck
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { STORAGE_PREFIX } from '../lib/appBranding';
import { pbkdf2HashPassword, pbkdf2VerifyPassword } from '../lib/passwordPbkdf2';

export type AccountUser = { id: string; email: string; displayName?: string };

/**
 * Surfaces a session-resume that could not derive the data key. The renderer
 * routes the user to /login with the email pre-filled instead of dropping
 * them into an empty workspace (which is what happened before — and was the
 * single root cause behind "PIN açtım, restart yaptım, bütün datam gitti").
 */
export type PendingReauth = { email: string; displayName?: string };

type Ctx = {
  user: AccountUser | null;
  loading: boolean;
  pendingReauth: PendingReauth | null;
  clearPendingReauth: () => void;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (opts: {
    email: string;
    password: string;
    displayName: string;
    migrateLegacy?: boolean;
  }) => Promise<{ ok: boolean; error?: string; warn?: string }>;
  logout: () => Promise<void>;
  changePassword: (opts: {
    oldPassword: string;
    newPassword: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Verify the *current* account password without performing any state change. */
  verifyPassword: (password: string) => Promise<{ ok: boolean; error?: string }>;
  hasElectronAccounts: boolean;
  hasLegacyData: boolean;
  refreshLegacyHint: () => Promise<void>;
};

const AccountCtx = createContext<Ctx | null>(null);

const DEV_ACCOUNTS_KEY = `${STORAGE_PREFIX}-browser-accounts`;
const DEV_SESSION_KEY = `${STORAGE_PREFIX}-browser-session`;

type StoredUser = AccountUser & { saltB64: string; hashB64: string; createdAt: string };

function useElectronAccount(): boolean {
  return typeof window !== 'undefined' && !!window.cadence?.accountSession;
}

async function readDevAccounts(): Promise<{ users: StoredUser[] }> {
  try {
    const raw = localStorage.getItem(DEV_ACCOUNTS_KEY);
    if (!raw) return { users: [] };
    const o = JSON.parse(raw) as { users?: StoredUser[] };
    return { users: Array.isArray(o.users) ? o.users : [] };
  } catch {
    return { users: [] };
  }
}

function writeDevAccounts(users: StoredUser[]) {
  localStorage.setItem(DEV_ACCOUNTS_KEY, JSON.stringify({ users }));
}

function readDevSessionUserId(): string | null {
  try {
    const raw = localStorage.getItem(DEV_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as { userId?: string };
    return typeof o.userId === 'string' && o.userId ? o.userId : null;
  } catch {
    return null;
  }
}

function writeDevSession(userId: string | null) {
  if (!userId) localStorage.removeItem(DEV_SESSION_KEY);
  else localStorage.setItem(DEV_SESSION_KEY, JSON.stringify({ userId }));
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasLegacyData, setHasLegacyData] = useState(false);
  const [pendingReauth, setPendingReauth] = useState<PendingReauth | null>(null);
  const electron = useElectronAccount();

  const clearPendingReauth = useCallback(() => setPendingReauth(null), []);

  const refreshLegacyHint = useCallback(async () => {
    if (window.cadence?.accountHasLegacyData) {
      const r = await window.cadence.accountHasLegacyData();
      setHasLegacyData(!!r?.has);
    } else {
      setHasLegacyData(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (window.cadence?.accountSession) {
      const r = await window.cadence.accountSession();
      // `requiresAuth` means: a session ID is on disk but the account is
      // encrypted and we have no key in memory. We MUST NOT pretend the
      // user is signed in (that's the bug that made every restart look
      // like data loss). Surface the email so /login can pre-fill it.
      if (!r?.user && r?.requiresAuth && typeof r.email === 'string' && r.email) {
        setPendingReauth({ email: r.email, displayName: r.displayName });
      } else {
        setPendingReauth(null);
      }
      setUser(r?.user ?? null);
      setLoading(false);
      await refreshLegacyHint();
      return;
    }
    const uid = readDevSessionUserId();
    if (!uid) {
      setUser(null);
      setLoading(false);
      return;
    }
    const { users } = await readDevAccounts();
    const u = users.find((x) => x.id === uid);
    if (!u) {
      writeDevSession(null);
      setUser(null);
    } else {
      setUser({ id: u.id, email: u.email, displayName: u.displayName });
    }
    setLoading(false);
  }, [refreshLegacyHint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      const em = email.trim().toLowerCase();
      if (window.cadence?.accountLogin) {
        const r = await window.cadence.accountLogin({ email: em, password });
        if (r?.ok && r.user) {
          setUser(r.user);
          return { ok: true as const };
        }
        return { ok: false as const, error: r?.error ?? 'Sign-in failed.' };
      }
      const { users } = await readDevAccounts();
      const u = users.find((x) => x.email === em);
      if (!u) {
        // Distinct messages help the user (and us) diagnose mobile Safari
        // localStorage / autofill issues. Defence-in-depth doesn't apply
        // here because every account file lives on this user's own device.
        console.warn(
          '[cadence] login: no account for email',
          em,
          '— stored emails:',
          users.map((x) => x.email),
        );
        return {
          ok: false as const,
          error: `No account is registered for ${em} on this device. Did you create the account in another browser, or in private/incognito mode?`,
        };
      }
      const ok = await pbkdf2VerifyPassword(password, u.saltB64, u.hashB64);
      if (!ok) {
        console.warn('[cadence] login: password mismatch for', em, '(stored hash length:', u.hashB64.length, ')');
        return { ok: false as const, error: 'Incorrect password for this account.' };
      }
      writeDevSession(u.id);
      setUser({ id: u.id, email: u.email, displayName: u.displayName });
      return { ok: true as const };
    },
    [],
  );

  const register = useCallback(
    async (opts: { email: string; password: string; displayName: string; migrateLegacy?: boolean }) => {
      const em = opts.email.trim().toLowerCase();
      const displayName = opts.displayName.trim();
      if (opts.password.length < 8) return { ok: false as const, error: 'Password must be at least 8 characters.' };
      if (!em.includes('@')) return { ok: false as const, error: 'Please enter a valid email.' };

      if (window.cadence?.accountRegister) {
        const r = await window.cadence.accountRegister({
          email: em,
          password: opts.password,
          displayName,
          migrateLegacy: opts.migrateLegacy,
        });
        if (r?.ok && r.user) {
          setUser(r.user);
          return { ok: true as const, warn: r.warn };
        }
        return { ok: false as const, error: r?.error ?? 'Sign-up failed.' };
      }

      const { users } = await readDevAccounts();
      if (users.some((u) => u.email === em)) return { ok: false as const, error: 'An account already exists for this email.' };
      const { saltB64, hashB64 } = await pbkdf2HashPassword(opts.password);
      const id = crypto.randomUUID();
      const row: StoredUser = {
        id,
        email: em,
        displayName: displayName || undefined,
        saltB64,
        hashB64,
        createdAt: new Date().toISOString(),
      };
      try {
        writeDevAccounts([...users, row]);
        writeDevSession(id);
      } catch (err) {
        // localStorage can throw on iOS Safari (private mode, quota, ITP
        // eviction). Surface this rather than silently leaving the user in
        // an "I registered but can't log in" loop.
        return {
          ok: false as const,
          error: `Could not store the new account on this device (${(err as Error)?.message ?? err}). Make sure you are not in private/incognito mode and try again.`,
        };
      }
      // Sanity-check: read back what we wrote so a bug here surfaces at
      // registration time, not three steps later when the user is locked out.
      const verify = await readDevAccounts();
      if (!verify.users.some((u) => u.email === em)) {
        return {
          ok: false as const,
          error: 'The browser did not persist the new account (this can happen in private mode or with strict storage settings).',
        };
      }
      setUser({ id, email: em, displayName: displayName || undefined });
      return { ok: true as const };
    },
    [],
  );

  const logout = useCallback(async () => {
    if (window.cadence?.accountLogout) {
      await window.cadence.accountLogout();
    } else {
      writeDevSession(null);
    }
    setUser(null);
  }, []);

  const changePassword = useCallback(
    async ({ oldPassword, newPassword }: { oldPassword: string; newPassword: string }) => {
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return { ok: false as const, error: 'New password must be at least 8 characters.' };
      }
      if (oldPassword === newPassword) {
        return { ok: false as const, error: 'New password must be different from the current one.' };
      }
      if (window.cadence?.accountChangePassword) {
        const r = await window.cadence.accountChangePassword({ oldPassword, newPassword });
        return r?.ok ? { ok: true as const } : { ok: false as const, error: r?.error ?? 'Could not change password.' };
      }
      // Browser dev fallback: verify against stored PBKDF2 hash, then rotate.
      if (!user) return { ok: false as const, error: 'Not signed in.' };
      const { users } = await readDevAccounts();
      const u = users.find((x) => x.id === user.id);
      if (!u) return { ok: false as const, error: 'Account not found.' };
      const ok = await pbkdf2VerifyPassword(oldPassword, u.saltB64, u.hashB64);
      if (!ok) return { ok: false as const, error: 'Current password is incorrect.' };
      const { saltB64, hashB64 } = await pbkdf2HashPassword(newPassword);
      const next: StoredUser = { ...u, saltB64, hashB64 };
      writeDevAccounts(users.map((x) => (x.id === u.id ? next : x)));
      return { ok: true as const };
    },
    [user],
  );

  const verifyPassword = useCallback(
    async (password: string) => {
      if (typeof password !== 'string' || !password) {
        return { ok: false as const, error: 'Account password is required.' };
      }
      if (window.cadence?.accountVerifyPassword) {
        const r = await window.cadence.accountVerifyPassword({ password });
        return r?.ok
          ? { ok: true as const }
          : { ok: false as const, error: r?.error ?? 'Could not verify account password.' };
      }
      // Browser dev fallback: verify against stored PBKDF2 hash for the
      // currently signed-in user.
      if (!user) return { ok: false as const, error: 'Not signed in.' };
      const { users } = await readDevAccounts();
      const u = users.find((x) => x.id === user.id);
      if (!u) return { ok: false as const, error: 'Account not found.' };
      const ok = await pbkdf2VerifyPassword(password, u.saltB64, u.hashB64);
      return ok
        ? { ok: true as const }
        : { ok: false as const, error: 'Incorrect account password.' };
    },
    [user],
  );

  // Once the user actually signs in, the pending re-auth banner is moot —
  // clear it so the login screen and any consumers don't flash stale state.
  useEffect(() => {
    if (user && pendingReauth) setPendingReauth(null);
  }, [user, pendingReauth]);

  const v = useMemo(
    () => ({
      user,
      loading,
      pendingReauth,
      clearPendingReauth,
      refresh,
      login,
      register,
      logout,
      changePassword,
      verifyPassword,
      hasElectronAccounts: electron,
      hasLegacyData,
      refreshLegacyHint,
    }),
    [user, loading, pendingReauth, clearPendingReauth, refresh, login, register, logout, changePassword, verifyPassword, electron, hasLegacyData, refreshLegacyHint],
  );

  return <AccountCtx.Provider value={v}>{children}</AccountCtx.Provider>;
}

export function useAccount(): Ctx {
  const x = useContext(AccountCtx);
  if (!x) throw new Error('useAccount outside AccountProvider');
  return x;
}
