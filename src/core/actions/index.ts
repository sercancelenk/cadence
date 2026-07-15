import { uuid } from '../../lib/uuid';
import { clearReminderNotifyKeys, reminderNotifyEntryId } from '../../lib/reminderNotify';
import type {
  AISettings,
  AppData,
  FeedbackKind,
  GoalStatus,
  Item,
  ItemKind,
  Note,
  NoteGroup,
  NotesLock,
  Person,
  Priority,
  ReminderRepeat,
  Team,
  TodoGroup,
  TodoItem,
  TodoStatus,
  UserProfile,
  UtilityDocument,
  UtilityStructuredText,
  UtilityStructuredTab,
  StructuredTextMode,
  NoteTodoLink,
} from '../model';
import {
  isSyntheticPerson,
  nowIso,
  selfPersonIdForTeam,
  leaderPersonIdForTeam,
  skipLevelPersonIdForTeam,
  DEFAULT_STRUCTURED_CONTENT,
} from '../model';

export function addTeam(data: AppData, name: string): AppData {
  const t = nowIso();
  const teamId = uuid();
  const selfId = selfPersonIdForTeam(teamId);
  const leaderId = leaderPersonIdForTeam(teamId);
  const skipLevelId = skipLevelPersonIdForTeam(teamId);
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
  const skipLevel: Person = {
    id: skipLevelId,
    teamId,
    name: 'Skip-level leader',
    scratchpad: '',
    createdAt: t,
  };
  return {
    ...data,
    teams: [...data.teams, team],
    people: [...data.people, self, leader, skipLevel],
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
      const itemId = reminderNotifyEntryId(nid);
      const it = data.items.find((i) => i.id === itemId);
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
  patch: Partial<Pick<Person, 'name' | 'title' | 'scratchpad' | 'agenda'>>,
): AppData {
  return {
    ...data,
    people: data.people.map((p) => {
      if (p.id !== id) return p;
      if (isSyntheticPerson(p)) {
        return {
          ...p,
          name: patch.name?.trim() ? patch.name.trim() : p.name,
          title: patch.title !== undefined ? patch.title.trim() || undefined : p.title,
          scratchpad: patch.scratchpad !== undefined ? patch.scratchpad : p.scratchpad,
          agenda: patch.agenda !== undefined ? patch.agenda : p.agenda,
        };
      }
      return {
        ...p,
        name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
        title: patch.title !== undefined ? patch.title.trim() || undefined : p.title,
        scratchpad: patch.scratchpad !== undefined ? patch.scratchpad : p.scratchpad,
        agenda: patch.agenda !== undefined ? patch.agenda : p.agenda,
      };
    }),
  };
}

export function removePerson(data: AppData, id: string): AppData {
  const p = data.people.find((x) => x.id === id);
  if (!p || isSyntheticPerson(p)) return data;
  return {
    ...data,
    people: data.people.filter((x) => x.id !== id),
    items: data.items.filter((it) => it.personId !== id),
    notifiedReminderIds: data.notifiedReminderIds.filter((nid) => {
      const itemId = reminderNotifyEntryId(nid);
      const it = data.items.find((i) => i.id === itemId);
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
  fields: Partial<
    Pick<
      Item,
      | 'title'
      | 'body'
      | 'dueAt'
      | 'startAt'
      | 'remindAt'
      | 'remindRepeat'
      | 'url'
      | 'category'
      | 'goalStatus'
      | 'feedbackKind'
    >
  >,
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
  const allowedFeedback: FeedbackKind[] = ['praise', 'coaching', 'concern'];
  const feedbackKind: FeedbackKind | undefined =
    kind === 'feedback'
      ? fields.feedbackKind && allowedFeedback.includes(fields.feedbackKind)
        ? fields.feedbackKind
        : 'coaching'
      : undefined;
  const allowedRepeat: ReminderRepeat[] = ['daily', 'weekly', 'monthly'];
  const remindRepeat: ReminderRepeat | undefined =
    fields.remindAt && fields.remindRepeat && allowedRepeat.includes(fields.remindRepeat)
      ? fields.remindRepeat
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
    feedbackKind,
    remindAt: fields.remindAt || undefined,
    remindRepeat,
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
    case 'feedback':
      return 'New feedback';
    default:
      return 'New item';
  }
}

export function updateItem(
  data: AppData,
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
): AppData {
  let clearedNotify = false;
  const items = data.items.map((it) => {
    if (it.id !== id) return it;
    if (
      ('remindAt' in patch && patch.remindAt !== it.remindAt) ||
      ('remindRepeat' in patch && patch.remindRepeat !== it.remindRepeat)
    ) {
      clearedNotify = true;
    }

    const title = patch.title !== undefined ? patch.title.trim() || it.title : it.title;
    const body = patch.body !== undefined ? patch.body : it.body;
    const dueAt = patch.dueAt !== undefined ? patch.dueAt || undefined : it.dueAt;
    const startAt =
      it.kind === 'goal' ? (patch.startAt !== undefined ? patch.startAt || undefined : it.startAt) : undefined;
    const remindAt = patch.remindAt !== undefined ? patch.remindAt || undefined : it.remindAt;
    const remindRepeat =
      patch.remindRepeat !== undefined ? patch.remindRepeat || undefined : it.remindRepeat;
    const url = patch.url !== undefined ? patch.url || undefined : it.url;
    const category = patch.category !== undefined ? patch.category?.trim() || undefined : it.category;
    const feedbackKind =
      it.kind === 'feedback'
        ? patch.feedbackKind !== undefined
          ? patch.feedbackKind
          : it.feedbackKind ?? 'coaching'
        : undefined;

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
      remindRepeat: remindAt ? remindRepeat : undefined,
      url,
      category,
      goalStatus: it.kind === 'goal' ? goalStatus : undefined,
      feedbackKind,
      done,
      doneAt,
      updatedAt: nowIso(),
    };
  });
  let notified = clearedNotify
    ? clearReminderNotifyKeys(data.notifiedReminderIds, id)
    : data.notifiedReminderIds;
  // Marking done must clear slot keys (`id\u0001iso`), not only a bare id —
  // otherwise undo keeps the same remindAt but `isReminderSlotNotified` stays
  // true and the reminder never fires again.
  const markedDoneId = data.items.find((it) => it.id === id && patch.done === true && !it.done)?.id;
  if (markedDoneId) notified = clearReminderNotifyKeys(notified, markedDoneId);
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
    notifiedReminderIds: clearReminderNotifyKeys(data.notifiedReminderIds, id),
  };
}

export function updateUserProfile(
  data: AppData,
  patch: Partial<Pick<UserProfile, 'displayName' | 'jobTitle' | 'department' | 'phone' | 'bio' | 'avatarDataUrl'>>,
): AppData {
  const p = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };
  const avatar =
    patch.avatarDataUrl !== undefined
      ? patch.avatarDataUrl && patch.avatarDataUrl.startsWith('data:')
        ? patch.avatarDataUrl
        : undefined
      : p.avatarDataUrl;
  return {
    ...data,
    profile: {
      ...p,
      displayName: patch.displayName !== undefined ? (patch.displayName.trim() ? patch.displayName.trim() : p.displayName) : p.displayName,
      jobTitle: patch.jobTitle !== undefined ? patch.jobTitle.trim() || undefined : p.jobTitle,
      department: patch.department !== undefined ? patch.department.trim() || undefined : p.department,
      phone: patch.phone !== undefined ? patch.phone.trim() || undefined : p.phone,
      bio: patch.bio !== undefined ? patch.bio.trim() || undefined : p.bio,
      avatarDataUrl: avatar,
    },
  };
}

export function updateAISettings(
  data: AppData,
  patch: Partial<AISettings>,
): AppData {
  const current: AISettings = data.aiSettings ?? {};
  // Spread `current` first so forward-compat extras (unknown keys preserved by
  // parseAISettings via withExtras) and fields this patch does not touch (e.g.
  // extractionGuidance when saving provider/apiKey) survive the update.
  const next: AISettings = {
    ...current,
    provider: patch.provider !== undefined ? patch.provider || undefined : current.provider,
    apiKey:
      patch.apiKey !== undefined
        ? patch.apiKey.trim()
          ? patch.apiKey.trim()
          : undefined
        : current.apiKey,
    model:
      patch.model !== undefined
        ? patch.model.trim()
          ? patch.model.trim()
          : undefined
        : current.model,
    systemPrompt:
      patch.systemPrompt !== undefined
        ? patch.systemPrompt.trim()
          ? patch.systemPrompt
          : undefined
        : current.systemPrompt,
    extractionGuidance:
      patch.extractionGuidance !== undefined
        ? patch.extractionGuidance.trim()
          ? patch.extractionGuidance
          : undefined
        : current.extractionGuidance,
  };
  // Empty when every value (including any preserved forward-compat extra) is blank.
  const isEmpty = Object.values(next as Record<string, unknown>).every(
    (v) => v === undefined || v === null || v === '',
  );
  return { ...data, aiSettings: isEmpty ? undefined : next };
}

export function toggleFavoriteTeam(data: AppData, teamId: string): AppData {
  if (!data.teams.some((t) => t.id === teamId)) return data;
  const p = data.profile ?? { displayName: 'Me', favoriteTeamIds: [] };
  const fav = p.favoriteTeamIds.filter((id) => data.teams.some((t) => t.id === id));
  const has = fav.includes(teamId);
  const next = has ? fav.filter((x) => x !== teamId) : [teamId, ...fav.filter((x) => x !== teamId)];
  return { ...data, profile: { ...p, favoriteTeamIds: next } };
}

export function addTodoGroup(data: AppData, name: string, id?: string): AppData {
  const t = nowIso();
  const maxOrder = Math.max(0, ...data.todoGroups.map((g) => g.sortOrder));
  const g: TodoGroup = {
    id: id ?? uuid(),
    name: name.trim() || 'New list',
    sortOrder: maxOrder + 1,
    createdAt: t,
  };
  return { ...data, todoGroups: [...data.todoGroups, g] };
}

export function updateTodoGroup(
  data: AppData,
  groupId: string,
  patch: Partial<Pick<TodoGroup, 'name' | 'sortOrder' | 'pinned' | 'archived'>>,
): AppData {
  return {
    ...data,
    todoGroups: data.todoGroups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            name: patch.name !== undefined ? patch.name.trim() || g.name : g.name,
            sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : g.sortOrder,
            pinned: patch.pinned !== undefined ? (patch.pinned ? true : undefined) : g.pinned,
            archived: patch.archived !== undefined ? (patch.archived ? true : undefined) : g.archived,
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

/**
 * Reorder `groupId` so it sits immediately before `beforeGroupId` (or at the
 * end when `beforeGroupId` is `null`). Pinned/archived buckets are kept as
 * separate visibility groups: when the source and target are in the same
 * bucket we only re-number that bucket; when they differ we move the source
 * into the destination bucket (e.g. dropping a pinned list below an unpinned
 * one will unpin it). This is the action used by the drag-and-drop reorder.
 */
export function reorderTodoGroup(
  data: AppData,
  groupId: string,
  beforeGroupId: string | null,
): AppData {
  const target = data.todoGroups.find((g) => g.id === groupId);
  if (!target) return data;
  if (beforeGroupId === groupId) return data;

  const before = beforeGroupId ? data.todoGroups.find((g) => g.id === beforeGroupId) : null;
  const destPinned = before ? !!before.pinned : false;
  const destArchived = before ? !!before.archived : !!target.archived;

  const willTogglePin = !!target.pinned !== destPinned;
  const willToggleArchive = !!target.archived !== destArchived;

  const peers = data.todoGroups
    .filter((g) => !!g.pinned === destPinned && !!g.archived === destArchived && g.id !== groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const insertAt = before ? peers.findIndex((p) => p.id === before.id) : peers.length;
  const ordered: TodoGroup[] = [
    ...peers.slice(0, Math.max(0, insertAt)),
    {
      ...target,
      pinned: willTogglePin ? (destPinned ? true : undefined) : target.pinned,
      archived: willToggleArchive ? (destArchived ? true : undefined) : target.archived,
    },
    ...peers.slice(Math.max(0, insertAt)),
  ];

  // Build a fresh sortOrder for this bucket; offset within full list keeps
  // pinned-on-top ordering stable relative to unpinned items.
  const offset = destPinned ? 0 : 1_000_000;
  const archiveOffset = destArchived ? 2_000_000 : 0;
  const updates = new Map<string, number>();
  ordered.forEach((g, idx) => {
    updates.set(g.id, offset + archiveOffset + idx);
  });

  return {
    ...data,
    todoGroups: data.todoGroups.map((g) => {
      if (g.id === target.id) {
        return {
          ...g,
          pinned: willTogglePin ? (destPinned ? true : undefined) : g.pinned,
          archived: willToggleArchive ? (destArchived ? true : undefined) : g.archived,
          sortOrder: updates.get(g.id) ?? g.sortOrder,
        };
      }
      const next = updates.get(g.id);
      return next !== undefined ? { ...g, sortOrder: next } : g;
    }),
  };
}

/**
 * Move a todo group one position up or down within its visibility group
 * (pinned-vs-not). Pinned groups only reorder against other pinned, and
 * vice versa, to keep the "pinned-on-top" invariant intact.
 */
export function moveTodoGroup(data: AppData, groupId: string, direction: 'up' | 'down'): AppData {
  const target = data.todoGroups.find((g) => g.id === groupId);
  if (!target) return data;
  const peers = [...data.todoGroups]
    .filter((g) => !!g.pinned === !!target.pinned && !!g.archived === !!target.archived)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = peers.findIndex((g) => g.id === groupId);
  if (idx < 0) return data;
  const swapWith = direction === 'up' ? peers[idx - 1] : peers[idx + 1];
  if (!swapWith) return data;
  const a = target.sortOrder;
  const b = swapWith.sortOrder;
  return {
    ...data,
    todoGroups: data.todoGroups.map((g) => {
      if (g.id === target.id) return { ...g, sortOrder: b };
      if (g.id === swapWith.id) return { ...g, sortOrder: a };
      return g;
    }),
  };
}

/** Removes every completed task from the given list. */
/**
 * Drop both completed and cancelled rows from a list — the two terminal
 * states. Old builds only cleared `done` rows; cancelled items now share
 * that "no longer active" semantics so they're swept up too.
 */
export function clearCompletedInGroup(data: AppData, groupId: string): AppData {
  return {
    ...data,
    todoItems: data.todoItems.filter(
      (t) =>
        !(
          t.groupId === groupId &&
          !t.archived &&
          (t.status === 'done' || t.status === 'cancelled')
        ),
    ),
  };
}

/**
 * Marks every still-open task in the list (todo / in_progress) as done.
 * Cancelled rows are left alone — the user explicitly decided to drop
 * them, "mark all complete" shouldn't undo that decision.
 */
export function markAllCompleteInGroup(data: AppData, groupId: string): AppData {
  const now = nowIso();
  const completedIds: string[] = [];
  const todoItems = data.todoItems.map((t) => {
    if (
      t.groupId === groupId &&
      !t.archived &&
      (t.status === 'todo' || t.status === 'in_progress')
    ) {
      completedIds.push(t.id);
      // Mirror single-item completion (`updateTodoItem`): a completed todo's
      // reminder is logically void, so clear the remind fields too — leaving
      // them set would surprise-fire the moment the row is re-opened.
      return {
        ...t,
        status: 'done' as const,
        done: true,
        doneAt: t.doneAt ?? now,
        remindAt: undefined,
        remindRepeat: undefined,
        updatedAt: now,
      };
    }
    return t;
  });
  let notifiedReminderIds = data.notifiedReminderIds;
  for (const id of completedIds) {
    notifiedReminderIds = clearReminderNotifyKeys(notifiedReminderIds, id);
  }
  return { ...data, todoItems, notifiedReminderIds };
}

export function addTodoItem(
  data: AppData,
  groupId: string,
  title: string,
  extras: {
    priority?: Priority;
    dueAt?: string;
    body?: string;
    bodyFormat?: 'markdown' | 'prosemirror';
    bodyPlainText?: string;
    sourceNoteId?: string;
  } = {},
): AppData {
  const gid = data.todoGroups.some((g) => g.id === groupId) ? groupId : data.todoGroups[0]?.id;
  if (!gid) return data;
  const t = nowIso();
  // New items go to the TOP of the list (sortOrder = min - 1). This matches
  // how to-do apps usually behave when you "add task" — the new task is
  // immediately visible without scrolling.
  const minOrder = data.todoItems
    .filter((x) => x.groupId === gid)
    .reduce((acc, x) => Math.min(acc, x.sortOrder ?? 0), 0);
  // Persist body only when non-empty after trim; same normalisation as
  // `parseTodoItems` does on load, applied at the write side so a
  // user that opens-and-closes the markdown editor without typing
  // doesn't bloat the file with an empty string.
  const trimmedBody = typeof extras.body === 'string' ? extras.body : undefined;
  const body = trimmedBody && trimmedBody.trim() ? trimmedBody : undefined;
  // Source-note linking: only stamp the field when the caller actually
  // points at a note that exists. Defensive against stale UI state
  // (e.g. user deletes the note between opening the extractor and
  // clicking "Add all"); silently dropping the ref is safer than
  // creating a task that links nowhere.
  const sourceNoteId =
    typeof extras.sourceNoteId === 'string' && extras.sourceNoteId.trim()
      ? data.notes.some((n) => n.id === extras.sourceNoteId)
        ? extras.sourceNoteId
        : undefined
      : undefined;
  const item: TodoItem = {
    id: uuid(),
    groupId: gid,
    title: title.trim() || 'Untitled task',
    status: 'todo',
    done: false,
    sortOrder: minOrder - 1,
    createdAt: t,
    updatedAt: t,
    ...(extras.priority ? { priority: extras.priority } : {}),
    ...(extras.dueAt ? { dueAt: extras.dueAt } : {}),
    ...(body ? { body } : {}),
    ...(extras.bodyFormat ? { bodyFormat: extras.bodyFormat } : {}),
    ...(extras.bodyPlainText?.trim() ? { bodyPlainText: extras.bodyPlainText.trim() } : {}),
    ...(sourceNoteId ? { sourceNoteId } : {}),
  };
  const withItem = { ...data, todoItems: [item, ...data.todoItems] };
  return sourceNoteId ? linkNoteTodo(withItem, sourceNoteId, item.id) : withItem;
}

/** Idempotent N:N link between a note and a todo. */
export function linkNoteTodo(data: AppData, noteId: string, todoId: string): AppData {
  const nId = noteId.trim();
  const tId = todoId.trim();
  if (!nId || !tId) return data;
  if (!data.notes.some((n) => n.id === nId)) return data;
  if (!data.todoItems.some((t) => t.id === tId)) return data;
  const links = data.noteTodoLinks ?? [];
  if (links.some((l) => l.noteId === nId && l.todoId === tId)) return data;
  const link: NoteTodoLink = {
    id: uuid(),
    noteId: nId,
    todoId: tId,
    createdAt: nowIso(),
  };
  return { ...data, noteTodoLinks: [...links, link] };
}

/** Remove a note↔todo link if present (idempotent).
 * Also clears matching `TodoItem.sourceNoteId` so normalize/ensure cannot
 * resurrect the join on the next load.
 */
export function unlinkNoteTodo(data: AppData, noteId: string, todoId: string): AppData {
  const nId = noteId.trim();
  const tId = todoId.trim();
  if (!nId || !tId) return data;
  const links = data.noteTodoLinks ?? [];
  const nextLinks = links.filter((l) => !(l.noteId === nId && l.todoId === tId));
  const linksChanged = nextLinks.length !== links.length;

  let todosChanged = false;
  const nextTodos = data.todoItems.map((t) => {
    if (t.id !== tId || t.sourceNoteId !== nId) return t;
    todosChanged = true;
    const { sourceNoteId: _drop, ...rest } = t;
    return rest;
  });

  if (!linksChanged && !todosChanged) return data;
  return {
    ...data,
    ...(linksChanged ? { noteTodoLinks: nextLinks } : {}),
    ...(todosChanged ? { todoItems: nextTodos } : {}),
  };
}

/**
 * Apply a partial update to a single to-do item.
 *
 * `status` is the authoritative lifecycle field. `done` (legacy boolean) and
 * `doneAt` (timestamp of completion) are always derived from it so callers
 * can't put the two out of sync:
 *
 *   - If `patch.status` is given, `done` follows it and `doneAt` is stamped
 *     when transitioning into `'done'` (or cleared when transitioning out).
 *   - If `patch.done` is given (legacy callers / checkbox toggles) we map
 *     it to a status change instead and run the same bookkeeping.
 *
 * That keeps `toggleTodoItem` and per-row checkbox handlers working
 * unchanged while still letting new code drive the model via `status`.
 */
export function updateTodoItem(
  data: AppData,
  id: string,
  patch: Partial<
    Pick<
      TodoItem,
      | 'title'
      | 'body'
      | 'bodyFormat'
      | 'bodyPlainText'
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
): AppData {
  let clearedNotify = false;
  const todoItems = data.todoItems.map((x) => {
      if (x.id !== id) return x;
      if (
        ('remindAt' in patch && patch.remindAt !== x.remindAt) ||
        ('remindRepeat' in patch && patch.remindRepeat !== x.remindRepeat)
      ) {
        clearedNotify = true;
      }
      const groupId =
        patch.groupId !== undefined && data.todoGroups.some((g) => g.id === patch.groupId) ? patch.groupId : x.groupId;
      const updatedAt = nowIso();

      // Resolve next status from the patch. `status` wins over `done`
      // if both are passed; that lets explicit "set to in_progress" calls
      // survive even when an older codepath also nudges `done: false`.
      let nextStatus: TodoStatus = x.status;
      if (patch.status !== undefined) {
        nextStatus = patch.status;
      } else if (patch.done !== undefined) {
        nextStatus = patch.done ? 'done' : 'todo';
      }
      const nextDone = nextStatus === 'done';
      // Only stamp `doneAt` on a fresh transition into done — if the row
      // was already done we keep the original timestamp so analytics show
      // when it was *first* completed.
      let nextDoneAt = x.doneAt;
      if (nextDone && !x.done) nextDoneAt = updatedAt;
      else if (!nextDone) nextDoneAt = undefined;

      const priority =
        patch.priority !== undefined ? (patch.priority || undefined) : x.priority;

      const planInHub = patch.planInHub !== undefined ? patch.planInHub : x.planInHub;
      const planImportant = 'planImportant' in patch ? patch.planImportant : x.planImportant;
      const planUrgent = 'planUrgent' in patch ? patch.planUrgent : x.planUrgent;
      const planFocusToday = 'planFocusToday' in patch ? patch.planFocusToday : x.planFocusToday;
      const nextArchived =
        patch.archived !== undefined ? (patch.archived ? true : undefined) : x.archived;
      const resolvedPlanFocusToday =
        nextArchived === true ? false : planFocusToday === true ? true : undefined;

      // Reminder fields. `undefined` in the patch means "clear" (a small
      // ergonomic departure from spread semantics — but matches how the
      // rest of this function treats `dueAt` clearing). Repeating a
      // reminder past its `dueAt` doesn't make sense, but we leave that
      // policing to the watcher — here we just persist the user's intent.
      let remindAt =
        patch.remindAt !== undefined ? patch.remindAt || undefined : x.remindAt;
      let remindRepeat =
        patch.remindRepeat !== undefined ? patch.remindRepeat || undefined : x.remindRepeat;
      // Status-driven cleanup: once a todo leaves the OPEN states the
      // reminder is logically void. Leaving `remindAt` set would cause a
      // surprise ping the moment the user re-opens the row (the watcher
      // checks the field on every tick, but a past timestamp would fire
      // immediately when status flips back to `todo`).
      if (nextStatus === 'done' || nextStatus === 'cancelled' || nextArchived === true) {
        // Clearing a reminder here must also drop its notify slot keys, exactly
        // like team items on complete (see `updateItem`). Otherwise the past
        // `id\u0001iso` keys linger in `notifiedReminderIds` forever (unbounded
        // growth) and a re-schedule back to that exact timestamp stays muted.
        if (remindAt !== undefined || remindRepeat !== undefined) clearedNotify = true;
        remindAt = undefined;
        remindRepeat = undefined;
      }

      // Body patch semantics: omitted = keep existing, empty/whitespace =
      // clear (we treat both representations as "no body"). This matches
      // the way the markdown editor signals "user deleted everything" —
      // it calls `onChange('')` rather than `undefined`, and we want
      // that to land as a true clear in the file (so syncs propagate
      // the deletion).
      let nextBody: string | undefined = x.body;
      if (patch.body !== undefined) {
        const trimmed = patch.body.trim();
        nextBody = trimmed ? patch.body : undefined;
      }
      let nextBodyFormat =
        patch.bodyFormat !== undefined ? patch.bodyFormat || undefined : x.bodyFormat;
      let nextBodyPlainText =
        patch.bodyPlainText !== undefined ? patch.bodyPlainText || undefined : x.bodyPlainText;
      if (nextBody === undefined) {
        nextBodyFormat = undefined;
        nextBodyPlainText = undefined;
      }

      return {
        ...x,
        title: patch.title !== undefined ? patch.title.trim() || x.title : x.title,
        body: nextBody,
        bodyFormat: nextBodyFormat,
        bodyPlainText: nextBodyPlainText,
        groupId,
        dueAt: patch.dueAt !== undefined ? patch.dueAt || undefined : x.dueAt,
        status: nextStatus,
        done: nextDone,
        doneAt: nextDoneAt,
        priority,
        planInHub,
        planImportant,
        planUrgent,
        planFocusToday: resolvedPlanFocusToday,
        archived: nextArchived,
        remindAt,
        remindRepeat,
        updatedAt,
      };
    });
  const notifiedReminderIds = clearedNotify
    ? clearReminderNotifyKeys(data.notifiedReminderIds, id)
    : data.notifiedReminderIds;
  return {
    ...data,
    todoItems,
    notifiedReminderIds,
  };
}

/**
 * Explicit "set this item's status to X" helper.
 *
 * Thin wrapper around `updateTodoItem` so call sites (status dropdown,
 * bulk-status menu) don't have to remember the `done` ↔ `status` mapping.
 */
export function setTodoStatus(data: AppData, id: string, status: TodoStatus): AppData {
  return updateTodoItem(data, id, { status });
}

/**
 * Reorder an item within (or across) groups.
 *
 * `beforeItemId === null` puts the item at the end of `targetGroupId`.
 * If the destination group differs, the item's `groupId` is moved too — so
 * drag-and-drop between lists works for free.
 */
export function reorderTodoItem(
  data: AppData,
  itemId: string,
  targetGroupId: string,
  beforeItemId: string | null,
): AppData {
  const target = data.todoItems.find((x) => x.id === itemId);
  if (!target) return data;
  if (beforeItemId === itemId) return data;
  if (!data.todoGroups.some((g) => g.id === targetGroupId)) return data;

  const peers = data.todoItems
    .filter((x) => x.groupId === targetGroupId && x.id !== itemId)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  const insertAt = beforeItemId
    ? peers.findIndex((p) => p.id === beforeItemId)
    : peers.length;

  const ordered: TodoItem[] = [
    ...peers.slice(0, Math.max(0, insertAt)),
    { ...target, groupId: targetGroupId, updatedAt: nowIso() },
    ...peers.slice(Math.max(0, insertAt)),
  ];

  // Re-stamp sortOrder in 10-step increments to leave room for fine-grained
  // future moves without rewriting every row.
  const reordered = new Map<string, number>();
  ordered.forEach((x, idx) => reordered.set(x.id, idx * 10));

  return {
    ...data,
    todoItems: data.todoItems.map((x) => {
      const nextOrder = reordered.get(x.id);
      if (nextOrder === undefined) return x;
      const moved = x.id === itemId;
      return {
        ...x,
        groupId: moved ? targetGroupId : x.groupId,
        sortOrder: nextOrder,
        updatedAt: moved ? nowIso() : x.updatedAt,
      };
    }),
  };
}

export function updateTodoGroupPriority(
  data: AppData,
  groupId: string,
  priority: Priority | undefined,
): AppData {
  return {
    ...data,
    todoGroups: data.todoGroups.map((g) => (g.id === groupId ? { ...g, priority } : g)),
  };
}

export function toggleTodoItem(data: AppData, id: string): AppData {
  const x = data.todoItems.find((t) => t.id === id);
  if (!x) return data;
  return updateTodoItem(data, id, { done: !x.done });
}

export function removeTodoItem(data: AppData, id: string): AppData {
  const links = data.noteTodoLinks ?? [];
  const nextLinks = links.filter((l) => l.todoId !== id);
  return {
    ...data,
    todoItems: data.todoItems.filter((x) => x.id !== id),
    notifiedReminderIds: clearReminderNotifyKeys(data.notifiedReminderIds, id),
    // Prune join rows only — never cascade-delete notes.
    ...(nextLinks.length !== links.length ? { noteTodoLinks: nextLinks } : {}),
  };
}

// -- Notes -----------------------------------------------------------------
//
// The reducers here only deal with PLAINTEXT bodies and verifier blobs.
// Anything that needs to actually encrypt/decrypt happens in the view (where
// the passphrase is in scope and the result of the Web Crypto promise can be
// awaited) and is only persisted back through `replaceNote`.

/**
 * `addNote(data, id)` is intentionally pure: the caller generates the id
 * outside the reducer so React's `setState(updater)` rule (updaters MUST be
 * pure and re-runnable) holds, even under StrictMode double-invocation.
 */
export function addNote(data: AppData, id: string, groupId?: string): AppData {
  const t = nowIso();
  const gid =
    groupId && data.noteGroups.some((g) => g.id === groupId) ? groupId : undefined;
  const note: Note = {
    id,
    title: '',
    body: '',
    locked: false,
    pinned: false,
    ...(gid ? { groupId: gid } : {}),
    createdAt: t,
    updatedAt: t,
  };
  return { ...data, notes: [note, ...data.notes] };
}

export function replaceNote(data: AppData, note: Note): AppData {
  return {
    ...data,
    notes: data.notes.map((n) => (n.id === note.id ? { ...note, updatedAt: nowIso() } : n)),
  };
}

/**
 * Apply ONLY the lock-state fields of an encrypt result onto the *current*
 * note in `data`, preserving every other field (title, pinned, archived,
 * groupId, sortOrder, lastOpenedAt, …).
 *
 * The encrypt path is asynchronous: the renderer derives the ciphertext from a
 * note snapshot captured at keystroke time, then commits the result a few
 * microseconds later. Writing the whole captured note back (the old
 * `replaceNote` path) would clobber any metadata the user changed during that
 * window — e.g. retitling or pinning a locked note while it re-encrypts. By
 * merging onto the live `n` we keep that concurrent edit and only overwrite the
 * body/cipher bookkeeping. No-ops if the note was deleted meanwhile.
 */
export function patchNoteLockState(
  data: AppData,
  id: string,
  fields: {
    cipher: NonNullable<Note['cipher']>;
    bodyFormat?: Note['bodyFormat'];
    attachmentRefs: string[];
    lockedBodySignature?: string;
  },
): AppData {
  return {
    ...data,
    notes: data.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            body: '',
            locked: true,
            cipher: fields.cipher,
            bodyFormat: fields.bodyFormat,
            bodyPlainText: undefined,
            attachmentRefs: fields.attachmentRefs,
            lockedBodySignature: fields.lockedBodySignature,
            updatedAt: nowIso(),
          }
        : n,
    ),
  };
}

export function patchNote(
  data: AppData,
  id: string,
  patch: Partial<
    Pick<
      Note,
      'title' | 'body' | 'bodyFormat' | 'bodyPlainText' | 'pinned' | 'sortOrder' | 'lastOpenedAt' | 'archived' | 'groupId'
    >
  >,
): AppData {
  const isContentChange =
    'title' in patch ||
    'body' in patch ||
    'bodyPlainText' in patch ||
    'bodyFormat' in patch ||
    'pinned' in patch;
  return {
    ...data,
    notes: data.notes.map((n) => {
      if (n.id !== id) return n;
      const next: Note = {
        ...n,
        ...patch,
        archived: patch.archived !== undefined ? (patch.archived ? true : undefined) : n.archived,
      };
      if ('groupId' in patch) {
        const gid = patch.groupId;
        next.groupId =
          typeof gid === 'string' && gid && data.noteGroups.some((g) => g.id === gid)
            ? gid
            : undefined;
      }
      if (isContentChange) next.updatedAt = nowIso();
      return next;
    }),
  };
}

export function removeNote(data: AppData, id: string): AppData {
  const links = data.noteTodoLinks ?? [];
  const nextLinks = links.filter((l) => l.noteId !== id);
  return {
    ...data,
    notes: data.notes.filter((n) => n.id !== id),
    // Prune join rows only — never cascade-delete todos.
    ...(nextLinks.length !== links.length ? { noteTodoLinks: nextLinks } : {}),
  };
}

/**
 * Move a note into `groupId` (or ungrouped when undefined) AND give it a
 * deterministic manual position at the end of the destination tier.
 *
 * Manual `sortOrder` is only meaningful within a tier of (pinned-state ×
 * group). A bare group change that left `sortOrder` untouched would collide
 * with an existing order in the destination group, so the moved note's manual
 * position became non-deterministic. Appending (max + 1) keeps every tier's
 * ordering stable. No-ops if the note is missing or already in that group.
 */
export function moveNoteToGroup(
  data: AppData,
  noteId: string,
  groupId: string | undefined,
): AppData {
  const moving = data.notes.find((n) => n.id === noteId);
  if (!moving) return data;
  const gid = groupId && data.noteGroups.some((g) => g.id === groupId) ? groupId : undefined;
  if ((moving.groupId ?? undefined) === gid) return data;
  let tierMax = -1;
  for (const n of data.notes) {
    if (n.id === noteId) continue;
    if (!!n.pinned !== !!moving.pinned) continue;
    if ((n.groupId ?? undefined) !== gid) continue;
    const o = typeof n.sortOrder === 'number' ? n.sortOrder : -1;
    if (o > tierMax) tierMax = o;
  }
  return {
    ...data,
    notes: data.notes.map((n) =>
      n.id === noteId ? { ...n, groupId: gid, sortOrder: tierMax + 1 } : n,
    ),
  };
}

export function setNotesLock(data: AppData, lock: NotesLock | undefined): AppData {
  if (!lock) {
    const { notesLock: _drop, ...rest } = data;
    return rest as AppData;
  }
  return { ...data, notesLock: lock };
}

export function addNoteGroup(data: AppData, name: string, id?: string): AppData {
  const t = nowIso();
  const minOrder =
    data.noteGroups.length > 0 ? Math.min(...data.noteGroups.map((g) => g.sortOrder)) : 0;
  const g: NoteGroup = {
    id: id ?? uuid(),
    name: name.trim() || 'New list',
    sortOrder: minOrder - 1,
    createdAt: t,
  };
  return { ...data, noteGroups: [...data.noteGroups, g] };
}

export function updateNoteGroup(
  data: AppData,
  groupId: string,
  patch: Partial<Pick<NoteGroup, 'name' | 'sortOrder' | 'pinned' | 'archived'>>,
): AppData {
  return {
    ...data,
    noteGroups: data.noteGroups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            name: patch.name !== undefined ? patch.name.trim() || g.name : g.name,
            sortOrder: patch.sortOrder !== undefined ? patch.sortOrder : g.sortOrder,
            pinned: patch.pinned !== undefined ? (patch.pinned ? true : undefined) : g.pinned,
            archived: patch.archived !== undefined ? (patch.archived ? true : undefined) : g.archived,
          }
        : g,
    ),
  };
}

export function removeNoteGroup(data: AppData, groupId: string): AppData {
  const noteGroups = data.noteGroups.filter((g) => g.id !== groupId);
  const notes = data.notes.map((n) =>
    n.groupId === groupId ? { ...n, groupId: undefined } : n,
  );
  return { ...data, noteGroups, notes };
}

export function patchUtilityDocument(
  data: AppData,
  patch: Partial<Pick<UtilityDocument, 'body' | 'bodyFormat' | 'bodyPlainText'>>,
): AppData {
  const prev: UtilityDocument = data.utilityDocument ?? {
    body: '',
    updatedAt: nowIso(),
  };
  return {
    ...data,
    utilityDocument: {
      ...prev,
      ...patch,
      updatedAt: nowIso(),
    },
  };
}

/** Default editor seed — shared with the multi-tab model. */
const DEFAULT_UTILITY_STRUCTURED_CONTENT = DEFAULT_STRUCTURED_CONTENT;

export function patchUtilityStructuredText(
  data: AppData,
  patch: Partial<
    Pick<UtilityStructuredText, 'content' | 'diffContentLeft' | 'diffContent' | 'language'>
  >,
): AppData {
  const prev: UtilityStructuredText = data.utilityStructuredText ?? {
    content: DEFAULT_UTILITY_STRUCTURED_CONTENT,
    language: 'json',
    updatedAt: nowIso(),
  };
  const language =
    patch.language === 'yaml' ? 'yaml' : patch.language === 'json' ? 'json' : prev.language;
  return {
    ...data,
    utilityStructuredText: {
      ...prev,
      ...patch,
      language,
      updatedAt: nowIso(),
    },
  };
}

// ---------------------------------------------------------------------------
// JSON / YAML multi-tab editor (Postman-style). Each tab owns an isolated
// buffer; these reducers are pure and never mutate a non-target tab.
// ---------------------------------------------------------------------------

/** Pick the next free "Untitled N" label so new tabs don't collide. */
function nextUntitledTitle(tabs: UtilityStructuredTab[]): string {
  let n = tabs.length + 1;
  const taken = new Set(tabs.map((t) => t.title));
  while (taken.has(`Untitled ${n}`)) n += 1;
  return `Untitled ${n}`;
}

function createStructuredTab(id: string, title: string): UtilityStructuredTab {
  return {
    id,
    title,
    content: DEFAULT_UTILITY_STRUCTURED_CONTENT,
    language: 'json',
    mode: 'edit',
    updatedAt: nowIso(),
  };
}

/**
 * Append a new empty tab and make it active. `id` is supplied by the caller
 * so the updater stays pure (React StrictMode may run it twice).
 */
export function addStructuredTab(data: AppData, id: string): AppData {
  const tabs = data.utilityStructuredTabs ?? [];
  const tab = createStructuredTab(id, nextUntitledTitle(tabs));
  return {
    ...data,
    utilityStructuredTabs: [...tabs, tab],
    activeStructuredTabId: tab.id,
  };
}

/**
 * Close a tab. Guarantees at least one tab always remains: closing the last
 * tab replaces it with a fresh empty one instead of leaving the editor blank.
 * When the active tab is closed, focus falls back to the nearest neighbour.
 */
export function closeStructuredTab(data: AppData, id: string): AppData {
  const tabs = data.utilityStructuredTabs ?? [];
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return data;

  const remaining = tabs.filter((t) => t.id !== id);
  if (remaining.length === 0) {
    const fresh = createStructuredTab(uuid(), 'Untitled 1');
    return {
      ...data,
      utilityStructuredTabs: [fresh],
      activeStructuredTabId: fresh.id,
    };
  }

  let activeStructuredTabId = data.activeStructuredTabId;
  if (activeStructuredTabId === id) {
    const neighbour = remaining[Math.min(idx, remaining.length - 1)];
    activeStructuredTabId = neighbour.id;
  }
  return { ...data, utilityStructuredTabs: remaining, activeStructuredTabId };
}

export function renameStructuredTab(data: AppData, id: string, title: string): AppData {
  const tabs = data.utilityStructuredTabs ?? [];
  const trimmed = title.trim();
  if (!trimmed) return data;
  let changed = false;
  const next = tabs.map((t) => {
    if (t.id !== id || t.title === trimmed) return t;
    changed = true;
    return { ...t, title: trimmed, updatedAt: nowIso() };
  });
  if (!changed) return data;
  return { ...data, utilityStructuredTabs: next };
}

export function setActiveStructuredTab(data: AppData, id: string): AppData {
  if (data.activeStructuredTabId === id) return data;
  const tabs = data.utilityStructuredTabs ?? [];
  if (!tabs.some((t) => t.id === id)) return data;
  return { ...data, activeStructuredTabId: id };
}

export function patchStructuredTab(
  data: AppData,
  id: string,
  patch: Partial<
    Pick<UtilityStructuredTab, 'content' | 'diffContentLeft' | 'diffContent' | 'language' | 'mode'>
  >,
): AppData {
  const tabs = data.utilityStructuredTabs ?? [];
  let changed = false;
  const next = tabs.map((t) => {
    if (t.id !== id) return t;
    const language: 'json' | 'yaml' =
      patch.language === 'yaml' ? 'yaml' : patch.language === 'json' ? 'json' : t.language;
    const mode: StructuredTextMode = patch.mode === 'diff' ? 'diff' : patch.mode === 'edit' ? 'edit' : t.mode;
    changed = true;
    return { ...t, ...patch, language, mode, updatedAt: nowIso() };
  });
  if (!changed) return data;
  return { ...data, utilityStructuredTabs: next };
}
