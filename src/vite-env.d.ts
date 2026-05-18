/// <reference types="vite/client" />

export {};

type AccountUser = { id: string; email: string; displayName?: string };

type UpdaterEvent =
  | { status: 'checking' }
  | { status: 'available'; version?: string; releaseDate?: string }
  | { status: 'not-available'; version?: string }
  | { status: 'downloading'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version?: string }
  | { status: 'error'; message?: string };

export type DataFileInfo = {
  path: string;
  name: string;
  bytes?: number;
  mtime?: string;
  encrypted?: boolean;
  decryptable?: boolean;
  parsedOk?: boolean;
  counts?: {
    teams?: number;
    people?: number;
    items?: number;
    todoGroups?: number;
    todoItems?: number;
    lastTeamId?: string;
    profileName?: string;
  } | null;
  error?: string;
};

export type DataSources = {
  userDataPath: string;
  uid: string | null;
  live: DataFileInfo | null;
  legacy: DataFileInfo | null;
  backups: DataFileInfo[];
  otherUsers: DataFileInfo[];
};

export type LoadResult =
  | { ok: true; data: unknown; encrypted: boolean; reason?: string }
  | { ok: false; reason: 'no-key' | 'bad-key' | 'parse' | 'io' | 'no-session'; encrypted?: boolean; error?: string };

export type SaveError = { ok: false; reason?: string; error?: string };

export type CacheBreakdownEntry = { label: string; bytes: number; files: number };

export type CacheStats =
  | { ok: false; error: string }
  | {
      ok: true;
      userDataPath: string;
      dataFileBytes: number;
      legacyBytes: number;
      backupsSelfBytes: number;
      backupsSelfCount: number;
      backupsAllBytes: number;
      chromiumBytes: number;
      chromiumBreakdown: CacheBreakdownEntry[];
      totalBytes: number;
      totalFiles: number;
    };

export type CacheClearResult =
  | { ok: false; error: string }
  | { ok: true; chromiumBytes: number; chromiumBreakdown: CacheBreakdownEntry[] };

interface ImportMetaEnv {
  /** "1" when the bundle is built for the PWA (GitHub Pages) target. */
  readonly LEEADMAN_PWA?: string;
}

declare global {
  interface Window {
    leeadman?: {
      loadData: () => Promise<unknown>;
      loadDataResult?: () => Promise<LoadResult>;
      saveData: (data: unknown) => Promise<boolean>;
      dataListSources?: () => Promise<DataSources>;
      dataPreviewSource?: (payload: { filePath: string }) => Promise<{ ok: boolean; info?: DataFileInfo; error?: string }>;
      dataRestoreFromSource?: (payload: { filePath: string }) => Promise<{ ok: boolean; restoredFrom?: string; error?: string; reason?: string }>;
      openUserDataFolder?: () => Promise<{ ok: boolean }>;
      cacheStats?: () => Promise<CacheStats>;
      clearChromiumCache?: () => Promise<CacheClearResult>;
      onSaveError?: (cb: (event: SaveError) => void) => () => void;
      showNotification: (opts: { title?: string; body?: string }) => Promise<boolean>;
      userDataPath: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
      installUpdate: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
      onUpdaterEvent: (cb: (event: UpdaterEvent) => void) => () => void;
      authStatus: () => Promise<{ enabled: boolean }>;
      authSetPin: (payload: { pin: string }) => Promise<{ ok: boolean; error?: string }>;
      authVerify: (payload: { pin: string }) => Promise<{ ok: boolean }>;
      authClear: (payload: { pin: string }) => Promise<{ ok: boolean; error?: string }>;
      authResetWithAccountPassword: (payload: { password: string }) => Promise<{ ok: boolean; error?: string }>;
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
