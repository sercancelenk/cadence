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
import {
  addItem as addItemFn,
  addPerson as addPersonFn,
  addTeam as addTeamFn,
  addTodoGroup as addTodoGroupFn,
  addTodoItem as addTodoItemFn,
  removeItem as removeItemFn,
  removePerson as removePersonFn,
  removeTeam as removeTeamFn,
  removeTodoGroup as removeTodoGroupFn,
  removeTodoItem as removeTodoItemFn,
  setLastTeamId as setLastTeamIdFn,
  toggleFavoriteTeam as toggleFavoriteTeamFn,
  toggleItemDone as toggleItemDoneFn,
  toggleTodoItem as toggleTodoItemFn,
  updateItem as updateItemFn,
  updatePerson as updatePersonFn,
  updateTeam as updateTeamFn,
  updateTodoGroup as updateTodoGroupFn,
  updateTodoItem as updateTodoItemFn,
  updateUserProfile as updateUserProfileFn,
} from './actions';
import type { AppData, Item, ItemKind, Person, Team, TodoGroup, TodoItem, UserProfile } from './model';
import { normalizeData } from './model';

type Api = {
  data: AppData;
  ready: boolean;
  replaceAll: (next: AppData) => void;
  update: (fn: (d: AppData) => AppData) => void;
  rememberTeam: (teamId: string) => void;
  addTeam: (name: string) => void;
  updateTeam: (teamId: string, patch: Partial<Pick<Team, 'name' | 'status'>>) => void;
  removeTeam: (teamId: string) => void;
  addPerson: (teamId: string, name: string, title?: string) => void;
  updatePerson: (id: string, patch: Partial<Pick<Person, 'name' | 'title' | 'scratchpad'>>) => void;
  removePerson: (id: string) => void;
  updateUserProfile: (patch: Partial<Pick<UserProfile, 'displayName' | 'jobTitle' | 'department' | 'phone' | 'bio'>>) => void;
  toggleFavoriteTeam: (teamId: string) => void;
  addItem: (
    personId: string,
    kind: ItemKind,
    fields?: Partial<Pick<Item, 'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'url' | 'category' | 'goalStatus'>>,
  ) => void;
  updateItem: (
    id: string,
    patch: Partial<Pick<Item, 'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'url' | 'done' | 'category' | 'goalStatus'>>,
  ) => void;
  toggleItemDone: (id: string) => void;
  removeItem: (id: string) => void;
  addTodoGroup: (name: string) => void;
  updateTodoGroup: (groupId: string, patch: Partial<Pick<TodoGroup, 'name' | 'sortOrder'>>) => void;
  removeTodoGroup: (groupId: string) => void;
  addTodoItem: (groupId: string, title: string) => void;
  updateTodoItem: (id: string, patch: Partial<Pick<TodoItem, 'title' | 'groupId' | 'dueAt' | 'done'>>) => void;
  toggleTodoItem: (id: string) => void;
  removeTodoItem: (id: string) => void;
};

const Ctx = createContext<Api | null>(null);

const SAVE_DEBOUNCE_MS = 400;

function storageKeyForUser(userId: string) {
  return `leeadman-data-${userId}`;
}

async function persist(userId: string, data: AppData) {
  const api = window.leeadman;
  if (api?.saveData) {
    await api.saveData(data);
    return;
  }
  try {
    localStorage.setItem(storageKeyForUser(userId), JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

async function loadInitial(userId: string): Promise<AppData> {
  const api = window.leeadman;
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
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      const seed = sessionStorage.getItem('leeadman-profile-seed');
      let seeded = false;
      if (seed?.trim()) {
        sessionStorage.removeItem('leeadman-profile-seed');
        const p = next.profile?.displayName ?? 'Me';
        if (p === 'Me' || p === 'Ben' || !next.profile?.displayName?.trim()) {
          merged = updateUserProfileFn(next, { displayName: seed.trim() });
          seeded = true;
        }
      }
      setData(merged);
      setReady(true);
      if (seeded) void persist(userId, merged);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const scheduleSave = useCallback((next: AppData) => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(uid, next);
    }, SAVE_DEBOUNCE_MS);
  }, []);

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
      if (uid) scheduleSave(normalized);
    },
    [scheduleSave],
  );

  const api = useMemo<Api>(() => {
    const empty = normalizeData(null);
    const d = data ?? empty;
    return {
      data: d,
      ready: ready && data !== null,
      replaceAll,
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
      addItem: (personId, kind, fields) => update((x) => addItemFn(x, personId, kind, fields ?? {})),
      updateItem: (id, patch) => update((x) => updateItemFn(x, id, patch)),
      toggleItemDone: (id) => update((x) => toggleItemDoneFn(x, id)),
      removeItem: (id) => update((x) => removeItemFn(x, id)),
      addTodoGroup: (name) => update((x) => addTodoGroupFn(x, name)),
      updateTodoGroup: (groupId, patch) => update((x) => updateTodoGroupFn(x, groupId, patch)),
      removeTodoGroup: (groupId) => update((x) => removeTodoGroupFn(x, groupId)),
      addTodoItem: (groupId, title) => update((x) => addTodoItemFn(x, groupId, title)),
      updateTodoItem: (id, patch) => update((x) => updateTodoItemFn(x, id, patch)),
      toggleTodoItem: (id) => update((x) => toggleTodoItemFn(x, id)),
      removeTodoItem: (id) => update((x) => removeTodoItemFn(x, id)),
    };
  }, [data, ready, update, replaceAll]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAppData(): Api {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData outside provider');
  return v;
}

export function useReminderWatcher() {
  const { data, update, ready } = useAppData();
  const askedPermission = useRef(false);

  useEffect(() => {
    if (!ready) return;

    const tick = () => {
      const now = Date.now();
      const dueIds: string[] = [];
      for (const it of data.items) {
        if (!it.remindAt || it.done) continue;
        const t = Date.parse(it.remindAt);
        if (Number.isNaN(t) || t > now) continue;
        if (data.notifiedReminderIds.includes(it.id)) continue;
        dueIds.push(it.id);
      }
      if (dueIds.length === 0) return;

      if (!askedPermission.current && 'Notification' in window && Notification.permission === 'default') {
        askedPermission.current = true;
        void Notification.requestPermission();
      }

      for (const id of dueIds) {
        const it = data.items.find((x) => x.id === id);
        if (!it) continue;
        const person = data.people.find((p) => p.id === it.personId);
        const team = person ? data.teams.find((x) => x.id === person.teamId) : undefined;
        const label = [team?.name, person?.name].filter(Boolean).join(' · ') || 'Item';
        const title = it.kind === 'task' ? 'Task reminder' : 'Reminder';
        const body = `${label}: ${it.title || '(untitled)'}`;

        if ('Notification' in window && Notification.permission === 'granted') {
          // eslint-disable-next-line no-new
          new Notification(title, { body });
        } else {
          void window.leeadman?.showNotification?.({ title, body });
        }
      }

      update((d) => ({
        ...d,
        notifiedReminderIds: [...new Set([...d.notifiedReminderIds, ...dueIds])],
      }));
    };

    tick();
    const timerId = window.setInterval(tick, 45_000);
    return () => window.clearInterval(timerId);
  }, [data.items, data.notifiedReminderIds, data.people, data.teams, ready, update]);
}
