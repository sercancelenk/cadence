// @ts-nocheck
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAccount } from './AccountContext';
import { STORAGE_PREFIX } from '../lib/appBranding';
import { isReminderSlotNotified, reminderNotifyKey } from '../lib/reminderNotify';
import { supportsPwaOsSchedule } from '../lib/reminderDelivery/capabilities';
import { collectFutureReminderSlots } from '../lib/reminderDelivery/collectReminderSlots';
import { collectPwaDeliveredSlotKeys } from '../lib/reminderDelivery/pwaReminderCatchUp';
import { cancelPendingReminderSlots } from '../lib/reminderDelivery/cancelReminderSlots';
import { mergeReminderEventIntoAppData } from '../lib/reminderDelivery/mergeReminderEvent';
import { postReminderSyncToServiceWorker } from '../lib/reminderDelivery/pwaReminderSync';
import { uuid } from '../lib/uuid';
import {
  addItem as addItemFn,
  addNote as addNoteFn,
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
import { normalizeData, shapeOfData } from '../core/model';

/**
 * Surfaced save failure. Either:
 *   - an in-renderer `persist()` error (the IPC call rejected or returned
 *     false), or
 *   - a `data:saveError` push from the main process (e.g. refused to
 *     overwrite an undecipherable file).
 *
 * The provider keeps the most recent failure in state so any view can render
 * a banner; this is critical for the user's "never lose data silently"
 * requirement.
 */
export type PersistError = {
  reason?: string;
  error?: string;
  /** ms since epoch of when we observed the failure. */
  at: number;
};

/**
 * Signal that we suspect this boot has loaded a smaller workspace than the
 * user had at the end of their previous session. Set when the freshly
 * loaded `shape.total` is meaningfully smaller than the
 * "last-known-good" fingerprint we wrote to localStorage on the most
 * recent successful save.
 *
 * We don't auto-recover: the right answer might be "the user really did
 * delete those items themselves", and silently restoring a backup would
 * be its own data-loss footgun. Instead we surface this state in a
 * Layout-level banner ("Looks like data may be missing — review backups")
 * and let the user trigger a restore explicitly.
 *
 * The banner is dismissable per-boot; dismissing also clears the
 * suspicion (i.e. we accept the current state as the new normal). Until
 * dismissed, the banner persists even if the user starts typing — that's
 * intentional, because shape changes during the session would otherwise
 * suppress a real "I just lost my data" warning.
 */
export type DataLossSuspicion = {
  current: DataShape;
  previous: DataShape;
  /** ms since epoch of the suspicious boot. */
  at: number;
};

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
      >
    >,
  ) => void;
  reorderTodoItem: (itemId: string, targetGroupId: string, beforeItemId: string | null) => void;
  updateTodoGroupPriority: (groupId: string, priority: Priority | undefined) => void;
  toggleTodoItem: (id: string) => void;
  setTodoStatus: (id: string, status: TodoStatus) => void;
  removeTodoItem: (id: string) => void;
  addNote: () => string;
  replaceNote: (note: Note) => void;
  patchNote: (
    id: string,
    patch: Partial<
      Pick<
        Note,
        'title' | 'body' | 'bodyFormat' | 'bodyPlainText' | 'pinned' | 'sortOrder' | 'lastOpenedAt'
      >
    >,
  ) => void;
  removeNote: (id: string) => void;
  setNotesLock: (lock: NotesLock | undefined) => void;
  patchUtilityDocument: (
    patch: Partial<Pick<UtilityDocument, 'body' | 'bodyFormat' | 'bodyPlainText'>>,
  ) => void;
  patchUtilityStructuredText: (
    patch: Partial<Pick<UtilityStructuredText, 'content' | 'diffContent' | 'language'>>,
  ) => void;
};

const Ctx = createContext<Api | null>(null);

const SAVE_DEBOUNCE_MS = 400;

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
async function persist(userId: string, data: AppData): Promise<{ ok: true } | { ok: false; reason: string; error?: string }> {
  const api = window.cadence;
  if (api?.saveData) {
    try {
      // Pass the expected user ID so the main process can refuse to
      // write if the active session has flipped between the moment
      // this save was queued and the moment we actually invoke the
      // IPC (see the "fast logout → login race" comment in
      // electron/main.cjs `data:save`). Defence in depth.
      const ok = await api.saveData(data, userId);
      if (ok === true) return { ok: true };
      // The main process returns `false` when `writeUserData()` refused to
      // write — either because the existing file is undecipherable, or
      // because the in-memory key was lost across a process restart (see
      // `account:session` guard in `electron/main.cjs`). The detailed
      // reason also arrives separately via `data:saveError`; this string
      // is the fallback the banner shows when nothing better has arrived.
      return {
        ok: false,
        reason: 'write-rejected',
        error: 'Your changes were not saved. Sign out and back in to unlock the data file, or open Settings → Backups & Recovery to restore an earlier snapshot.',
      };
    } catch (err) {
      return {
        ok: false,
        reason: 'ipc-error',
        error: err instanceof Error ? err.message : 'IPC saveData call failed.',
      };
    }
  }
  try {
    localStorage.setItem(storageKeyForUser(userId), JSON.stringify(data));
    return { ok: true };
  } catch (err) {
    // QuotaExceeded, SecurityError (private mode), etc.
    return {
      ok: false,
      reason: 'localstorage-error',
      error: err instanceof Error ? err.message : 'localStorage write failed.',
    };
  }
}

async function loadInitial(userId: string): Promise<AppData> {
  const api = window.cadence;
  if (api?.loadData) {
    try {
      const loaded = await api.loadData();
      return normalizeData(loaded);
    } catch {
      return normalizeData(null);
    }
  }
  try {
    const raw = localStorage.getItem(storageKeyForUser(userId));
    return normalizeData(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeData(null);
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
  // The most recent payload pending a debounced save, kept so we can flush it
  // synchronously on tab close / unmount.
  const pendingSave = useRef<AppData | null>(null);

  // Bubble main-process save failures (e.g. "refused to overwrite an
  // undecipherable file") up to the global banner. This complements the
  // try/catch in `runPersist` because some failures only come from main,
  // not from a rejected IPC call.
  useEffect(() => {
    const off = window.cadence?.onSaveError?.((evt) => {
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

  const runPersist = useCallback(async (uid: string, payload: AppData) => {
    setSaving(true);
    try {
      const r = await persist(uid, payload);
      if (r.ok) {
        setLastSavedAt(Date.now());
        setLastSaveError(null);
        // Pin the post-save shape as the new last-known-good fingerprint.
        // We deliberately update on EVERY successful save (not just
        // session end) so a power loss between saves still leaves a
        // fingerprint matching the last persisted state.
        try { writeLastShape(uid, shapeOfData(payload)); } catch { /* best effort */ }
      } else {
        setLastSaveError({ reason: r.reason, error: r.error, at: Date.now() });
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const flushPendingSave = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const uid = userIdRef.current;
    const next = pendingSave.current;
    if (!uid || !next) return;
    pendingSave.current = null;
    await runPersist(uid, next);
  }, [runPersist]);

  // Synchronous variant used by `beforeunload` / `pagehide`. Async-await is
  // fine for promise-based persistence here because Electron `ipcRenderer`
  // can usually deliver the message before the renderer process is torn
  // down, but we explicitly don't await — we just fire and let the listener
  // resolve in the background. Worst case is the OS kills us; best case
  // (and the common case) is the message reaches main before we die.
  const flushPendingSaveSync = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const uid = userIdRef.current;
    const next = pendingSave.current;
    if (!uid || !next) return;
    pendingSave.current = null;
    void runPersist(uid, next);
  }, [runPersist]);

  // Best-effort: flush before the browser/Electron tab actually goes away so
  // the user never loses the last 400ms of typing on an abrupt close.
  //
  // Mobile Safari is the picky one here: it frequently freezes a page on
  // `visibilitychange → hidden` (background tab, home button, app switcher)
  // and only later fires `pagehide` when the OS actually tears the process
  // down — long after our 400 ms save timer would have lost the chance.
  // Adding the visibility listener makes the persistence path defensive
  // against PWA suspensions where pagehide never arrives in time.
  useEffect(() => {
    const onPageHide = () => flushPendingSaveSync();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flushPendingSaveSync();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flushPendingSaveSync();
    };
  }, [flushPendingSaveSync]);

  useEffect(() => {
    if (!userId) {
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
      const next = await loadInitial(userId);
      if (cancelled) return;
      let merged = next;
      const seed = sessionStorage.getItem(`${STORAGE_PREFIX}-profile-seed`);
      let seeded = false;
      if (seed?.trim()) {
        sessionStorage.removeItem(`${STORAGE_PREFIX}-profile-seed`);
        const p = next.profile?.displayName ?? 'Me';
        if (p === 'Me' || p === 'Ben' || !next.profile?.displayName?.trim()) {
          merged = updateUserProfileFn(next, { displayName: seed.trim() });
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
    if (!uid) return;
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

  const reload = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    // Cancel any pending debounced save so we don't immediately re-overwrite
    // the file we just restored from disk.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = null;
    setReady(false);
    const next = await loadInitial(uid);
    setData(next);
    setReady(true);
    // After a restore/reload the on-disk file is, by definition, the source
    // of truth again — any earlier save-rejection banner refers to a
    // problem that no longer exists. Clearing it prevents the confusing
    // "uyarı çıktı + data yüklendi" stacked state the user reported.
    setLastSaveError(null);
    // Likewise: a restore is the user's positive acknowledgement that the
    // file is now what they want. Clear the data-loss suspicion AND
    // update the fingerprint to the restored shape so the next boot
    // doesn't re-fire the banner against the older (pre-restore) marker.
    setDataLossSuspicion(null);
    try { writeLastShape(uid, shapeOfData(next)); } catch { /* best effort */ }
  }, []);

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
      lastSaveError,
      lastSavedAt,
      saving,
      clearSaveError: () => setLastSaveError(null),
      dataLossSuspicion,
      dismissDataLossSuspicion,
      currentShape: shapeOfData(d),
      flushPendingSave,
      rememberTeam: (teamId) => update((x) => setLastTeamIdFn(x, teamId)),
      update,
      addTeam: (name) => update((x) => addTeamFn(x, name)),
      updateTeam: (teamId, patch) => update((x) => updateTeamFn(x, teamId, patch)),
      removeTeam: (teamId) => update((x) => removeTeamFn(x, teamId)),
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
      addNote: () => {
        const id = uuid();
        update((x) => addNoteFn(x, id));
        return id;
      },
      replaceNote: (note) => update((x) => replaceNoteFn(x, note)),
      patchNote: (id, patch) => update((x) => patchNoteFn(x, id, patch)),
      removeNote: (id) => update((x) => removeNoteFn(x, id)),
      setNotesLock: (lock) => update((x) => setNotesLockFn(x, lock)),
      patchUtilityDocument: (patch) => update((x) => patchUtilityDocumentFn(x, patch)),
      patchUtilityStructuredText: (patch) => update((x) => patchUtilityStructuredTextFn(x, patch)),
    };
  }, [data, ready, update, replaceAll, reload, lastSaveError, lastSavedAt, saving, dataLossSuspicion, dismissDataLossSuspicion, flushPendingSave]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAppData(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside provider');
  return v;
}

/**
 * Returns the next reminder timestamp for a recurring reminder.
 * - 'daily'   → +1 day
 * - 'weekly'  → +7 days
 * - 'monthly' → +1 month (clamping day-of-month overflow handled by Date)
 *
 * If the original timestamp is in the past by more than one full cycle,
 * we still only advance by a single cycle so the user can catch up on
 * missed runs incrementally instead of all at once.
 */
function advanceReminder(iso: string, repeat: 'daily' | 'weekly' | 'monthly'): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

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
