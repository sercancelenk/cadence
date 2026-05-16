import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { pbkdf2HashPassword, pbkdf2VerifyPassword } from './lib/passwordPbkdf2';

export type AccountUser = { id: string; email: string; displayName?: string };

type Ctx = {
  user: AccountUser | null;
  loading: boolean;
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
  hasElectronAccounts: boolean;
  hasLegacyData: boolean;
  refreshLegacyHint: () => Promise<void>;
};

const AccountCtx = createContext<Ctx | null>(null);

const DEV_ACCOUNTS_KEY = 'leeadman-browser-accounts';
const DEV_SESSION_KEY = 'leeadman-browser-session';

type StoredUser = AccountUser & { saltB64: string; hashB64: string; createdAt: string };

function useElectronAccount(): boolean {
  return typeof window !== 'undefined' && !!window.leeadman?.accountSession;
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
  const electron = useElectronAccount();

  const refreshLegacyHint = useCallback(async () => {
    if (window.leeadman?.accountHasLegacyData) {
      const r = await window.leeadman.accountHasLegacyData();
      setHasLegacyData(!!r?.has);
    } else {
      setHasLegacyData(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (window.leeadman?.accountSession) {
      const r = await window.leeadman.accountSession();
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
      if (window.leeadman?.accountLogin) {
        const r = await window.leeadman.accountLogin({ email: em, password });
        if (r?.ok && r.user) {
          setUser(r.user);
          return { ok: true as const };
        }
        return { ok: false as const, error: r?.error ?? 'Sign-in failed.' };
      }
      const { users } = await readDevAccounts();
      const u = users.find((x) => x.email === em);
      if (!u) return { ok: false as const, error: 'Incorrect email or password.' };
      const ok = await pbkdf2VerifyPassword(password, u.saltB64, u.hashB64);
      if (!ok) return { ok: false as const, error: 'Incorrect email or password.' };
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

      if (window.leeadman?.accountRegister) {
        const r = await window.leeadman.accountRegister({
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
      writeDevAccounts([...users, row]);
      writeDevSession(id);
      setUser({ id, email: em, displayName: displayName || undefined });
      return { ok: true as const };
    },
    [],
  );

  const logout = useCallback(async () => {
    if (window.leeadman?.accountLogout) {
      await window.leeadman.accountLogout();
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
      if (window.leeadman?.accountChangePassword) {
        const r = await window.leeadman.accountChangePassword({ oldPassword, newPassword });
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

  const v = useMemo(
    () => ({
      user,
      loading,
      refresh,
      login,
      register,
      logout,
      changePassword,
      hasElectronAccounts: electron,
      hasLegacyData,
      refreshLegacyHint,
    }),
    [user, loading, refresh, login, register, logout, changePassword, electron, hasLegacyData, refreshLegacyHint],
  );

  return <AccountCtx.Provider value={v}>{children}</AccountCtx.Provider>;
}

export function useAccount(): Ctx {
  const x = useContext(AccountCtx);
  if (!x) throw new Error('useAccount outside AccountProvider');
  return x;
}
