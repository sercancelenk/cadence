/// <reference types="vite/client" />

export {};

type AccountUser = { id: string; email: string; displayName?: string };

interface ImportMetaEnv {
  /** "1" when the bundle is built for the PWA (GitHub Pages) target. */
  readonly LEEADMAN_PWA?: string;
}

declare global {
  interface Window {
    leeadman?: {
      loadData: () => Promise<unknown>;
      saveData: (data: unknown) => Promise<boolean>;
      showNotification: (opts: { title?: string; body?: string }) => Promise<boolean>;
      userDataPath: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
      authStatus: () => Promise<{ enabled: boolean }>;
      authSetPin: (payload: { pin: string }) => Promise<{ ok: boolean; error?: string }>;
      authVerify: (payload: { pin: string }) => Promise<{ ok: boolean }>;
      authClear: (payload: { pin: string }) => Promise<{ ok: boolean; error?: string }>;
      accountSession: () => Promise<{ user: AccountUser | null }>;
      accountRegister: (payload: {
        email: string;
        password: string;
        displayName?: string;
        migrateLegacy?: boolean;
      }) => Promise<{ ok: boolean; user?: AccountUser; error?: string; warn?: string }>;
      accountLogin: (payload: { email: string; password: string }) => Promise<{ ok: boolean; user?: AccountUser; error?: string }>;
      accountLogout: () => Promise<{ ok: boolean }>;
      accountHasLegacyData: () => Promise<{ has: boolean }>;
      accountChangePassword: (payload: {
        oldPassword: string;
        newPassword: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      syncStatus: () => Promise<{
        enabled: boolean;
        running: boolean;
        port: number | null;
        token: string | null;
        ips: string[];
      }>;
      syncEnable: () => Promise<{
        ok: boolean;
        token?: string;
        port?: number | null;
        ips?: string[];
        error?: string;
      }>;
      syncDisable: () => Promise<{ ok: boolean }>;
      syncRotateToken: () => Promise<{ ok: boolean; token?: string }>;
    };
  }
}
