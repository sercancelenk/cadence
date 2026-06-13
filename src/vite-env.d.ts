/// <reference types="vite/client" />

declare module '*.md?raw' {
  const content: string;
  export default content;
}

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
    /** Subset of todoGroups that have `archived: true`. */
    todoGroupsArchived?: number;
    todoItems?: number;
    notes?: number;
    /** Subset of notes that have `locked: true`. */
    notesLocked?: number;
    /**
     * Whether the file carries a `notesLock` object. Useful for spotting
     * orphan lock state (file has lock metadata but no locked notes →
     * the lock prompt would never unlock anything). New `normalizeData`
     * auto-cleans this on load, but older files may still have it.
     */
    hasNotesLock?: boolean;
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
  | { ok: true; data: unknown; encrypted: boolean; reason?: string; writeGeneration?: number }
  | {
      ok: false;
      reason: 'no-key' | 'bad-key' | 'parse' | 'io' | 'no-session';
      encrypted?: boolean;
      error?: string;
      writeGeneration?: number;
    };

export type SaveDataResult =
  | boolean
  | { ok: true; writeGeneration?: number }
  | { ok: false; reason?: string; error?: string; writeGeneration?: number };

export type SaveError = { ok: false; reason?: string; error?: string; writeGeneration?: number };

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
      attachmentsSelfBytes: number;
      attachmentsSelfCount: number;
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
  readonly CADENCE_PWA?: string;
  /** @deprecated Old name retained during the Leeadman → Cadence rename. */
  readonly LEEADMAN_PWA?: string;
  /**
   * Build flavor, controlling which feature surface is exposed at runtime.
   *
   * - `""` (default, public build) — full feature surface; user / policy
   *   picks the active preset.
   * - `"enterprise"` — locked build for shared / company devices. The
   *   renderer treats the workspace as if a `work-strict` policy were in
   *   effect at all times; the in-app preset picker is hidden and the
   *   onboarding welcome tour skips its "where will you use Cadence?"
   *   step. A real policy.json on disk may still selectively re-enable
   *   individual flags (e.g. internal Azure OpenAI), but the baseline
   *   stays locked.
   *
   * Set via `CADENCE_DISTRIBUTION=enterprise` in the build environment
   * (see `package.json` → `build:enterprise`).
   */
  readonly CADENCE_DISTRIBUTION?: '' | 'enterprise';
}

/**
 * Electron IPC surface. Exposed under both `window.cadence` (canonical, new
 * name) and `window.leeadman` (legacy alias kept during the rename so the
 * renderer doesn't need a full sweep). New renderer code should use
 * `window.cadence`.
 */
interface CadenceApi {
      loadData: () => Promise<unknown>;
      loadDataResult?: () => Promise<LoadResult>;
      /**
       * Persist the renderer's snapshot to disk.
       *
       * @param expectedUid Optional defence-in-depth guard. When set, the
       *   main process refuses the write if the active session has flipped
       *   to a different user between the renderer queueing the save and
       *   the IPC actually executing. Critical for the fast logout → login
       *   race; new callers should always pass the user ID they believed
       *   was active when they queued the save.
       */
      saveData: (
        data: unknown,
        expectedUid?: string,
        expectedGeneration?: number,
      ) => Promise<import('./lib/appDataSave').SaveDataResult>;
      /** Blocks until main process fsync completes (Electron quit/update path). */
      flushPendingSaveSync?: (
        data: unknown,
        expectedUid?: string,
        expectedGeneration?: number,
      ) => import('./lib/appDataSave').SaveDataResult;
      onRequestFlush?: (cb: () => void) => () => void;
      notifyFlushDone?: () => void;
      dataListSources?: () => Promise<DataSources>;
      dataPreviewSource?: (payload: { filePath: string }) => Promise<{ ok: boolean; info?: DataFileInfo; error?: string }>;
      dataRestoreFromSource?: (payload: { filePath: string }) => Promise<{ ok: boolean; restoredFrom?: string; error?: string; reason?: string }>;
      openUserDataFolder?: () => Promise<{ ok: boolean }>;
      revealInOS?: (payload: { filePath: string }) => Promise<{ ok: boolean; error?: string }>;
      cacheStats?: () => Promise<CacheStats>;
      clearChromiumCache?: () => Promise<CacheClearResult>;
      onSaveError?: (cb: (event: SaveError) => void) => () => void;
      onRemoteUpdated?: (cb: (event: { writeGeneration?: number }) => void) => () => void;
      showNotification: (opts: { title?: string; body?: string }) => Promise<boolean>;
  reminderSyncStatus?: () => Promise<import('./lib/reminderDelivery/types').ReminderSyncStatus>;
  requestReminderPermission?: () => Promise<{ ok: boolean; granted: boolean; error?: string | null }>;
  setReminderBackgroundSettings?: (
    settings: import('./lib/reminderDelivery/types').ReminderBackgroundSettings,
  ) => Promise<{ ok: boolean; error?: string; backgroundMode?: boolean; launchAtLogin?: boolean; hideToTrayOnClose?: boolean }>;
      syncReminders?: (data: unknown) => Promise<{ ok: boolean }>;
      cancelReminderSlots?: (itemId: string) => Promise<{ ok: boolean; error?: string }>;
      onReminderEvent?: (cb: (event: { type: string; data?: unknown; slotKey?: string }) => void) => () => void;
      onDeepLink?: (cb: (event: { path: string }) => void) => () => void;
      userDataPath: () => Promise<string>;
      attachmentWrite?: (payload: {
        attachmentId: string;
        dataBase64: string;
        mimeType?: string;
        userId?: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      attachmentRead?: (payload: {
        attachmentId: string;
      }) => Promise<{ ok: boolean; dataBase64?: string; mimeType?: string; error?: string }>;
      attachmentImportPortable?: (payload: {
        attachmentId: string;
        dataBase64: string;
        encrypted?: boolean;
      }) => Promise<{ ok: boolean; error?: string }>;
      attachmentGc?: () => Promise<{ ok: boolean; pruned?: number; error?: string }>;
      noteHistoryList?: (payload: {
        noteId: string;
      }) => Promise<{ ok: boolean; revisions?: import('./lib/noteRevision/types').NoteRevisionMeta[]; error?: string }>;
      noteHistoryRead?: (payload: {
        noteId: string;
        revisionId: string;
      }) => Promise<{ ok: boolean; revision?: import('./lib/noteRevision/types').NoteRevisionPayload; error?: string }>;
      noteHistoryAppend?: (
        payload: import('./lib/noteRevision/types').NoteRevisionWriteInput,
      ) => Promise<{ ok: boolean; revisionId?: string; pruned?: number; error?: string }>;
      noteHistoryPurge?: (payload: {
        noteId: string;
      }) => Promise<{ ok: boolean; purged?: boolean; error?: string }>;
      exportDataBundle?: (
        data: unknown,
      ) => Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      importDataBundle?: () => Promise<{
        ok: boolean;
        importedFrom?: string;
        canceled?: boolean;
        error?: string;
        attachmentsRestored?: number;
        attachmentsSkipped?: number;
      }>;
      importWorkspace?: (
        payload: unknown,
      ) => Promise<{
        ok: boolean;
        writeGeneration?: number;
        error?: string;
        reason?: string;
        attachmentsRestored?: number;
      }>;
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
      installUpdate: () => Promise<{ ok: boolean; reason?: string; error?: string }>;
      onUpdaterEvent: (cb: (event: UpdaterEvent) => void) => () => void;
      authStatus: () => Promise<{ enabled: boolean }>;
      authSetPin: (payload: { pin: string }) => Promise<{ ok: boolean; error?: string }>;
      authVerify: (payload: { pin: string }) => Promise<{ ok: boolean }>;
      authClear: (payload: { pin: string }) => Promise<{ ok: boolean; error?: string }>;
      authResetWithAccountPassword: (payload: { password: string }) => Promise<{ ok: boolean; error?: string }>;
      accountSession: () => Promise<{
        user: AccountUser | null;
        /**
         * Set when the on-disk session is for an encrypted account but the
         * in-memory data key was lost across the process restart. The
         * renderer should route the user to the Login screen (so the password
         * can be re-derived) instead of pretending the resume succeeded —
         * see `account:session` in `electron/main.cjs` for the rationale.
         */
        requiresAuth?: boolean;
        email?: string;
        displayName?: string;
      }>;
      accountRegister: (payload: {
        email: string;
        password: string;
        displayName?: string;
        migrateLegacy?: boolean;
      }) => Promise<{ ok: boolean; user?: AccountUser; error?: string; warn?: string; recoveryCodes?: string[] }>;
      accountLogin: (payload: { email: string; password: string }) => Promise<{ ok: boolean; user?: AccountUser; error?: string }>;
      accountLogout: () => Promise<{ ok: boolean }>;
      accountHasLegacyData: () => Promise<{ has: boolean }>;
      accountChangePassword: (payload: {
        oldPassword: string;
        newPassword: string;
      }) => Promise<{ ok: boolean; error?: string }>;
      accountVerifyPassword: (payload: { password: string }) => Promise<{ ok: boolean; error?: string }>;
      accountRecoverWithCodes: (payload: {
        email: string;
        codes: string[];
        newPassword: string;
      }) => Promise<{ ok: boolean; user?: AccountUser; error?: string; needsRecoverySetup?: boolean }>;
      accountSetupRecovery: (payload: {
        password: string;
      }) => Promise<{ ok: boolean; recoveryCodes?: string[]; error?: string }>;
      accountConfirmRecoverySetup: () => Promise<{ ok: boolean; error?: string }>;
      accountGetRecoveryStatus: () => Promise<{
        signedIn?: boolean;
        configured: boolean;
        configuredAt?: string;
      }>;
      /**
       * Inspect the per-user "stay signed in" preference and whether the
       * OS keychain on this machine can actually back it. The renderer
       * uses this to render the Settings toggle in the correct initial
       * state and to surface a hint when the platform cannot persist a
       * session key (Linux without libsecret).
       *
       * `signedIn=false` when there is no active account session — the
       * caller should treat this as "no preference yet".
       */
      accountGetRememberMe: () => Promise<{
        available: boolean;
        enabled: boolean;
        signedIn: boolean;
      }>;
      /**
       * Flip the per-user "stay signed in" preference. Enabling requires
       * an active session because we persist the current in-memory data
       * key into the OS keychain at the same time; if that step fails
       * the flag is NOT set so the user's expectations stay accurate.
       */
      accountSetRememberMe: (payload: { value: boolean }) => Promise<{
        ok: boolean;
        available: boolean;
        enabled?: boolean;
        error?: string;
      }>;
      /**
       * Reads the enterprise / shared-device policy file from disk (5-layer
       * search; see `loadPolicy` in `electron/main.cjs`). Returns `null`
       * when no valid policy is found, in which case the renderer falls
       * back to the user's onboarding preset or the personal default.
       *
       * The shape matches `parsePolicy()` in `src/lib/features.tsx` — both
       * sides validate independently so a malformed file can never lock the
       * user out of their workspace.
       */
      policyGet: () => Promise<{
        path: string;
        managedBy?: string;
        preset?: 'personal' | 'work-standard' | 'work-strict';
        features?: {
          sync?: { lan?: boolean; cloud?: boolean };
          ai?: boolean;
          dataExport?: boolean;
          updateCheck?: boolean;
        };
      } | null>;
      syncStatus: () => Promise<{
        enabled: boolean;
        running: boolean;
        port: number | null;
        token: string | null;
        ips: string[];
        tls: {
          fingerprint: string | null;
          notAfter: string | null;
        } | null;
      }>;
      syncEnable: () => Promise<{
        ok: boolean;
        token?: string;
        port?: number | null;
        ips?: string[];
        tls?: { fingerprint: string | null; notAfter: string | null };
        error?: string;
      }>;
      syncDisable: () => Promise<{ ok: boolean }>;
      syncRotateToken: () => Promise<{ ok: boolean; token?: string }>;
}

declare global {
  interface Window {
    cadence?: CadenceApi;
    /** @deprecated Old name; prefer `window.cadence`. Same object underneath. */
    leeadman?: CadenceApi;
  }
}
