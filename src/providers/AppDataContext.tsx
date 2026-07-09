import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useAccount } from './AccountContext';
import { STORAGE_PREFIX } from '../lib/appBranding';
import { registerFlushPendingSave, runBeforeFlushHooks, unregisterFlushPendingSave } from '../lib/pendingSaveFlush';
import { revokeAttachmentBlobUrls } from '../lib/richTextAttachmentStore';
import { isReminderSlotNotified, reminderNotifyKey } from '../lib/reminderNotify';
import { advanceReminderOnce } from '../lib/reminderRecurrence';
import { supportsPwaOsSchedule } from '../lib/reminderDelivery/capabilities';
import { collectFutureReminderSlots } from '../lib/reminderDelivery/collectReminderSlots';
import { collectPwaDeliveredSlotKeys } from '../lib/reminderDelivery/pwaReminderCatchUp';
import { cancelPendingReminderSlots } from '../lib/reminderDelivery/cancelReminderSlots';
import { mergeReminderEventIntoAppData } from '../lib/reminderDelivery/mergeReminderEvent';
import { createAppDataSelectionMemo } from './appDataSelectionMemo';
import { postReminderSyncToServiceWorker } from '../lib/reminderDelivery/pwaReminderSync';
import { uuid } from '../lib/uuid';
import {
  addItem as addItemFn,
  addNote as addNoteFn,
  addNoteGroup as addNoteGroupFn,
  addPerson as addPersonFn,
  addTeam as addTeamFn,
  addTodoGroup as addTodoGroupFn,
  addTodoItem as addTodoItemFn,
  clearCompletedInGroup as clearCompletedInGroupFn,
  markAllCompleteInGroup as markAllCompleteInGroupFn,
  moveTodoGroup as moveTodoGroupFn,
  patchNote as patchNoteFn,
  patchUtilityDocument as patchUtilityDocumentFn,
  patchUtilityStructuredText as patchUtilityStructuredTextFn,
  removeNote as removeNoteFn,
  removeNoteGroup as removeNoteGroupFn,
  reorderTodoGroup as reorderTodoGroupFn,
  reorderTodoItem as reorderTodoItemFn,
  setTodoStatus as setTodoStatusFn,
  updateTodoGroupPriority as updateTodoGroupPriorityFn,
  removeItem as removeItemFn,
  removePerson as removePersonFn,
  removeTeam as removeTeamFn,
  removeTodoGroup as removeTodoGroupFn,
  removeTodoItem as removeTodoItemFn,
  replaceNote as replaceNoteFn,
  setLastTeamId as setLastTeamIdFn,
  setNotesLock as setNotesLockFn,
  toggleFavoriteTeam as toggleFavoriteTeamFn,
  toggleItemDone as toggleItemDoneFn,
  toggleTodoItem as toggleTodoItemFn,
  updateItem as updateItemFn,
  updatePerson as updatePersonFn,
  updateTeam as updateTeamFn,
  updateTodoGroup as updateTodoGroupFn,
  updateNoteGroup as updateNoteGroupFn,
  updateAISettings as updateAISettingsFn,
  updateTodoItem as updateTodoItemFn,
  updateUserProfile as updateUserProfileFn,
} from '../core/actions';
import type {
  AISettings,
  AppData,
  DataShape,
  Item,
  ItemKind,
  Note,
  NoteGroup,
  NotesLock,
  Person,
  Priority,
  Team,
  TodoGroup,
  TodoItem,
  TodoStatus,
  UserProfile,
  UtilityDocument,
  UtilityStructuredText,
} from '../core/model';
import { isUnsupportedDataVersionError, normalizeData, appDataToPersistJson, compactAppDataForPersist, shapeOfData } from '../core/model';
import { parseSaveDataResult } from '../lib/appDataSave';
import { prepareForRemoteApply } from '../lib/syncApplyGuard';
import { createPersistQueue, type PersistResult } from '../lib/persistQueue';
import {
  createAppDataSnapshotStore,
  createPersistStatusStore,
  type AppDataSnapshotStore,
  type DataLossSuspicion,
  type PersistError,
  type PersistStatusStore,
} from './appDataStore';

export type { DataLossSuspicion, PersistError } from './appDataStore';

type Api = {
  data: AppData;
  ready: boolean;
  replaceAll: (next: AppData) => void;
  /**
   * Re-fetch data from the underlying store (Electron file or localStorage)
   * without going through the in-memory state machine. Used by the Backups &
   * Recovery flow to refresh the UI after a restore.
   */
  reload: () => Promise<void>;
  /**
   * Replace the entire workspace from an import (JSON file or similar).
   * Waits for in-flight saves to finish, commits via the main process on
   * desktop (bypassing write-generation conflicts), then reloads from disk.
   */
  importWorkspace: (next: AppData) => Promise<
    { ok: true; attachmentsRestored?: number } | { ok: false; error: string }
  >;
  /**
   * Re-read the workspace from disk after the main process wrote it (folder
   * import, restore). Discards pending debounced edits and clears save errors.
   */
  syncFromDisk: () => Promise<void>;
  update: (fn: (d: AppData) => AppData) => void;
  /**
   * Most recent unrecoverable save failure (or null). Subscribe to this from
   * a Layout-level banner so users see save issues anywhere in the app, not
   * just on Settings.
   */
  lastSaveError: PersistError | null;
  /** Wall-clock timestamp (ms since epoch) of the last successful disk save. */
  lastSavedAt: number | null;
  /** True while a save is currently in flight. */
  saving: boolean;
  clearSaveError: () => void;
  /**
   * If the file loaded at boot is meaningfully smaller than the
   * last-known-good fingerprint we persisted at the end of the previous
   * session, this becomes non-null and the Layout-level
   * DataIntegrityBanner renders. The user can dismiss (= accept the
   * current state as the new normal) or click through to Backups &
   * Recovery to restore.
   */
  dataLossSuspicion: DataLossSuspicion | null;
  /** Dismiss the suspicion (also clears the localStorage marker). */
  dismissDataLossSuspicion: () => void;
  /** Coarse shape of the current in-memory data; used by the banner + diagnostics UI. */
  currentShape: DataShape;
  /**
   * Force an immediate flush of the debounced save buffer. Returns when the
   * write has been acknowledged (or rejected). Used by destructive flows
   * (logout, password change) that must not lose unsaved typing.
   */
  flushPendingSave: () => Promise<void>;
  /**
   * Synchronously read the freshest in-memory workspace snapshot (the same
   * source of truth that `update` writes to). Unlike the `data` field this is
   * not captured by a render closure, so flows that `await runBeforeFlushHooks()`
   * / `flushPendingSave()` and then need the post-flush state (e.g. additive
   * merge-import) can read the committed editor buffers instead of stale data.
   */
  getLatestSnapshot: () => AppData;
  rememberTeam: (teamId: string) => void;
  addTeam: (name: string) => void;
  updateTeam: (teamId: string, patch: Partial<Pick<Team, 'name' | 'status'>>) => void;
  removeTeam: (teamId: string) => void;
  addPerson: (teamId: string, name: string, title?: string) => void;
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'title' | 'scratchpad' | 'agenda'>>) => void;
  removePerson: (id: string) => void;
  updateUserProfile: (
    patch: Partial<Pick<UserProfile, 'displayName' | 'jobTitle' | 'department' | 'phone' | 'bio' | 'avatarDataUrl'>>,
  ) => void;
  toggleFavoriteTeam: (teamId: string) => void;
  updateAISettings: (patch: Partial<AISettings>) => void;
  addItem: (
    personId: string,
    kind: ItemKind,
    fields?: Partial<
      Pick<
        Item,
        'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'remindRepeat' | 'url' | 'category' | 'goalStatus' | 'feedbackKind'
      >
    >,
  ) => void;
  updateItem: (
    id: string,
    patch: Partial<
      Pick<
        Item,
        | 'title'
        | 'body'
        | 'dueAt'
        | 'startAt'
        | 'remindAt'
        | 'remindRepeat'
        | 'url'
        | 'done'
        | 'category'
        | 'goalStatus'
        | 'feedbackKind'
      >
    >,
  ) => void;
  toggleItemDone: (id: string) => void;
  removeItem: (id: string) => void;
  addTodoGroup: (name: string) => string;
  updateTodoGroup: (
    groupId: string,
    patch: Partial<Pick<TodoGroup, 'name' | 'sortOrder' | 'pinned' | 'archived'>>,
  ) => void;
  moveTodoGroup: (groupId: string, direction: 'up' | 'down') => void;
  reorderTodoGroup: (groupId: string, beforeGroupId: string | null) => void;
  clearCompletedInGroup: (groupId: string) => void;
  markAllCompleteInGroup: (groupId: string) => void;
  removeTodoGroup: (groupId: string) => void;
  addTodoItem: (
    groupId: string,
    title: string,
    extras?: { priority?: Priority; dueAt?: string; body?: string; sourceNoteId?: string },
  ) => void;
  updateTodoItem: (
    id: string,
    patch: Partial<
      Pick<
        TodoItem,
        | 'title'
        | 'body'
        | 'groupId'
        | 'dueAt'
        | 'done'
        | 'status'
        | 'priority'
        | 'remindAt'
        | 'remindRepeat'
        | 'planInHub'
        | 'planImportant'
        | 'planUrgent'
        | 'planFocusToday'
        | 'archived'
      >
    >,
  ) => void;
  reorderTodoItem: (itemId: string, targetGroupId: string, beforeItemId: string | null) => void;
  updateTodoGroupPriority: (groupId: string, priority: Priority | undefined) => void;
  toggleTodoItem: (id: string) => void;
  setTodoStatus: (id: string, status: TodoStatus) => void;
  removeTodoItem: (id: string) => void;
  addNote: (groupId?: string) => string;
  addNoteGroup: (name: string) => string;
  updateNoteGroup: (
    groupId: string,
    patch: Partial<Pick<NoteGroup, 'name' | 'sortOrder' | 'pinned' | 'archived'>>,
  ) => void;
  removeNoteGroup: (groupId: string) => void;
  replaceNote: (note: Note) => void;
  patchNote: (
    id: string,
    patch: Partial<
      Pick<
        Note,
        | 'title'
        | 'body'
        | 'bodyFormat'
        | 'bodyPlainText'
        | 'pinned'
        | 'sortOrder'
        | 'lastOpenedAt'
        | 'archived'
        | 'groupId'
      >
    >,
  ) => void;
  removeNote: (id: string) => void;
  setNotesLock: (lock: NotesLock | undefined) => void;
  patchUtilityDocument: (
    patch: Partial<Pick<UtilityDocument, 'body' | 'bodyFormat' | 'bodyPlainText'>>,
  ) => void;
  patchUtilityStructuredText: (
    patch: Partial<
      Pick<UtilityStructuredText, 'content' | 'diffContentLeft' | 'diffContent' | 'language'>
    >,
  ) => void;
};

const Ctx = createContext<Api | null>(null);
const SnapshotStoreCtx = createContext<AppDataSnapshotStore | null>(null);
const PersistStoreCtx = createContext<PersistStatusStore | null>(null);
const ActionsCtx = createContext<Omit<
  Api,
  'data' | 'ready' | 'lastSaveError' | 'lastSavedAt' | 'saving' | 'dataLossSuspicion' | 'currentShape'
> | null>(null);

const SAVE_DEBOUNCE_MS = 400;

/** Load failures that must not be overwritten by an empty in-memory workspace. */
const PERSIST_BLOCK_LOAD_REASONS = new Set([
  'unsupported-version',
  'bad-key',
  'no-key',
  'parse',
  'io',
]);

function shouldBlockPersistOnLoad(reason: string | undefined): boolean {
  return !!reason && PERSIST_BLOCK_LOAD_REASONS.has(reason);
}

function storageKeyForUser(userId: string) {
  return `${STORAGE_PREFIX}-data-${userId}`;
}

/**
 * Per-user "last seen healthy" workspace shape, persisted to
 * localStorage at the end of every successful save. The boot-time
 * integrity check compares the freshly loaded shape against this marker
 * — if the new total is significantly smaller, we surface the
 * DataIntegrityBanner.
 *
 * localStorage is scoped to (origin, profile-per-Electron-userData), so
 * this marker is automatically per-machine. We deliberately don't ship
 * it across devices: a phone that's seeing a smaller dataset than the
 * desktop is the EXPECTED state when sync is off or in-progress, not a
 * data-loss event.
 */
function shapeKeyForUser(userId: string) {
  return `${STORAGE_PREFIX}-last-shape-${userId}`;
}

function readLastShape(userId: string): DataShape | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(shapeKeyForUser(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.teams === 'number' &&
      typeof parsed.people === 'number' &&
      typeof parsed.items === 'number' &&
      typeof parsed.todoGroups === 'number' &&
      typeof parsed.todoItems === 'number' &&
      typeof parsed.notes === 'number' &&
      typeof parsed.total === 'number'
    ) {
      return parsed as DataShape;
    }
  } catch {
    /* corrupt marker — treat as missing */
  }
  return null;
}

function writeLastShape(userId: string, shape: DataShape) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(shapeKeyForUser(userId), JSON.stringify(shape));
  } catch {
    /* QuotaExceeded etc. — best effort */
  }
}

function clearLastShape(userId: string) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(shapeKeyForUser(userId));
  } catch { /* ignore */ }
}

/**
 * Monotonic write counter for the browser/PWA localStorage backend, published
 * alongside the data on every successful write. The Electron backend gets its
 * write-generation from the main process; the PWA had none, so two tabs of the
 * same workspace could silently overwrite each other (last-write-wins). Other
 * tabs read this on the `storage` event to detect that the workspace changed
 * underneath them and either adopt the new snapshot (no local edits pending) or
 * surface a `write-conflict` banner instead of clobbering the other tab.
 */
function generationKeyForUser(userId: string) {
  return `${STORAGE_PREFIX}-gen-${userId}`;
}

function readLocalGeneration(userId: string): number {
  if (typeof window === 'undefined' || !window.localStorage) return 0;
  try {
    const raw = window.localStorage.getItem(generationKeyForUser(userId));
    const n = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeLocalGeneration(userId: string, gen: number) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(generationKeyForUser(userId), String(gen));
  } catch {
    /* best effort — conflict detection degrades, data write already happened */
  }
}

/**
 * Decide whether the freshly loaded shape is "much smaller" than the
 * last-known-good marker. We're deliberately conservative: a few items
 * less is normal (the user deleted something between sessions). Only
 * fire when the absolute drop is meaningful AND the relative drop is
 * large, so a 1-item workspace going to 0 doesn't trip the banner.
 */
function isSuspiciousShrink(current: DataShape, previous: DataShape): boolean {
  if (previous.total <= 0) return false;
  const drop = previous.total - current.total;
  if (drop < 3) return false; // ignore tiny diffs (one note + one todo deletion is normal)
  // Drop must be at least 50% of the previous total, OR the workspace went
  // from "had content" to "essentially empty" (≤ 1 item left).
  if (current.total <= 1) return true;
  return drop / previous.total >= 0.5;
}

/**
 * Persist the current snapshot to the underlying store (Electron file or
 * browser localStorage) and report success/failure to the caller. Unlike the
 * old fire-and-forget version, every failure path here surfaces to the
 * provider so a global banner can warn the user — silently dropping a save
 * is the worst possible outcome for a local-first app.
 */
async function persist(
  userId: string,
  data: AppData,
  expectedGeneration: number,
): Promise<{ ok: true; writeGeneration?: number } | { ok: false; reason: string; error?: string; writeGeneration?: number }> {
  const payload = compactAppDataForPersist(data);
  const api = window.cadence;
  if (api?.saveData) {
    try {
      const raw = await api.saveData(payload, userId, expectedGeneration);
      return parseSaveDataResult(raw);
    } catch (err) {
      return {
        ok: false,
        reason: 'ipc-error',
        error: err instanceof Error ? err.message : 'IPC saveData call failed.',
      };
    }
  }
  try {
    localStorage.setItem(storageKeyForUser(userId), appDataToPersistJson(data));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: 'localstorage-error',
      error: err instanceof Error ? err.message : 'localStorage write failed.',
    };
  }
}

type LoadInitialResult = {
  data: AppData;
  writeGeneration: number;
  loadError?: { reason: string; error: string };
};

async function loadInitial(userId: string): Promise<LoadInitialResult> {
  const api = window.cadence;
  if (api?.loadDataResult) {
    try {
      const r = await api.loadDataResult();
      const writeGeneration = typeof r.writeGeneration === 'number' ? r.writeGeneration : 0;
      if (r.ok) {
        try {
          return { data: normalizeData(r.data), writeGeneration };
        } catch (err) {
          if (isUnsupportedDataVersionError(err)) {
            return {
              data: normalizeData(null),
              writeGeneration,
              loadError: { reason: 'unsupported-version', error: err.message },
            };
          }
          return {
            data: normalizeData(null),
            writeGeneration,
            loadError: {
              reason: 'parse',
              error: err instanceof Error ? err.message : 'Could not parse workspace data.',
            },
          };
        }
      }
      return {
        data: normalizeData(null),
        writeGeneration,
        loadError: {
          reason: r.reason ?? 'load-failed',
          error: r.error ?? 'Could not load your workspace from disk.',
        },
      };
    } catch (err) {
      return {
        data: normalizeData(null),
        writeGeneration: 0,
        loadError: {
          reason: 'io',
          error: err instanceof Error ? err.message : 'Could not load workspace from disk.',
        },
      };
    }
  }
  if (api?.loadData) {
    try {
      const loaded = await api.loadData();
      return { data: normalizeData(loaded), writeGeneration: 0 };
    } catch (err) {
      if (isUnsupportedDataVersionError(err)) {
        return {
          data: normalizeData(null),
          writeGeneration: 0,
          loadError: { reason: 'unsupported-version', error: err.message },
        };
      }
      return {
        data: normalizeData(null),
        writeGeneration: 0,
        loadError: {
          reason: 'parse',
          error: err instanceof Error ? err.message : 'Could not parse workspace data.',
        },
      };
    }
  }
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    try {
      return {
        data: normalizeData(raw ? JSON.parse(raw) : null),
        writeGeneration: readLocalGeneration(userId),
      };
    } catch (err) {
      if (isUnsupportedDataVersionError(err)) {
        return {
          data: normalizeData(null),
          writeGeneration: 0,
          loadError: { reason: 'unsupported-version', error: err.message },
        };
      }
      return {
        data: normalizeData(null),
        writeGeneration: 0,
        loadError: {
          reason: 'parse',
          error: err instanceof Error ? err.message : 'Workspace file is corrupt or unreadable.',
        },
      };
    }
  } catch (err) {
    return {
      data: normalizeData(null),
      writeGeneration: 0,
      loadError: {
        reason: 'io',
        error: err instanceof Error ? err.message : 'Could not read browser storage.',
      },
    };
  }
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAccount();
  const userId = user?.id ?? '';
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const [data, setData] = useState<AppData | null>(null);
  const [ready, setReady] = useState(false);
  const [lastSaveError, setLastSaveError] = useState<PersistError | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dataLossSuspicion, setDataLossSuspicion] = useState<DataLossSuspicion | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistBlockedRef = useRef(false);
  // The most recent payload pending a debounced save, kept so we can flush it
  // synchronously on tab close / unmount.
  const pendingSave = useRef<AppData | null>(null);
  const writeGenerationRef = useRef(0);
  /** Ignore stale main-process save errors briefly after import/restore sync. */
  const suppressSaveErrorsUntilRef = useRef(0);
  const persistWriteRef = useRef<(payload: AppData) => Promise<PersistResult>>(async () => ({ ok: true }));
  const persistQueueRef = useRef(createPersistQueue<AppData>(async (p) => persistWriteRef.current(p)));
  const snapshotStoreRef = useRef(createAppDataSnapshotStore());
  const persistStoreRef = useRef(
    createPersistStatusStore({
      ready: false,
      lastSaveError: null,
      lastSavedAt: null,
      saving: false,
      dataLossSuspicion: null,
      currentShape: shapeOfData(normalizeData(null)),
    }),
  );

  const syncSnapshotStore = useCallback((next: AppData | null) => {
    snapshotStoreRef.current.setSnapshot(next);
  }, []);

  useEffect(() => {
    syncSnapshotStore(data);
  }, [data, syncSnapshotStore]);

  useEffect(() => {
    persistStoreRef.current.setSnapshot({
      ready: ready && data !== null,
      lastSaveError,
      lastSavedAt,
      saving,
      dataLossSuspicion,
      currentShape: shapeOfData(data ?? normalizeData(null)),
    });
  }, [data, ready, lastSaveError, lastSavedAt, saving, dataLossSuspicion]);

  // Bubble main-process save failures
  // undecipherable file") up to the global banner. This complements the
  // try/catch in `runPersist` because some failures only come from main,
  // not from a rejected IPC call.
  useEffect(() => {
    const off = window.cadence?.onSaveError?.((evt) => {
      if (Date.now() < suppressSaveErrorsUntilRef.current) {
        if (typeof evt?.writeGeneration === 'number') {
          writeGenerationRef.current = evt.writeGeneration;
        }
        return;
      }
      if (evt?.reason === 'import-in-progress') {
        if (typeof evt?.writeGeneration === 'number') {
          writeGenerationRef.current = evt.writeGeneration;
        }
        return;
      }
      if (evt?.reason === 'write-conflict') {
        if (typeof evt?.writeGeneration === 'number') {
          writeGenerationRef.current = evt.writeGeneration;
        }
        persistBlockedRef.current = true;
        setLastSaveError({
          reason: 'write-conflict',
          error:
            evt?.error ??
            'Another device or tab updated your workspace. Reload from disk to continue editing.',
          at: Date.now(),
        });
        return;
      }
      setLastSaveError({
        reason: evt?.reason ?? 'main-process',
        error: evt?.error ?? 'Main process reported a save error.',
        at: Date.now(),
      });
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  // Reminders that fire/deliver in the main process write the data file there
  // (which bumps the on-disk write generation) and then push the fresh snapshot
  // back to us via `onReminderEvent`. We must adopt that new generation here,
  // otherwise our `writeGenerationRef` stays stale and the user's very next edit
  // is rejected as a phantom `write-conflict` — which permanently blocks saving
  // (`persistBlockedRef`) until the app is restarted. This is the root cause of
  // the intermittent "can't save my to-do until I relaunch" reports.
  useEffect(() => {
    const off = window.cadence?.onReminderEvent?.((evt) => {
      if (!evt || (evt.type !== 'fired' && evt.type !== 'delivered-sync')) return;
      if (typeof evt.writeGeneration === 'number' && Number.isFinite(evt.writeGeneration)) {
        writeGenerationRef.current = evt.writeGeneration;
      }
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);

  const syncWriteGenerationFromDisk = useCallback(async () => {
    if (!window.cadence?.loadDataResult) return;
    try {
      const r = await window.cadence.loadDataResult();
      if (typeof r.writeGeneration === 'number') {
        writeGenerationRef.current = r.writeGeneration;
      }
    } catch {
      /* best effort */
    }
  }, []);

  const recreatePersistQueue = useCallback(() => {
    persistQueueRef.current = createPersistQueue((payload) => persistWriteRef.current(payload));
  }, []);

  const shouldSurfacePersistError = useCallback((reason: string | undefined) => {
    return reason !== 'import-in-progress';
  }, []);

  useEffect(() => {
    persistWriteRef.current = async (payload) => {
      const uid = userIdRef.current;
      if (!uid) return { ok: false, reason: 'no-user' };
      const gen = writeGenerationRef.current;
      const r = await persist(uid, payload, gen);
      if (r.ok) {
        if (typeof r.writeGeneration === 'number') {
          writeGenerationRef.current = r.writeGeneration;
        } else if (window.cadence?.saveData) {
          writeGenerationRef.current = gen + 1;
        } else {
          // PWA/localStorage backend: advance and publish our generation so
          // other tabs of this workspace can detect the change.
          writeGenerationRef.current = gen + 1;
          writeLocalGeneration(uid, writeGenerationRef.current);
        }
      } else if (typeof r.writeGeneration === 'number') {
        writeGenerationRef.current = r.writeGeneration;
      }
      return r;
    };
    recreatePersistQueue();
  }, [userId, recreatePersistQueue]);

  const runPersist = useCallback(async (uid: string, payload: AppData) => {
    if (persistBlockedRef.current) return;
    setSaving(true);
    try {
      let r: PersistResult;
      try {
        r = await persistQueueRef.current.enqueue(payload);
      } catch (err) {
        // The persist queue rejects if the underlying write throws (the real
        // write path catches internally, but guard defensively so a future
        // throw surfaces as a save error instead of an unhandled rejection).
        r = {
          ok: false,
          reason: 'persist-exception',
          error: err instanceof Error ? err.message : 'Unexpected error while saving.',
        };
      }
      if (r.ok) {
        setLastSavedAt(Date.now());
        setLastSaveError(null);
        try { writeLastShape(uid, shapeOfData(payload)); } catch { /* best effort */ }
      } else {
        if (typeof r.writeGeneration === 'number') {
          writeGenerationRef.current = r.writeGeneration;
        }
        if (shouldSurfacePersistError(r.reason)) {
          if (r.reason === 'write-conflict') {
            persistBlockedRef.current = true;
          }
          setLastSaveError({
            reason: r.reason,
            error:
              r.reason === 'write-conflict'
                ? (r.error ??
                  'Another device or tab updated your workspace. Reload from disk to continue editing.')
                : r.error,
            at: Date.now(),
          });
        }
      }
    } finally {
      setSaving(false);
    }
  }, [shouldSurfacePersistError]);

  const applyPersistOutcome = useCallback((uid: string, payload: AppData, r: ReturnType<typeof parseSaveDataResult>) => {
    if (r.ok) {
      setLastSavedAt(Date.now());
      setLastSaveError(null);
      if (typeof r.writeGeneration === 'number') {
        writeGenerationRef.current = r.writeGeneration;
      }
      try { writeLastShape(uid, shapeOfData(payload)); } catch { /* best effort */ }
    } else {
      if (typeof r.writeGeneration === 'number') {
        writeGenerationRef.current = r.writeGeneration;
      }
      if (shouldSurfacePersistError(r.reason)) {
        if (r.reason === 'write-conflict') {
          persistBlockedRef.current = true;
        }
        setLastSaveError({
          reason: r.reason,
          error:
            r.reason === 'write-conflict'
              ? (r.error ??
                'Another device or tab updated your workspace. Reload from disk to continue editing.')
              : r.error,
          at: Date.now(),
        });
      }
    }
  }, [shouldSurfacePersistError]);

  const flushPendingSave = useCallback(async () => {
    await runBeforeFlushHooks();
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const uid = userIdRef.current;
    const next = pendingSave.current ?? snapshotStoreRef.current.getSnapshot();
    pendingSave.current = null;

    await persistQueueRef.current.flush();

    if (!uid || !next) return;

    if (window.cadence?.flushPendingSaveSync) {
      setSaving(true);
      try {
        const raw = window.cadence.flushPendingSaveSync(
          compactAppDataForPersist(next),
          uid,
          writeGenerationRef.current,
        );
        applyPersistOutcome(uid, next, parseSaveDataResult(raw));
      } finally {
        setSaving(false);
      }
      return;
    }

    await runPersist(uid, next);
    await persistQueueRef.current.flush();
  }, [runPersist, applyPersistOutcome]);

  useEffect(() => {
    registerFlushPendingSave(flushPendingSave);
    return () => unregisterFlushPendingSave();
  }, [flushPendingSave]);

  useEffect(() => {
    const off = window.cadence?.onRequestFlush?.(() => {
      void flushPendingSave().finally(() => {
        window.cadence?.notifyFlushDone?.();
      });
    });
    return () => {
      off?.();
    };
  }, [flushPendingSave]);

  // Best-effort: flush before the tab goes away (Electron uses sendSync after queue drain).
  useEffect(() => {
    const syncLocalStorageBestEffort = () => {
      const uid = userIdRef.current;
      if (!uid || persistBlockedRef.current || window.cadence?.saveData) return;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const payload = pendingSave.current ?? snapshotStoreRef.current.getSnapshot();
      if (!payload) return;
      pendingSave.current = null;
      try {
        localStorage.setItem(storageKeyForUser(uid), appDataToPersistJson(payload));
        writeGenerationRef.current += 1;
        writeLocalGeneration(uid, writeGenerationRef.current);
      } catch (err) {
        // A silent drop here (e.g. QuotaExceeded on a backgrounded mobile tab)
        // is exactly the data loss we must never hide. Re-queue the payload so
        // a later flush can retry, and surface a banner that becomes visible
        // when the tab is foregrounded again.
        pendingSave.current = payload;
        setLastSaveError({
          reason: 'localstorage-error',
          error:
            err instanceof Error
              ? err.message
              : 'Could not save your latest changes before the tab was hidden.',
          at: Date.now(),
        });
      }
    };

    const onPageHide = () => {
      syncLocalStorageBestEffort();
      void flushPendingSave();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        syncLocalStorageBestEffort();
        void flushPendingSave();
      }
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      void flushPendingSave();
    };
  }, [flushPendingSave]);

  useEffect(() => {
    if (!userId) {
      persistBlockedRef.current = false;
      setData(null);
      setReady(false);
      setDataLossSuspicion(null);
      return;
    }
    let cancelled = false;
    setReady(false);
    setData(null);
    setDataLossSuspicion(null);
    void (async () => {
      const loaded = await loadInitial(userId);
      if (cancelled) return;
      persistBlockedRef.current = shouldBlockPersistOnLoad(loaded.loadError?.reason);
      writeGenerationRef.current = loaded.writeGeneration;
      if (loaded.loadError) {
        setLastSaveError({
          reason: loaded.loadError.reason,
          error: loaded.loadError.error,
          at: Date.now(),
        });
      }
      let merged = loaded.data;
      const seed = sessionStorage.getItem(`${STORAGE_PREFIX}-profile-seed`);
      let seeded = false;
      if (seed?.trim()) {
        sessionStorage.removeItem(`${STORAGE_PREFIX}-profile-seed`);
        const p = merged.profile?.displayName ?? 'Me';
        if (p === 'Me' || p === 'Ben' || !merged.profile?.displayName?.trim()) {
          merged = updateUserProfileFn(merged, { displayName: seed.trim() });
          seeded = true;
        }
      }
      // Boot-time data-loss check. Compare the freshly loaded shape with
      // the last-known-good fingerprint we wrote on the previous save.
      // We do this BEFORE seeding the profile (because the seed write
      // would update the fingerprint and erase the very signal we're
      // looking for).
      try {
        const currentShape = shapeOfData(merged);
        const lastShape = readLastShape(userId);
        if (lastShape && isSuspiciousShrink(currentShape, lastShape)) {
          setDataLossSuspicion({
            current: currentShape,
            previous: lastShape,
            at: Date.now(),
          });
          // Intentionally DO NOT clear the marker yet — keep it around
          // until the user dismisses the banner OR restores from a
          // backup. That way, even if they sign out and back in, the
          // suspicion fires again (defence against accidentally swiping
          // the banner away on launch).
        }
      } catch (err) {
        console.warn('[cadence] data integrity check failed (continuing)', err);
      }
      setData(merged);
      setReady(true);
      if (seeded) void runPersist(userId, merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, runPersist]);

  const scheduleSave = useCallback((next: AppData) => {
    const uid = userIdRef.current;
    if (!uid || persistBlockedRef.current) return;
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const payload = pendingSave.current;
      pendingSave.current = null;
      if (payload) void runPersist(uid, payload);
    }, SAVE_DEBOUNCE_MS);
  }, [runPersist]);

  const update = useCallback(
    (fn: (d: AppData) => AppData) => {
      if (persistBlockedRef.current) return;
      setData((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const replaceAll = useCallback(
    (next: AppData) => {
      const normalized = normalizeData(next);
      persistBlockedRef.current = false;
      setData(normalized);
      // A replaceAll is either a sync pull or a backup restore — both
      // are explicit "I want this snapshot" events. Clear any
      // data-loss suspicion the boot raised, because the user has now
      // chosen the authoritative state going forward.
      setDataLossSuspicion(null);
      const uid = userIdRef.current;
      if (uid) {
        // Bulk replace (sync pull, restore) is a "import" event, not a
        // typing event — there's no debounce benefit and a high cost if
        // the user backgrounds the app before the 400 ms timer fires.
        // Mobile Safari is especially aggressive about freezing pages on
        // visibility change, so we persist immediately and clear any
        // pending debounced save that would otherwise overwrite us.
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        pendingSave.current = null;
        void runPersist(uid, normalized);
      }
    },
    [runPersist],
  );

  const discardPendingLocalEdits = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = null;
    persistQueueRef.current.cancelPending();
    await persistQueueRef.current.flush();
  }, []);

  const prepareForExternalWorkspaceReplace = useCallback(async () => {
    suppressSaveErrorsUntilRef.current = Date.now() + 10_000;
    setLastSaveError(null);
    await syncWriteGenerationFromDisk();
    await discardPendingLocalEdits();
    setLastSaveError(null);
  }, [discardPendingLocalEdits, syncWriteGenerationFromDisk]);

  const applyLoadedWorkspace = useCallback((uid: string, loaded: LoadInitialResult) => {
    writeGenerationRef.current = loaded.writeGeneration;
    persistBlockedRef.current = loaded.loadError
      ? shouldBlockPersistOnLoad(loaded.loadError.reason)
      : false;
    if (loaded.loadError) {
      setLastSaveError({
        reason: loaded.loadError.reason,
        error: loaded.loadError.error,
        at: Date.now(),
      });
    } else {
      setLastSaveError(null);
    }
    setData(loaded.data);
    setReady(true);
    setDataLossSuspicion(null);
    setLastSavedAt(Date.now());
    try {
      writeLastShape(uid, shapeOfData(loaded.data));
    } catch {
      /* best effort */
    }
  }, []);

  const syncFromDisk = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    await flushPendingSave();
    await prepareForRemoteApply();
    await prepareForExternalWorkspaceReplace();
    setReady(false);
    const loaded = await loadInitial(uid);
    applyLoadedWorkspace(uid, loaded);
    recreatePersistQueue();
  }, [applyLoadedWorkspace, flushPendingSave, prepareForExternalWorkspaceReplace, recreatePersistQueue]);

  useEffect(() => {
    const off = window.cadence?.onRemoteUpdated?.(() => {
      void syncFromDisk();
    });
    return () => {
      if (typeof off === 'function') off();
    };
  }, [syncFromDisk]);

  const importWorkspace = useCallback(
    async (next: AppData): Promise<
      { ok: true; attachmentsRestored?: number } | { ok: false; error: string }
    > => {
      const normalized = normalizeData(next);
      const uid = userIdRef.current;
      if (!uid) return { ok: false, error: 'Not signed in.' };

      await prepareForRemoteApply();
      await flushPendingSave();
      await prepareForExternalWorkspaceReplace();

      const payload = compactAppDataForPersist(normalized);
      let attachmentsRestored: number | undefined;

      if (window.cadence?.importWorkspace) {
        try {
          const r = await window.cadence.importWorkspace(payload);
          if (!r?.ok) {
            return {
              ok: false,
              error: r?.error ?? r?.reason ?? 'Import failed.',
            };
          }
          if (typeof r.writeGeneration === 'number') {
            writeGenerationRef.current = r.writeGeneration;
          }
          if (typeof r.attachmentsRestored === 'number') {
            attachmentsRestored = r.attachmentsRestored;
          }
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Import failed.',
          };
        }
      } else {
        try {
          localStorage.setItem(storageKeyForUser(uid), appDataToPersistJson(normalized));
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : 'Could not write to browser storage.',
          };
        }
      }

      setReady(false);
      const loaded = await loadInitial(uid);
      applyLoadedWorkspace(uid, loaded);
      recreatePersistQueue();
      revokeAttachmentBlobUrls();
      return { ok: true, attachmentsRestored };
    },
    [applyLoadedWorkspace, flushPendingSave, prepareForExternalWorkspaceReplace, recreatePersistQueue],
  );

  const reload = useCallback(async () => {
    await syncFromDisk();
  }, [syncFromDisk]);

  // PWA multi-tab safety. The Electron backend routes concurrent writes through
  // the main-process write-generation; the browser/localStorage backend had no
  // such guard, so two tabs of the same workspace silently clobbered each other
  // (last-write-wins). We listen for the cross-tab `storage` event on the data
  // key and compare the published generation.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (window.cadence?.saveData) return; // Electron has its own conflict path.

    const handleExternalWrite = async (uid: string, incomingGen: number) => {
      // Flush the editor's debounce buffer so a half-typed sentence counts as a
      // real local edit instead of being silently discarded by an adopt.
      await runBeforeFlushHooks();
      if (writeGenerationRef.current >= incomingGen) return;
      const hasUnsavedLocalEdits = pendingSave.current !== null || saveTimer.current !== null;
      if (hasUnsavedLocalEdits) {
        // Adopting would drop this tab's edits; saving would clobber the other
        // tab's write. Block writes and ask the user to reload — same contract
        // as the Electron write-conflict path.
        persistBlockedRef.current = true;
        setLastSaveError({
          reason: 'write-conflict',
          error: 'Another tab updated this workspace. Reload from storage to continue editing.',
          at: Date.now(),
        });
        return;
      }
      // No pending local edits — safe to adopt the other tab's snapshot without
      // routing through syncFromDisk (which would re-persist our stale memory).
      const loaded = await loadInitial(uid);
      applyLoadedWorkspace(uid, loaded);
      recreatePersistQueue();
    };

    const onStorage = (e: StorageEvent) => {
      const uid = userIdRef.current;
      if (!uid) return;
      // The generation sidecar is written *after* the data, so reacting to it
      // (in addition to the data key) guarantees we read a fresh generation.
      if (e.key !== storageKeyForUser(uid) && e.key !== generationKeyForUser(uid)) return;
      const incomingGen = readLocalGeneration(uid);
      if (incomingGen <= writeGenerationRef.current) return;
      void handleExternalWrite(uid, incomingGen);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [applyLoadedWorkspace, recreatePersistQueue]);

  const dismissDataLossSuspicion = useCallback(() => {
    setDataLossSuspicion(null);
    const uid = userIdRef.current;
    if (!uid) return;
    // Dismissing the banner is an explicit "accept current state as the
    // new normal" gesture. We update the fingerprint so this boot's
    // shape becomes the new baseline; otherwise the banner would fire
    // again on the next launch and the dismissal wouldn't stick.
    if (data) {
      try { writeLastShape(uid, shapeOfData(data)); } catch { /* ignore */ }
    } else {
      clearLastShape(uid);
    }
  }, [data]);

  const api = useMemo<Api>(() => {
    const empty = normalizeData(null);
    const d = data ?? empty;
    return {
      data: d,
      ready: ready && data !== null,
      replaceAll,
      reload,
      importWorkspace,
      syncFromDisk,
      lastSaveError,
      lastSavedAt,
      saving,
      clearSaveError: () => setLastSaveError(null),
      dataLossSuspicion,
      dismissDataLossSuspicion,
      currentShape: shapeOfData(d),
      flushPendingSave,
      getLatestSnapshot: () => snapshotStoreRef.current.getSnapshot() ?? empty,
      rememberTeam: (teamId) => update((x) => setLastTeamIdFn(x, teamId)),
      update,
      addTeam: (name) => update((x) => addTeamFn(x, name)),
      updateTeam: (teamId, patch) => update((x) => updateTeamFn(x, teamId, patch)),
      removeTeam: (teamId) =>
        update((x) => {
          const personIds = new Set(x.people.filter((p) => p.teamId === teamId).map((p) => p.id));
          for (const it of x.items) {
            if (personIds.has(it.personId)) cancelPendingReminderSlots(it.id);
          }
          return removeTeamFn(x, teamId);
        }),
      addPerson: (teamId, name, title) => update((x) => addPersonFn(x, teamId, name, title)),
      updatePerson: (id, patch) => update((x) => updatePersonFn(x, id, patch)),
      removePerson: (id) =>
        update((x) => {
          for (const it of x.items) {
            if (it.personId === id) cancelPendingReminderSlots(it.id);
          }
          return removePersonFn(x, id);
        }),
      updateUserProfile: (patch) => update((x) => updateUserProfileFn(x, patch)),
      toggleFavoriteTeam: (teamId) => update((x) => toggleFavoriteTeamFn(x, teamId)),
      updateAISettings: (patch) => update((x) => updateAISettingsFn(x, patch)),
      addItem: (personId, kind, fields) => update((x) => addItemFn(x, personId, kind, fields ?? {})),
      updateItem: (id, patch) => update((x) => updateItemFn(x, id, patch)),
      toggleItemDone: (id) => update((x) => toggleItemDoneFn(x, id)),
      removeItem: (id) => {
        cancelPendingReminderSlots(id);
        update((x) => removeItemFn(x, id));
      },
      addTodoGroup: (name) => {
        const id = uuid();
        update((x) => addTodoGroupFn(x, name, id));
        return id;
      },
      updateTodoGroup: (groupId, patch) => update((x) => updateTodoGroupFn(x, groupId, patch)),
      moveTodoGroup: (groupId, direction) => update((x) => moveTodoGroupFn(x, groupId, direction)),
      reorderTodoGroup: (groupId, beforeGroupId) =>
        update((x) => reorderTodoGroupFn(x, groupId, beforeGroupId)),
      clearCompletedInGroup: (groupId) => update((x) => clearCompletedInGroupFn(x, groupId)),
      markAllCompleteInGroup: (groupId) => update((x) => markAllCompleteInGroupFn(x, groupId)),
      removeTodoGroup: (groupId) => update((x) => removeTodoGroupFn(x, groupId)),
      addTodoItem: (groupId, title, extras) => update((x) => addTodoItemFn(x, groupId, title, extras)),
      updateTodoItem: (id, patch) => update((x) => updateTodoItemFn(x, id, patch)),
      reorderTodoItem: (itemId, targetGroupId, beforeItemId) =>
        update((x) => reorderTodoItemFn(x, itemId, targetGroupId, beforeItemId)),
      updateTodoGroupPriority: (groupId, priority) =>
        update((x) => updateTodoGroupPriorityFn(x, groupId, priority)),
      toggleTodoItem: (id) => update((x) => toggleTodoItemFn(x, id)),
      setTodoStatus: (id, status) => update((x) => setTodoStatusFn(x, id, status)),
      removeTodoItem: (id) => {
        cancelPendingReminderSlots(id);
        update((x) => removeTodoItemFn(x, id));
      },
      // Generate the id BEFORE the updater runs, so the updater itself is
      // pure (a requirement for React's setState(updater) — StrictMode may
      // run it twice). The view gets the id back synchronously and selects
      // the new note without scanning the resulting list.
      addNote: (groupId?: string) => {
        const id = uuid();
        update((x) => addNoteFn(x, id, groupId));
        return id;
      },
      addNoteGroup: (name) => {
        const id = uuid();
        update((x) => addNoteGroupFn(x, name, id));
        return id;
      },
      updateNoteGroup: (groupId, patch) => update((x) => updateNoteGroupFn(x, groupId, patch)),
      removeNoteGroup: (groupId) => update((x) => removeNoteGroupFn(x, groupId)),
      replaceNote: (note) => update((x) => replaceNoteFn(x, note)),
      patchNote: (id, patch) => update((x) => patchNoteFn(x, id, patch)),
      removeNote: (id) => update((x) => removeNoteFn(x, id)),
      setNotesLock: (lock) => update((x) => setNotesLockFn(x, lock)),
      patchUtilityDocument: (patch) => update((x) => patchUtilityDocumentFn(x, patch)),
      patchUtilityStructuredText: (patch) => update((x) => patchUtilityStructuredTextFn(x, patch)),
    };
  }, [data, ready, update, replaceAll, reload, importWorkspace, syncFromDisk, lastSaveError, lastSavedAt, saving, dataLossSuspicion, dismissDataLossSuspicion, flushPendingSave]);

  const actionsBridgeRef = useRef(api);
  actionsBridgeRef.current = api;

  const stableActions = useMemo(
    () => ({
      replaceAll: (next: AppData) => actionsBridgeRef.current.replaceAll(next),
      reload: () => actionsBridgeRef.current.reload(),
      importWorkspace: (next: AppData) => actionsBridgeRef.current.importWorkspace(next),
      syncFromDisk: () => actionsBridgeRef.current.syncFromDisk(),
      update: (fn: (d: AppData) => AppData) => actionsBridgeRef.current.update(fn),
      clearSaveError: () => actionsBridgeRef.current.clearSaveError(),
      dismissDataLossSuspicion: () => actionsBridgeRef.current.dismissDataLossSuspicion(),
      flushPendingSave: () => actionsBridgeRef.current.flushPendingSave(),
      getLatestSnapshot: () => actionsBridgeRef.current.getLatestSnapshot(),
      rememberTeam: (teamId: string) => actionsBridgeRef.current.rememberTeam(teamId),
      addTeam: (name: string) => actionsBridgeRef.current.addTeam(name),
      updateTeam: (teamId: string, patch: Parameters<Api['updateTeam']>[1]) =>
        actionsBridgeRef.current.updateTeam(teamId, patch),
      removeTeam: (teamId: string) => actionsBridgeRef.current.removeTeam(teamId),
      addPerson: (teamId: string, name: string, title?: string) =>
        actionsBridgeRef.current.addPerson(teamId, name, title),
      updatePerson: (id: string, patch: Parameters<Api['updatePerson']>[1]) =>
        actionsBridgeRef.current.updatePerson(id, patch),
      removePerson: (id: string) => actionsBridgeRef.current.removePerson(id),
      updateUserProfile: (patch: Parameters<Api['updateUserProfile']>[0]) =>
        actionsBridgeRef.current.updateUserProfile(patch),
      toggleFavoriteTeam: (teamId: string) => actionsBridgeRef.current.toggleFavoriteTeam(teamId),
      updateAISettings: (patch: Parameters<Api['updateAISettings']>[0]) =>
        actionsBridgeRef.current.updateAISettings(patch),
      addItem: (
        personId: string,
        kind: Parameters<Api['addItem']>[1],
        fields?: Parameters<Api['addItem']>[2],
      ) => actionsBridgeRef.current.addItem(personId, kind, fields),
      updateItem: (id: string, patch: Parameters<Api['updateItem']>[1]) =>
        actionsBridgeRef.current.updateItem(id, patch),
      toggleItemDone: (id: string) => actionsBridgeRef.current.toggleItemDone(id),
      removeItem: (id: string) => actionsBridgeRef.current.removeItem(id),
      addTodoGroup: (name: string) => actionsBridgeRef.current.addTodoGroup(name),
      updateTodoGroup: (groupId: string, patch: Parameters<Api['updateTodoGroup']>[1]) =>
        actionsBridgeRef.current.updateTodoGroup(groupId, patch),
      moveTodoGroup: (groupId: string, direction: 'up' | 'down') =>
        actionsBridgeRef.current.moveTodoGroup(groupId, direction),
      reorderTodoGroup: (groupId: string, beforeGroupId: string | null) =>
        actionsBridgeRef.current.reorderTodoGroup(groupId, beforeGroupId),
      clearCompletedInGroup: (groupId: string) => actionsBridgeRef.current.clearCompletedInGroup(groupId),
      markAllCompleteInGroup: (groupId: string) => actionsBridgeRef.current.markAllCompleteInGroup(groupId),
      removeTodoGroup: (groupId: string) => actionsBridgeRef.current.removeTodoGroup(groupId),
      addTodoItem: (
        groupId: string,
        title: string,
        extras?: Parameters<Api['addTodoItem']>[2],
      ) => actionsBridgeRef.current.addTodoItem(groupId, title, extras),
      updateTodoItem: (id: string, patch: Parameters<Api['updateTodoItem']>[1]) =>
        actionsBridgeRef.current.updateTodoItem(id, patch),
      reorderTodoItem: (itemId: string, targetGroupId: string, beforeItemId: string | null) =>
        actionsBridgeRef.current.reorderTodoItem(itemId, targetGroupId, beforeItemId),
      updateTodoGroupPriority: (groupId: string, priority: Parameters<Api['updateTodoGroupPriority']>[1]) =>
        actionsBridgeRef.current.updateTodoGroupPriority(groupId, priority),
      toggleTodoItem: (id: string) => actionsBridgeRef.current.toggleTodoItem(id),
      setTodoStatus: (id: string, status: Parameters<Api['setTodoStatus']>[1]) =>
        actionsBridgeRef.current.setTodoStatus(id, status),
      removeTodoItem: (id: string) => actionsBridgeRef.current.removeTodoItem(id),
      addNote: (groupId?: string) => actionsBridgeRef.current.addNote(groupId),
      addNoteGroup: (name: string) => actionsBridgeRef.current.addNoteGroup(name),
      updateNoteGroup: (groupId: string, patch: Parameters<Api['updateNoteGroup']>[1]) =>
        actionsBridgeRef.current.updateNoteGroup(groupId, patch),
      removeNoteGroup: (groupId: string) => actionsBridgeRef.current.removeNoteGroup(groupId),
      replaceNote: (note: Parameters<Api['replaceNote']>[0]) => actionsBridgeRef.current.replaceNote(note),
      patchNote: (id: string, patch: Parameters<Api['patchNote']>[1]) =>
        actionsBridgeRef.current.patchNote(id, patch),
      removeNote: (id: string) => actionsBridgeRef.current.removeNote(id),
      setNotesLock: (lock: Parameters<Api['setNotesLock']>[0]) => actionsBridgeRef.current.setNotesLock(lock),
      patchUtilityDocument: (patch: Parameters<Api['patchUtilityDocument']>[0]) =>
        actionsBridgeRef.current.patchUtilityDocument(patch),
      patchUtilityStructuredText: (patch: Parameters<Api['patchUtilityStructuredText']>[0]) =>
        actionsBridgeRef.current.patchUtilityStructuredText(patch),
    }),
    [],
  );

  return (
    <SnapshotStoreCtx.Provider value={snapshotStoreRef.current}>
      <PersistStoreCtx.Provider value={persistStoreRef.current}>
        <ActionsCtx.Provider value={stableActions}>
          <Ctx.Provider value={api}>{children}</Ctx.Provider>
        </ActionsCtx.Provider>
      </PersistStoreCtx.Provider>
    </SnapshotStoreCtx.Provider>
  );
}

export function useAppData(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside provider');
  return v;
}

/**
 * Subscribe to a slice of AppData without re-rendering on unrelated mutations.
 * Prefer this over `useAppData().data` in list/detail views.
 */
export function useAppDataSelector<T>(
  selector: (data: AppData) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): T {
  const store = useContext(SnapshotStoreCtx);
  if (!store) throw new Error('useAppDataSelector outside provider');

  const emptyRef = useRef<AppData | null>(null);
  if (emptyRef.current === null) emptyRef.current = normalizeData(null);

  // Rebuilt whenever the `selector`/`isEqual` identity changes (so closure
  // params like a route `teamId` stay correct). See createAppDataSelectionMemo
  // for why the same-snapshot short-circuit is required to avoid an infinite
  // render loop with object-returning selectors.
  const getSelection = useMemo(
    () => createAppDataSelectionMemo(selector, isEqual),
    [selector, isEqual],
  );

  return useSyncExternalStore(
    store.subscribe,
    () => getSelection(store.getSnapshot() ?? emptyRef.current!),
    () => getSelection(emptyRef.current!),
  );
}

/** Stable mutation API — does not subscribe to data snapshots. */
export function useAppDataActions(): Omit<
  Api,
  'data' | 'ready' | 'lastSaveError' | 'lastSavedAt' | 'saving' | 'dataLossSuspicion' | 'currentShape'
> {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error('useAppDataActions outside provider');
  return v;
}

/** Persist / save status without subscribing to workspace data mutations. */
export function usePersistStatus() {
  const store = useContext(PersistStoreCtx);
  const { clearSaveError, dismissDataLossSuspicion } = useAppDataActions();
  if (!store) throw new Error('usePersistStatus outside provider');
  const status = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { ...status, clearSaveError, dismissDataLossSuspicion };
}

/**
 * Returns the next reminder timestamp for a recurring reminder, advancing by a
 * single cycle so the user can catch up on missed runs incrementally instead of
 * all at once. Delegates to the shared {@link advanceReminderOnce} so the
 * renderer firing path, the agenda projection and the Electron engine all agree
 * on the recurrence math.
 */
const advanceReminder = advanceReminderOnce;

async function fireReminderNotification(title: string, body: string): Promise<boolean> {
  if (window.cadence?.showNotification) {
    try {
      return (await window.cadence.showNotification({ title, body })) === true;
    } catch {
      /* fall through to browser API */
    }
  }
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      // eslint-disable-next-line no-new
      new Notification(title, { body });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

function nextPendingReminderAt(data: AppData, now: number): number | null {
  let next: number | null = null;
  const consider = (id: string, remindAt: string | undefined, skip: boolean) => {
    if (skip || !remindAt || isReminderSlotNotified(data.notifiedReminderIds, id, remindAt)) return;
    const t = Date.parse(remindAt);
    if (Number.isNaN(t) || t <= now) return;
    next = next === null ? t : Math.min(next, t);
  };
  for (const it of data.items) consider(it.id, it.remindAt, it.done);
  for (const t of data.todoItems) {
    consider(t.id, t.remindAt, t.status === 'done' || t.status === 'cancelled');
  }
  return next;
}

export function useReminderWatcher() {
  const { data, update, ready } = useAppData();
  const electronReminders = typeof window !== 'undefined' && !!window.cadence?.syncReminders;
  const pwaOsReminders = supportsPwaOsSchedule();
  const askedPermission = useRef(false);
  // Hold the freshest data + update fn in a ref so the timer effect itself
  // can stay mounted across renders. Putting `data.items` etc in the effect
  // deps means every keystroke that changes anything reachable from `data`
  // tears down and rebuilds timers, which both leaks timer identities and
  // causes a fresh `tick()` to run on every state change.
  const latest = useRef({ data, update });
  latest.current = { data, update };
  const scheduleNextRef = useRef<(() => void) | null>(null);

  const reminderSignature = useMemo(() => {
    const parts: string[] = [];
    for (const t of data.todoItems) {
      if (!t.remindAt || t.status === 'done' || t.status === 'cancelled') continue;
      if (isReminderSlotNotified(data.notifiedReminderIds, t.id, t.remindAt)) continue;
      parts.push(`t:${t.id}:${t.remindAt}:${t.remindRepeat ?? ''}`);
    }
    for (const it of data.items) {
      if (!it.remindAt || it.done) continue;
      if (isReminderSlotNotified(data.notifiedReminderIds, it.id, it.remindAt)) continue;
      parts.push(`i:${it.id}:${it.remindAt}:${it.remindRepeat ?? ''}`);
    }
    return parts.join('|');
  }, [data.todoItems, data.items, data.notifiedReminderIds]);

  useEffect(() => {
    if (!ready) return;
    if (electronReminders) return;

    if (!askedPermission.current && 'Notification' in window && Notification.permission === 'default') {
      askedPermission.current = true;
      void Notification.requestPermission();
    }

    let timeoutId: number | undefined;
    let intervalId: number | undefined;

    const scheduleNext = () => {
      if (pwaOsReminders) return;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = undefined;
      const nextAt = nextPendingReminderAt(latest.current.data, Date.now());
      if (nextAt === null) return;
      const delay = Math.max(250, nextAt - Date.now() + 100);
      timeoutId = window.setTimeout(() => {
        void runTick();
      }, delay);
    };
    scheduleNextRef.current = scheduleNext;

    const runTick = async () => {
      const { data: d, update: up } = latest.current;
      const now = Date.now();

      // Two parallel "due" pools: the legacy team-scoped `items` (1:1
      // assigned tasks / coaching prompts) and the personal `todoItems`
      // (to-do list). Both gained `remindAt` independently; surface them
      // in one notification batch so a user with both kinds of reminders
      // doesn't get hammered twice in a single tick.
      const dueItemIds: string[] = [];
      for (const it of d.items) {
        if (!it.remindAt || it.done) continue;
        const t = Date.parse(it.remindAt);
        if (Number.isNaN(t) || t > now) continue;
        if (isReminderSlotNotified(d.notifiedReminderIds, it.id, it.remindAt)) continue;
        dueItemIds.push(it.id);
      }
      const dueTodoIds: string[] = [];
      for (const t of d.todoItems) {
        if (!t.remindAt) continue;
        // Skip rows that are no longer pending — completing / cancelling a
        // todo silently dismisses its reminder, no extra UI needed.
        if (t.status === 'done' || t.status === 'cancelled') continue;
        const ts = Date.parse(t.remindAt);
        if (Number.isNaN(ts) || ts > now) continue;
        if (isReminderSlotNotified(d.notifiedReminderIds, t.id, t.remindAt)) continue;
        dueTodoIds.push(t.id);
      }

      if (dueItemIds.length === 0 && dueTodoIds.length === 0) {
        scheduleNext();
        return;
      }

      // Index people/teams/groups once for O(1) lookups instead of O(n) per due id.
      const peopleById = new Map(d.people.map((p) => [p.id, p]));
      const teamsById = new Map(d.teams.map((t) => [t.id, t]));
      const todoGroupsById = new Map(d.todoGroups.map((g) => [g.id, g]));

      const recurringItemAdvances: Record<string, string> = {};
      const recurringTodoAdvances: Record<string, string> = {};
      const firedItemIds = new Set<string>();
      const firedTodoIds = new Set<string>();

      for (const id of dueItemIds) {
        const it = d.items.find((x) => x.id === id);
        if (!it) continue;
        const person = peopleById.get(it.personId);
        const team = person ? teamsById.get(person.teamId) : undefined;
        const label = [team?.name, person?.name].filter(Boolean).join(' · ') || 'Item';
        const title = it.kind === 'task' ? 'Task reminder' : 'Reminder';
        const ok = await fireReminderNotification(title, `${label}: ${it.title || '(untitled)'}`);
        if (!ok) continue;
        firedItemIds.add(id);
        if (it.remindRepeat && it.remindAt) {
          const next = advanceReminder(it.remindAt, it.remindRepeat);
          if (next) recurringItemAdvances[id] = next;
        }
      }

      for (const id of dueTodoIds) {
        const t = d.todoItems.find((x) => x.id === id);
        if (!t) continue;
        const group = todoGroupsById.get(t.groupId);
        const label = group?.name || 'Todo';
        const ok = await fireReminderNotification('Todo reminder', `${label}: ${t.title || '(untitled)'}`);
        if (!ok) continue;
        firedTodoIds.add(id);
        if (t.remindRepeat && t.remindAt) {
          const next = advanceReminder(t.remindAt, t.remindRepeat);
          if (next) recurringTodoAdvances[id] = next;
        }
      }

      if (firedItemIds.size === 0 && firedTodoIds.size === 0) {
        scheduleNext();
        return;
      }

      const advanceItemIds = new Set(Object.keys(recurringItemAdvances));
      const advanceTodoIds = new Set(Object.keys(recurringTodoAdvances));
      const oneShotDueKeys: string[] = [];
      for (const id of firedItemIds) {
        if (advanceItemIds.has(id)) continue;
        const it = d.items.find((x) => x.id === id);
        if (it?.remindAt) oneShotDueKeys.push(reminderNotifyKey(id, it.remindAt));
      }
      for (const id of firedTodoIds) {
        if (advanceTodoIds.has(id)) continue;
        const t = d.todoItems.find((x) => x.id === id);
        if (t?.remindAt) oneShotDueKeys.push(reminderNotifyKey(id, t.remindAt));
      }

      up((prev) => ({
        ...prev,
        notifiedReminderIds: [...new Set([...prev.notifiedReminderIds, ...oneShotDueKeys])],
        items: advanceItemIds.size
          ? prev.items.map((x) =>
              recurringItemAdvances[x.id]
                ? { ...x, remindAt: recurringItemAdvances[x.id], updatedAt: new Date().toISOString() }
                : x,
            )
          : prev.items,
        todoItems: advanceTodoIds.size
          ? prev.todoItems.map((x) =>
              recurringTodoAdvances[x.id]
                ? { ...x, remindAt: recurringTodoAdvances[x.id], updatedAt: new Date().toISOString() }
                : x,
            )
          : prev.todoItems,
      }));
      scheduleNext();
    };

    void runTick();
    if (!pwaOsReminders) {
      intervalId = window.setInterval(() => {
        void runTick();
      }, 30_000);
    } else {
      const onVisible = () => {
        if (document.visibilityState === 'visible') void runTick();
      };
      document.addEventListener('visibilitychange', onVisible);
      return () => {
        document.removeEventListener('visibilitychange', onVisible);
        scheduleNextRef.current = null;
        if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      };
    }
    scheduleNext();

    return () => {
      scheduleNextRef.current = null;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (intervalId !== undefined) window.clearInterval(intervalId);
    };
    // Only `ready` belongs in the deps. Everything else flows through `latest`.
  }, [ready, electronReminders, pwaOsReminders]);

  useEffect(() => {
    if (!ready) return;
    scheduleNextRef.current?.();
  }, [ready, reminderSignature, electronReminders, pwaOsReminders]);
}

/** Sync future reminder slots to the PWA service worker (Chrome Notification Triggers). */
export function usePwaReminderBridge() {
  const { data, ready, update } = useAppData();
  const pwaOsReminders = supportsPwaOsSchedule();

  useEffect(() => {
    if (!ready || !pwaOsReminders) return;
    const slots = collectFutureReminderSlots(data);
    void postReminderSyncToServiceWorker(slots);
  }, [ready, pwaOsReminders, data.todoItems, data.items, data.notifiedReminderIds]);

  useEffect(() => {
    if (!ready || !pwaOsReminders) return;

    const reconcileDelivered = async () => {
      const keys = await collectPwaDeliveredSlotKeys();
      if (!keys.length) return;
      update((prev) => {
        const next = [...prev.notifiedReminderIds];
        let changed = false;
        for (const key of keys) {
          const sep = key.indexOf('\u0001');
          if (sep === -1) continue;
          const itemId = key.slice(0, sep);
          const remindAt = key.slice(sep + 1);
          if (isReminderSlotNotified(prev.notifiedReminderIds, itemId, remindAt)) continue;
          if (!next.includes(key)) {
            next.push(key);
            changed = true;
          }
        }
        return changed ? { ...prev, notifiedReminderIds: next } : prev;
      });
    };

    void reconcileDelivered();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reconcileDelivered();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [ready, pwaOsReminders, update]);
}

/** Wire renderer state to Electron main-process reminder scheduler. */
export function useElectronReminderBridge() {
  const { data, ready, update } = useAppData();
  const dataRef = useRef(data);
  dataRef.current = data;

  const reminderSignature = useMemo(() => {
    const parts: string[] = [];
    for (const t of data.todoItems) {
      if (!t.remindAt || t.status === 'done' || t.status === 'cancelled') continue;
      if (isReminderSlotNotified(data.notifiedReminderIds, t.id, t.remindAt)) continue;
      parts.push(`t:${t.id}:${t.remindAt}:${t.remindRepeat ?? ''}`);
    }
    for (const it of data.items) {
      if (!it.remindAt || it.done) continue;
      if (isReminderSlotNotified(data.notifiedReminderIds, it.id, it.remindAt)) continue;
      parts.push(`i:${it.id}:${it.remindAt}:${it.remindRepeat ?? ''}`);
    }
    return parts.join('|');
  }, [data.todoItems, data.items, data.notifiedReminderIds]);

  useEffect(() => {
    if (!ready || !window.cadence?.syncReminders) return;
    void window.cadence.syncReminders(dataRef.current);
  }, [ready, reminderSignature]);

  useEffect(() => {
    const off = window.cadence?.onReminderEvent?.((evt) => {
      if (!evt?.data) return;
      if (evt.type === 'fired' || evt.type === 'delivered-sync') {
        const disk = normalizeData(evt.data as AppData);
        update((prev) => mergeReminderEventIntoAppData(prev, disk));
      }
    });
    return () => {
      off?.();
    };
  }, [update]);
}
