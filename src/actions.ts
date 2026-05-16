import { v4 as uuid } from 'uuid';
import type { AppData, GoalStatus, Item, ItemKind, Person, Team, TodoGroup, TodoItem, UserProfile } from './model';
import { isLeaderPerson, isSelfPerson, nowIso, selfPersonIdForTeam, leaderPersonIdForTeam } from './model';

export function addTeam(data: AppData, name: string): AppData {
  const t = nowIso();
  const teamId = uuid();
  const selfId = selfPersonIdForTeam(teamId);
  const leaderId = leaderPersonIdForTeam(teamId);
  const team: Team = { id: teamId, name: name.trim() || 'New team', createdAt: t, status: 'active' };
  const self: Person = {
    id: selfId,
    teamId,
    name: 'Me',
    isSelf: true,
    scratchpad: '',
    createdAt: t,
  };
  const leader: Person = {
    id: leaderId,
    teamId,
    name: 'My leader',
    scratchpad: '',
    createdAt: t,
  };
  return {
    ...data,
    teams: [...data.teams, team],
    people: [...data.people, self, leader],
    lastTeamId: teamId,
  };
}

export function updateTeam(data: AppData, teamId: string, patch: Partial<Pick<Team, 'name' | 'status'>>): AppData {
  return {
    ...data,
    teams: data.teams.map((x) =>
      x.id === teamId
        ? {
            ...x,
            name: patch.name !== undefined ? patch.name.trim() || x.name : x.name,
            status: patch.status !== undefined ? patch.status : x.status,
          }
        : x,
    ),
  };
}

export function removeTeam(data: AppData, teamId: string): AppData {
  const personIds = new Set(data.people.filter((p) => p.teamId === teamId).map((p) => p.id));
  const teams = data.teams.filter((t) => t.id !== teamId);
  const people = data.people.filter((p) => p.teamId !== teamId);
  const items = data.items.filter((it) => !personIds.has(it.personId));
  const lastTeamId =
    data.lastTeamId === teamId ? teams[0]?.id : data.lastTeamId && teams.some((t) => t.id === data.lastTeamId)
      ? data.lastTeamId
      : teams[0]?.id;
  const profile = data.profile
    ? {
        ...data.profile,
        favoriteTeamIds: data.profile.favoriteTeamIds.filter((id) => id !== teamId),
      }
    : { displayName: 'Me', favoriteTeamIds: [] };
  return {
    ...data,
    teams,
    people,
    items,
    profile,
    notifiedReminderIds: data.notifiedReminderIds.filter((nid) => {
      const it = data.items.find((i) => i.id === nid);
      return !it || !personIds.has(it.personId);
    }),
    lastTeamId,
  };
}

export function addPerson(data: AppData, teamId: string, name: string, title?: string): AppData {
  if (!data.teams.some((t) => t.id === teamId)) return data;
  const t = nowIso();
  const p: Person = {
    id: uuid(),
    teamId,
    name: name.trim() || 'Unnamed',
    title: title?.trim() || undefined,
    scratchpad: '',
    createdAt: t,
  };
  return { ...data, people: [...data.people, p] };
}

export function updatePerson(
  data: AppData,
  id: string,
  patch: Partial<Pick<Person, 'name' | 'title' | 'scratchpad'>>,
): AppData {
  return {
    ...data,
    people: data.people.map((p) => {
      if (p.id !== id) return p;
      if (isSelfPerson(p) || isLeaderPerson(p)) {
        return {
          ...p,
          name: patch.name?.trim() ? patch.name.trim() : p.name,
          title: patch.title !== undefined ? patch.title.trim() || undefined : p.title,
          scratchpad: patch.scratchpad !== undefined ? patch.scratchpad : p.scratchpad,
        };
      }
      return {
        ...p,
        name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
        title: patch.title !== undefined ? patch.title.trim() || undefined : p.title,
        scratchpad: patch.scratchpad !== undefined ? patch.scratchpad : p.scratchpad,
      };
    }),
  };
}

export function removePerson(data: AppData, id: string): AppData {
  const p = data.people.find((x) => x.id === id);
  if (!p || isSelfPerson(p) || isLeaderPerson(p)) return data;
  return {
    ...data,
    people: data.people.filter((x) => x.id !== id),
    items: data.items.filter((it) => it.personId !== id),
    notifiedReminderIds: data.notifiedReminderIds.filter((nid) => {
      const it = data.items.find((i) => i.id === nid);
      return !it || it.personId !== id;
    }),
  };
}

export function setLastTeamId(data: AppData, teamId: string | undefined): AppData {
  if (teamId && !data.teams.some((t) => t.id === teamId)) return data;
  return { ...data, lastTeamId: teamId };
}

export function addItem(
  data: AppData,
  personId: string,
  kind: ItemKind,
  fields: Partial<Pick<Item, 'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'url' | 'category' | 'goalStatus'>>,
): AppData {
  if (!data.people.some((p) => p.id === personId)) return data;
  const t = nowIso();
  const allowedGoal: GoalStatus[] = ['planned', 'active', 'completed', 'cancelled'];
  const goalStatus: GoalStatus | undefined =
    kind === 'goal'
      ? fields.goalStatus && allowedGoal.includes(fields.goalStatus)
        ? fields.goalStatus
        : 'planned'
      : undefined;
  const item: Item = {
    id: uuid(),
    personId,
    kind,
    title: fields.title?.trim() || defaultTitle(kind),
    body: fields.body?.trim() || '',
    category: fields.category?.trim() || undefined,
    dueAt: fields.dueAt || undefined,
    startAt: kind === 'goal' && fields.startAt ? fields.startAt : undefined,
    goalStatus,
    remindAt: fields.remindAt || undefined,
    url: kind === 'document' ? fields.url?.trim() || undefined : undefined,
    done: kind === 'goal' ? goalStatus === 'completed' : false,
    createdAt: t,
    updatedAt: t,
  };
  return {
    ...data,
    items: [item, ...data.items],
    notifiedReminderIds: data.notifiedReminderIds.filter((x) => x !== item.id),
  };
}

function defaultTitle(kind: ItemKind): string {
  switch (kind) {
    case 'task':
      return 'New task';
    case 'note':
      return 'New note';
    case 'goal':
      return 'New goal';
    case 'document':
      return 'New document';
    default:
      return 'New item';
  }
}

export function updateItem(
  data: AppData,
  id: string,
  patch: Partial<Pick<Item, 'title' | 'body' | 'dueAt' | 'startAt' | 'remindAt' | 'url' | 'done' | 'category' | 'goalStatus'>>,
): AppData {
  let clearedNotify = false;
  const items = data.items.map((it) => {
    if (it.id !== id) return it;
    if (patch.remindAt !== undefined && patch.remindAt !== it.remindAt) clearedNotify = true;

    const title = patch.title !== undefined ? patch.title.trim() || it.title : it.title;
    const body = patch.body !== undefined ? patch.body : it.body;
    const dueAt = patch.dueAt !== undefined ? patch.dueAt || undefined : it.dueAt;
    const startAt =
      it.kind === 'goal' ? (patch.startAt !== undefined ? patch.startAt || undefined : it.startAt) : undefined;
    const remindAt = patch.remindAt !== undefined ? patch.remindAt || undefined : it.remindAt;
    const url = patch.url !== undefined ? patch.url || undefined : it.url;
    const category = patch.category !== undefined ? patch.category?.trim() || undefined : it.category;

    let done = it.done;
    let doneAt = it.doneAt;
    let goalStatus = it.kind === 'goal' ? it.goalStatus : undefined;

    if (it.kind === 'goal') {
      if (patch.goalStatus !== undefined) {
        goalStatus = patch.goalStatus;
        done = patch.goalStatus === 'completed';
        doneAt = done ? it.doneAt ?? nowIso() : undefined;
      } else if (patch.done !== undefined) {
        done = patch.done;
        goalStatus = done ? 'completed' : 'active';
        doneAt = done ? it.doneAt ?? nowIso() : undefined;
      }
    } else if (patch.done === true && !it.done) {
      done = true;
      doneAt = nowIso();
    } else if (patch.done === false) {
      done = false;
      doneAt = undefined;
    }

    return {
      ...it,
      title,
      body,
      dueAt,
      startAt,
      remindAt,
      url,
      category,
      goalStatus: it.kind === 'goal' ? goalStatus : undefined,
      done,
      doneAt,
      updatedAt: nowIso(),
    };
  });
  let notified = clearedNotify ? data.notifiedReminderIds.filter((x) => x !== id) : data.notifiedReminderIds;
  const markedDoneId = data.items.find((it) => it.id === id && patch.done === true && !it.done)?.id;
  if (markedDoneId) notified = notified.filter((x) => x !== markedDoneId);
  return {
    ...data,
    items,
    notifiedReminderIds: notified,
  };
}

export function toggleItemDone(data: AppData, id: string): AppData {
  const it = data.items.find((i) => i.id === id);
  if (!it || (it.kind !== 'task' && it.kind !== 'goal')) return data;
  if (it.kind === 'goal') {
    const nextDone = !it.done;
    return updateItem(data, id, { done: nextDone, goalStatus: nextDone ? 'completed' : 'active' });
  }
  return updateItem(data, id, { done: !it.done });
}

export function removeItem(data: AppData, id: string): AppData {
  return {
    ...data,
    items: data.items.filter((i) => i.id !== id),
    notifiedReminderIds: data.notifiedReminderIds.filter((x) => x !== id),
  };
}

export function updateUserProfile(
  data: AppData,
  patch: Partial<Pick<UserProfile, 'displayName' | 'jobTitle' | 'department' | 'phone' | 'bio'>>,
): AppData {
  const p = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };
  return {
    ...data,
    profile: {
      ...p,
      displayName: patch.displayName !== undefined ? (patch.displayName.trim() ? patch.displayName.trim() : p.displayName) : p.displayName,
      jobTitle: patch.jobTitle !== undefined ? patch.jobTitle.trim() || undefined : p.jobTitle,
      department: patch.department !== undefined ? patch.department.trim() || undefined : p.department,
      phone: patch.phone !== undefined ? patch.phone.trim() || undefined : p.phone,
      bio: patch.bio !== undefined ? patch.bio.trim() || undefined : p.bio,
    },
  };
}

export function toggleFavoriteTeam(data: AppData, teamId: string): AppData {
  if (!data.teams.some((t) => t.id === teamId)) return data;
  const p = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };
  const fav = p.favoriteTeamIds.filter((id) => data.teams.some((t) => t.id === id));
  const has = fav.includes(teamId);
  const next = has ? fav.filter((x) => x !== teamId) : [teamId, ...fav.filter((x) => x !== teamId)];
  return { ...data, profile: { ...p, favoriteTeamIds: next } };
}

export function addTodoGroup(data: AppData, name: string): AppData {
  const t = nowIso();
  const maxOrder = Math.max(0, ...data.todoGroups.map((g) => g.sortOrder));
  const g: TodoGroup = {
    id: uuid(),
    name: name.trim() || 'New list',
    sortOrder: maxOrder + 1,
    createdAt: t,
  };
  return { ...data, todoGroups: [...data.todoGroups, g] };
}

export function updateTodoGroup(data: AppData, groupId: string, patch: Partial<Pick<TodoGroup, 'name' | 'sortOrder'>>): AppData {
  return {
    ...data,
    todoGroups: data.todoGroups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            name: patch.name !== undefined ? patch.name.trim() || g.name : g.name,
            sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : g.sortOrder,
          }
        : g,
    ),
  };
}

export function removeTodoGroup(data: AppData, groupId: string): AppData {
  if (data.todoGroups.length <= 1) return data;
  const fallback = data.todoGroups.find((g) => g.id !== groupId)?.id;
  if (!fallback) return data;
  const todoGroups = data.todoGroups.filter((g) => g.id !== groupId);
  if (todoGroups.length === 0) return data;
  const todoItems = data.todoItems.map((x) => (x.groupId === groupId ? { ...x, groupId: fallback } : x));
  return { ...data, todoGroups, todoItems };
}

export function addTodoItem(data: AppData, groupId: string, title: string): AppData {
  const gid = data.todoGroups.some((g) => g.id === groupId) ? groupId : data.todoGroups[0]?.id;
  if (!gid) return data;
  const t = nowIso();
  const item: TodoItem = {
    id: uuid(),
    groupId: gid,
    title: title.trim() || 'Untitled task',
    done: false,
    createdAt: t,
    updatedAt: t,
  };
  return { ...data, todoItems: [item, ...data.todoItems] };
}

export function updateTodoItem(
  data: AppData,
  id: string,
  patch: Partial<Pick<TodoItem, 'title' | 'groupId' | 'dueAt' | 'done'>>,
): AppData {
  return {
    ...data,
    todoItems: data.todoItems.map((x) => {
      if (x.id !== id) return x;
      const groupId =
        patch.groupId !== undefined && data.todoGroups.some((g) => g.id === patch.groupId) ? patch.groupId : x.groupId;
      let done = x.done;
      let updatedAt = nowIso();
      if (patch.done !== undefined) done = patch.done;
      return {
        ...x,
        title: patch.title !== undefined ? patch.title.trim() || x.title : x.title,
        groupId,
        dueAt: patch.dueAt !== undefined ? patch.dueAt || undefined : x.dueAt,
        done,
        updatedAt,
      };
    }),
  };
}

export function toggleTodoItem(data: AppData, id: string): AppData {
  const x = data.todoItems.find((t) => t.id === id);
  if (!x) return data;
  return updateTodoItem(data, id, { done: !x.done });
}

export function removeTodoItem(data: AppData, id: string): AppData {
  return { ...data, todoItems: data.todoItems.filter((x) => x.id !== id) };
}
