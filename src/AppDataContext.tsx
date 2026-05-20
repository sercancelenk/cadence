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
import { STORAGE_PREFIX } from './lib/appBranding';
import { uuid } from './lib/uuid';
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
} from './actions';
import type {
  AISettings,
  AppData,
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
} from './model';
import { normalizeData } from './model';

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
  addTodoGroup: (name: string) => void;
  updateTodoGroup: (
    groupId: string,
    patch: Partial<Pick<TodoGroup, 'name' | 'sortOrder' | 'pinned' | 'archived'>>,
  ) => void;
  moveTodoGroup: (groupId: string, direction: 'up' | 'down') => void;
  reorderTodoGroup: (groupId: string, beforeGroupId: string | null) => void;
  clearCompletedInGroup: (groupId: string) => void;
  markAllCompleteInGroup: (groupId: string) => void;
  removeTodoGroup: (groupId: string) => void;
  addTodoItem: (groupId: string, title: string, extras?: { priority?: Priority; dueAt?: string }) => void;
  updateTodoItem: (
    id: string,
    patch: Partial<
      Pick<
        TodoItem,
        | 'title'
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
    patch: Partial<Pick<Note, 'title' | 'body' | 'pinned' | 'sortOrder' | 'lastOpenedAt'>>,
  ) => void;
  removeNote: (id: string) => void;
  setNotesLock: (lock: NotesLock | undefined) => void;
};

const Ctx = createContext<Api | null>(null);

const SAVE_DEBOUNCE_MS = 400;

function storageKeyForUser(userId: string) {
  return `${STORAGE_PREFIX}-data-${userId}`;
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
      const ok = await api.saveData(data);
      if (ok === true) return { ok: true };
      // The main process returns `false` when `writeUserData()` refused to
      // write (e.g. existing file is undecipherable). The detailed reason
      // also arrives via the `data:saveError` IPC channel.
      return { ok: false, reason: 'write-rejected', error: 'Main process rejected the write.' };
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
      return;
    }
    let cancelled = false;
    setReady(false);
    setData(null);
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
  }, []);

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
      flushPendingSave,
      rememberTeam: (teamId) => update((x) => setLastTeamIdFn(x, teamId)),
      update,
      addTeam: (name) => update((x) => addTeamFn(x, name)),
      updateTeam: (teamId, patch) => update((x) => updateTeamFn(x, teamId, patch)),
      removeTeam: (teamId) => update((x) => removeTeamFn(x, teamId)),
      addPerson: (teamId, name, title) => update((x) => addPersonFn(x, teamId, name, title)),
      updatePerson: (id, patch) => update((x) => updatePersonFn(x, id, patch)),
      removePerson: (id) => update((x) => removePersonFn(x, id)),
      updateUserProfile: (patch) => update((x) => updateUserProfileFn(x, patch)),
      toggleFavoriteTeam: (teamId) => update((x) => toggleFavoriteTeamFn(x, teamId)),
      updateAISettings: (patch) => update((x) => updateAISettingsFn(x, patch)),
      addItem: (personId, kind, fields) => update((x) => addItemFn(x, personId, kind, fields ?? {})),
      updateItem: (id, patch) => update((x) => updateItemFn(x, id, patch)),
      toggleItemDone: (id) => update((x) => toggleItemDoneFn(x, id)),
      removeItem: (id) => update((x) => removeItemFn(x, id)),
      addTodoGroup: (name) => update((x) => addTodoGroupFn(x, name)),
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
      removeTodoItem: (id) => update((x) => removeTodoItemFn(x, id)),
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
    };
  }, [data, ready, update, replaceAll, reload, lastSaveError, lastSavedAt, saving, flushPendingSave]);

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

export function useReminderWatcher() {
  const { data, update, ready } = useAppData();
  const askedPermission = useRef(false);
  // Hold the freshest data + update fn in a ref so the timer effect itself
  // can stay mounted across renders. Putting `data.items` etc in the effect
  // deps means every keystroke that changes anything reachable from `data`
  // tears down and rebuilds the 45s interval, which both leaks timer
  // identities and causes a fresh `tick()` to run on every state change.
  const latest = useRef({ data, update });
  latest.current = { data, update };

  useEffect(() => {
    if (!ready) return;

    const tick = () => {
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
        if (d.notifiedReminderIds.includes(it.id)) continue;
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
        if (d.notifiedReminderIds.includes(t.id)) continue;
        dueTodoIds.push(t.id);
      }
      if (dueItemIds.length === 0 && dueTodoIds.length === 0) return;

      if (!askedPermission.current && 'Notification' in window && Notification.permission === 'default') {
        askedPermission.current = true;
        void Notification.requestPermission();
      }

      // Index people/teams/groups once for O(1) lookups instead of O(n) per due id.
      const peopleById = new Map(d.people.map((p) => [p.id, p]));
      const teamsById = new Map(d.teams.map((t) => [t.id, t]));
      const todoGroupsById = new Map(d.todoGroups.map((g) => [g.id, g]));

      const recurringItemAdvances: Record<string, string> = {};
      const recurringTodoAdvances: Record<string, string> = {};
      const fire = (title: string, body: string) => {
        if ('Notification' in window && Notification.permission === 'granted') {
          // eslint-disable-next-line no-new
          new Notification(title, { body });
        } else {
          void window.cadence?.showNotification?.({ title, body });
        }
      };

      for (const id of dueItemIds) {
        const it = d.items.find((x) => x.id === id);
        if (!it) continue;
        const person = peopleById.get(it.personId);
        const team = person ? teamsById.get(person.teamId) : undefined;
        const label = [team?.name, person?.name].filter(Boolean).join(' · ') || 'Item';
        const title = it.kind === 'task' ? 'Task reminder' : 'Reminder';
        fire(title, `${label}: ${it.title || '(untitled)'}`);
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
        fire('Todo reminder', `${label}: ${t.title || '(untitled)'}`);
        if (t.remindRepeat && t.remindAt) {
          const next = advanceReminder(t.remindAt, t.remindRepeat);
          if (next) recurringTodoAdvances[id] = next;
        }
      }

      const advanceItemIds = new Set(Object.keys(recurringItemAdvances));
      const advanceTodoIds = new Set(Object.keys(recurringTodoAdvances));
      const oneShotDueIds = [
        ...dueItemIds.filter((id) => !advanceItemIds.has(id)),
        ...dueTodoIds.filter((id) => !advanceTodoIds.has(id)),
      ];

      up((prev) => ({
        ...prev,
        notifiedReminderIds: [...new Set([...prev.notifiedReminderIds, ...oneShotDueIds])],
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
    };

    tick();
    const timerId = window.setInterval(tick, 45_000);
    return () => window.clearInterval(timerId);
    // Only `ready` belongs in the deps. Everything else flows through `latest`.
  }, [ready]);
}
