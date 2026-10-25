import { uuid } from '../../lib/uuid';
import { clearReminderNotifyKeys, reminderNotifyEntryId } from '../../lib/reminderNotify';
import type {
  AIConnection,
  AIRouting,
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
  UtilityDocumentTab,
  UtilityErdDocument,
  UtilitySketchDocument,
  UtilityStructuredText,
  UtilityStructuredTab,
  StructuredTextMode,
  NoteTodoLink,
} from '../model';
import type { ErdDocument } from '../../lib/erd/erdModel';
import {
  validateErdDocumentForSave,
  validateSketchSceneForSave,
} from '../../lib/utilityDiagrams';
import {
  DEFAULT_CONNECTION_ID,
  MAX_AI_CONNECTIONS,
  isSyntheticPerson,
  nowIso,
  selfPersonIdForTeam,
  leaderPersonIdForTeam,
  skipLevelPersonIdForTeam,
  DEFAULT_STRUCTURED_CONTENT,
  MAX_NOTE_GROUP_DEPTH,
  effectiveParentId,
  groupDepth,
  groupDescendantIds,
  groupSubtreeHeight,
  isGroupEffectivelyArchived,
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
  patch: Partial<
    Pick<
      Person,
      | 'name'
      | 'title'
      | 'scratchpad'
      | 'scratchpadFormat'
      | 'scratchpadPlainText'
      | 'agenda'
      | 'agendaFormat'
      | 'agendaPlainText'
    >
  >,
): AppData {
  return {
    ...data,
    people: data.people.map((p) => {
      if (p.id !== id) return p;
      const nextScratchpad = 'scratchpad' in patch ? (patch.scratchpad ?? '') : (p.scratchpad ?? '');
      const nextAgenda = 'agenda' in patch ? (patch.agenda ?? '') : (p.agenda ?? '');
      const richPad =
        'scratchpad' in patch || 'scratchpadFormat' in patch || 'scratchpadPlainText' in patch
          ? {
              scratchpad: nextScratchpad,
              scratchpadFormat: nextScratchpad.trim()
                ? 'scratchpadFormat' in patch
                  ? patch.scratchpadFormat
                  : p.scratchpadFormat
                : undefined,
              scratchpadPlainText: nextScratchpad.trim()
                ? 'scratchpadPlainText' in patch
                  ? patch.scratchpadPlainText
                  : p.scratchpadPlainText
                : undefined,
            }
          : {};
      const richAgenda =
        'agenda' in patch || 'agendaFormat' in patch || 'agendaPlainText' in patch
          ? {
              agenda: nextAgenda,
              agendaFormat: nextAgenda.trim()
                ? 'agendaFormat' in patch
                  ? patch.agendaFormat
                  : p.agendaFormat
                : undefined,
              agendaPlainText: nextAgenda.trim()
                ? 'agendaPlainText' in patch
                  ? patch.agendaPlainText
                  : p.agendaPlainText
                : undefined,
            }
          : {};
      if (isSyntheticPerson(p)) {
        return {
          ...p,
          name: patch.name?.trim() ? patch.name.trim() : p.name,
          title: patch.title !== undefined ? patch.title.trim() || undefined : p.title,
          ...richPad,
          ...richAgenda,
        };
      }
      return {
        ...p,
        name: patch.name !== undefined ? patch.name.trim() || p.name : p.name,
        title: patch.title !== undefined ? patch.title.trim() || undefined : p.title,
        ...richPad,
        ...richAgenda,
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
      | 'bodyFormat'
      | 'bodyPlainText'
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
  const body = fields.body?.trim() || '';
  const bodyFormat =
    body && (fields.bodyFormat === 'markdown' || fields.bodyFormat === 'prosemirror')
      ? fields.bodyFormat
      : undefined;
  const bodyPlainText =
    body && typeof fields.bodyPlainText === 'string' && fields.bodyPlainText.trim()
      ? fields.bodyPlainText.trim()
      : undefined;
  const item: Item = {
    id: uuid(),
    personId,
    kind,
    title: fields.title?.trim() || defaultTitle(kind),
    body,
    ...(bodyFormat ? { bodyFormat } : {}),
    ...(bodyPlainText ? { bodyPlainText } : {}),
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
      | 'bodyFormat'
      | 'bodyPlainText'
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
    const body = 'body' in patch ? (patch.body ?? '') : it.body;
    const bodyFormat = 'bodyFormat' in patch ? patch.bodyFormat : it.bodyFormat;
    const bodyPlainText = 'bodyPlainText' in patch ? patch.bodyPlainText : it.bodyPlainText;
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
      bodyFormat: body.trim() ? bodyFormat : undefined,
      bodyPlainText: body.trim() ? bodyPlainText : undefined,
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

/**
 * `undefined` leaves a field unchanged; an empty string clears it. For
 * `provider` that means `''` ("Disabled" / Remove) rather than `undefined`.
 */
export type AISettingsPatch = Partial<
  Omit<AISettings, 'provider' | 'gatewayFormat' | 'authScheme' | 'maxTokensField' | 'defaultMeta'>
> & {
  /** Merged into the stored value; a key set to `undefined` (or an empty list) is removed. */
  defaultMeta?: { [K in keyof NonNullable<AISettings['defaultMeta']>]?: NonNullable<AISettings['defaultMeta']>[K] | undefined };
  provider?: AISettings['provider'] | '';
  gatewayFormat?: AISettings['gatewayFormat'] | '';
  authScheme?: AISettings['authScheme'] | '';
  maxTokensField?: AISettings['maxTokensField'] | '';
};

/** The routing map without any entry that points at `id`. `{}` when nothing is left. */
export function routingWithout(routing: AIRouting | undefined, id: string): AIRouting {
  const out: AIRouting = {};
  if (routing?.content && routing.content !== id) out.content = routing.content;
  if (routing?.people && routing.people !== id) out.people = routing.people;
  const tasks = Object.fromEntries(Object.entries(routing?.tasks ?? {}).filter(([, v]) => v !== id));
  if (Object.keys(tasks).length) out.tasks = tasks;
  return out;
}

/**
 * Connection edits are scoped to one id and applied to the LATEST data. A caller that
 * captured the list earlier (a probe that finishes seconds after it started) can therefore
 * never put a removed connection back or undo another connection's change.
 */
export function upsertAIConnection(data: AppData, connection: AIConnection): AppData {
  // What the loader would drop on the next start is refused here, so a save is never silently lossy.
  if (!connection.id.trim() || connection.id === DEFAULT_CONNECTION_ID || !connection.name.trim()) return data;
  const list = data.aiSettings?.connections ?? [];
  const exists = list.some((c) => c.id === connection.id);
  if (!exists && list.length >= MAX_AI_CONNECTIONS) return data;
  return updateAISettings(data, {
    connections: exists ? list.map((c) => (c.id === connection.id ? connection : c)) : [...list, connection],
  });
}

export function patchAIConnection(
  data: AppData,
  id: string,
  patch: { [K in keyof Omit<AIConnection, 'id'>]?: AIConnection[K] | undefined },
): AppData {
  const list = data.aiSettings?.connections;
  if (!list?.some((c) => c.id === id)) return data;
  return updateAISettings(data, {
    connections: list.map((c) => {
      if (c.id !== id) return c;
      const merged: Record<string, unknown> = { ...c, ...patch };
      if (typeof merged.name !== 'string' || !merged.name.trim()) merged.name = c.name;
      for (const [key, value] of Object.entries(merged)) {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) delete merged[key];
      }
      return merged as unknown as AIConnection;
    }),
  });
}

/** Points `content` or `people` data at a connection (or back at the default), on the latest routing. */
export function setAIRoute(data: AppData, key: 'content' | 'people', id: string): AppData {
  const next: AIRouting = { ...(data.aiSettings?.routing ?? {}) };
  if (id === DEFAULT_CONNECTION_ID) delete next[key];
  else next[key] = id;
  return updateAISettings(data, { routing: next });
}

export function removeAIConnection(data: AppData, id: string): AppData {
  const s = data.aiSettings;
  if (!s?.connections?.some((c) => c.id === id)) return data;
  const out = updateAISettings(data, {
    connections: s.connections.filter((c) => c.id !== id),
    routing: routingWithout(s.routing, id),
  });
  // An entry kept aside under the same id would be read as a connection again on the next load.
  const unread = out.aiSettings?.unreadConnections;
  if (out.aiSettings && unread?.some((c) => String(c.id ?? '').trim() === id)) {
    const rest = unread.filter((c) => String(c.id ?? '').trim() !== id);
    return { ...out, aiSettings: { ...out.aiSettings, unreadConnections: rest.length ? rest : undefined } };
  }
  return out;
}

function mergeDefaultMeta(
  current: AISettings['defaultMeta'],
  patch: NonNullable<AISettingsPatch['defaultMeta']>,
): AISettings['defaultMeta'] {
  const merged = { ...current, ...patch };
  const next: NonNullable<AISettings['defaultMeta']> = {};
  if (merged.name?.trim()) next.name = merged.name.trim();
  if (merged.capabilities?.length) next.capabilities = merged.capabilities;
  if (merged.probedAt?.trim()) next.probedAt = merged.probedAt.trim();
  if (typeof merged.allowPeopleData === 'boolean') next.allowPeopleData = merged.allowPeopleData;
  if (merged.jsonOverride === true) next.jsonOverride = true;
  return Object.keys(next).length ? next : undefined;
}

export function updateAISettings(
  data: AppData,
  patch: AISettingsPatch,
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
    baseUrl:
      patch.baseUrl !== undefined
        ? patch.baseUrl.trim()
          ? patch.baseUrl.trim()
          : undefined
        : current.baseUrl,
    gatewayFormat:
      patch.gatewayFormat !== undefined ? patch.gatewayFormat || undefined : current.gatewayFormat,
    authHeader:
      patch.authHeader !== undefined
        ? patch.authHeader.trim()
          ? patch.authHeader.trim()
          : undefined
        : current.authHeader,
    authScheme: patch.authScheme !== undefined ? patch.authScheme || undefined : current.authScheme,
    maxTokensField:
      patch.maxTokensField !== undefined ? patch.maxTokensField || undefined : current.maxTokensField,
    connections:
      patch.connections !== undefined
        ? patch.connections.length
          ? // The same limit the loader applies, so what is saved is what is loaded again.
            patch.connections.slice(0, MAX_AI_CONNECTIONS)
          : undefined
        : current.connections,
    routing:
      patch.routing !== undefined
        ? Object.keys(patch.routing).length
          ? patch.routing
          : undefined
        : current.routing,
    defaultMeta: patch.defaultMeta !== undefined ? mergeDefaultMeta(current.defaultMeta, patch.defaultMeta) : current.defaultMeta,
    embeddingModel:
      patch.embeddingModel !== undefined
        ? patch.embeddingModel.trim()
          ? patch.embeddingModel.trim()
          : undefined
        : current.embeddingModel,
    requestPath:
      patch.requestPath !== undefined
        ? patch.requestPath.trim()
          ? patch.requestPath.trim()
          : undefined
        : current.requestPath,
    extraHeaders:
      patch.extraHeaders !== undefined
        ? patch.extraHeaders.length
          ? patch.extraHeaders
          : undefined
        : current.extraHeaders,
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
  // An older version drops `aiSettings` when none of ITS known fields is set, and with it every
  // extra connection, the routing and the default's metadata. While any of those exist and no
  // older field is set, keep the (default) API format as a marker so they survive a downgrade.
  const hasNewKeys = Boolean(next.connections?.length || next.unreadConnections?.length || next.routing || next.defaultMeta);
  const hasOlderField = Boolean(
    next.provider || next.apiKey || next.model || next.baseUrl || next.gatewayFormat || next.authHeader ||
      next.authScheme || next.requestPath || next.maxTokensField || next.extraHeaders?.length ||
      next.systemPrompt || next.extractionGuidance,
  );
  if (hasNewKeys && !hasOlderField) next.gatewayFormat = 'openai-chat';
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

export function addNoteGroup(
  data: AppData,
  name: string,
  id?: string,
  parentId?: string,
): AppData {
  const parent = parentId ? data.noteGroups.find((g) => g.id === parentId) : undefined;
  // Too deep to nest further: refuse rather than silently flatten the list.
  if (parent && groupDepth(data.noteGroups, parent.id) + 1 > MAX_NOTE_GROUP_DEPTH) return data;
  const t = nowIso();
  const minOrder =
    data.noteGroups.length > 0 ? Math.min(...data.noteGroups.map((g) => g.sortOrder)) : 0;
  const g: NoteGroup = {
    id: id ?? uuid(),
    name: name.trim() || 'New list',
    sortOrder: minOrder - 1,
    ...(parent ? { parentId: parent.id } : {}),
    createdAt: t,
  };
  return { ...data, noteGroups: [...data.noteGroups, g] };
}

/**
 * Re-parent a list (`newParentId` undefined = move to the root). Returns `data`
 * unchanged when the move is a no-op or would break the tree: unknown ids, into
 * itself or its own sub-lists, or deeper than {@link MAX_NOTE_GROUP_DEPTH}.
 * Notes and every other list field are left alone.
 */
export function moveNoteGroup(
  data: AppData,
  groupId: string,
  newParentId: string | undefined,
): AppData {
  const target = data.noteGroups.find((g) => g.id === groupId);
  if (!target) return data;
  if ((target.parentId ?? undefined) === newParentId) return data;
  if (newParentId !== undefined) {
    if (!data.noteGroups.some((g) => g.id === newParentId)) return data;
    if (newParentId === groupId) return data;
    if (groupDescendantIds(data.noteGroups, groupId).includes(newParentId)) return data;
    const depth =
      groupDepth(data.noteGroups, newParentId) + groupSubtreeHeight(data.noteGroups, groupId);
    if (depth > MAX_NOTE_GROUP_DEPTH) return data;
  }
  return {
    ...data,
    noteGroups: data.noteGroups.map((g) => {
      if (g.id !== groupId) return g;
      const { parentId: _old, ...rest } = g;
      return newParentId === undefined ? rest : { ...rest, parentId: newParentId };
    }),
  };
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

/**
 * Delete a list without deleting anything inside it: its sub-lists and notes
 * move up to the deleted list's parent (root / ungrouped when it had none).
 *
 * A note is archived by its list, so deleting an archived list would silently
 * bring everything in it back to the active view. When the list itself carried
 * the archive, what moves out is archived explicitly instead.
 */
export function removeNoteGroup(data: AppData, groupId: string): AppData {
  const parent = effectiveParentId(data.noteGroups, groupId);
  const carriedArchive =
    data.noteGroups.find((g) => g.id === groupId)?.archived === true &&
    !(parent !== undefined && isGroupEffectivelyArchived(data.noteGroups, parent));
  const noteGroups = data.noteGroups
    .filter((g) => g.id !== groupId)
    .map((g) => {
      if (g.parentId !== groupId) return g;
      const { parentId: _old, ...rest } = g;
      const moved = parent === undefined ? rest : { ...rest, parentId: parent };
      return carriedArchive ? { ...moved, archived: true } : moved;
    });
  const notes = data.notes.map((n) => {
    if (n.groupId !== groupId) return n;
    const moved = { ...n, groupId: parent };
    return carriedArchive ? { ...moved, archived: true } : moved;
  });
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
function nextUntitledTitle(tabs: readonly { title: string }[]): string {
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

// ---------------------------------------------------------------------------
// Utilities → Document multi-document tabs. Same rules as the JSON / YAML tabs;
// reducers are pure and never touch a non-target tab.
// ---------------------------------------------------------------------------

function createDocumentTab(id: string, title: string): UtilityDocumentTab {
  return { id, title, body: '', updatedAt: nowIso() };
}

/** Append an empty tab and make it active. `id` comes from the caller to keep the updater pure. */
export function addDocumentTab(data: AppData, id: string): AppData {
  const tabs = data.utilityDocumentTabs ?? [];
  const tab = createDocumentTab(id, nextUntitledTitle(tabs));
  return { ...data, utilityDocumentTabs: [...tabs, tab], activeDocumentTabId: tab.id };
}

/**
 * Append a Document tab that already holds content (for example an AI-structured copy of another
 * tab) and make it active. Existing tabs are untouched; an id that is already used changes nothing.
 */
export function addDocumentTabWithContent(
  data: AppData,
  id: string,
  input: { title: string; body: string; bodyFormat?: 'markdown' | 'prosemirror'; bodyPlainText?: string },
): AppData {
  const tabs = data.utilityDocumentTabs ?? [];
  if (tabs.some((t) => t.id === id)) return data;
  const title = input.title.trim().slice(0, 60) || nextUntitledTitle(tabs);
  const tab: UtilityDocumentTab = {
    id,
    title,
    body: input.body,
    ...(input.bodyFormat ? { bodyFormat: input.bodyFormat } : {}),
    ...(input.bodyPlainText ? { bodyPlainText: input.bodyPlainText } : {}),
    updatedAt: nowIso(),
  };
  return { ...data, utilityDocumentTabs: [...tabs, tab], activeDocumentTabId: tab.id };
}

/** Same for a JSON / YAML tab. */
export function addStructuredTabWithContent(
  data: AppData,
  id: string,
  input: { title: string; content: string; language: 'json' | 'yaml' },
): AppData {
  const tabs = data.utilityStructuredTabs ?? [];
  if (tabs.some((t) => t.id === id)) return data;
  const tab: UtilityStructuredTab = {
    ...createStructuredTab(id, input.title.trim().slice(0, 60) || nextUntitledTitle(tabs)),
    content: input.content,
    language: input.language,
  };
  return { ...data, utilityStructuredTabs: [...tabs, tab], activeStructuredTabId: tab.id };
}

/**
 * A new note that already has its title and body, at the top of the list (in `groupId` when that
 * list exists). Never replaces a note: an id that is already used changes nothing.
 */
export function createNoteWithContent(
  data: AppData,
  id: string,
  input: { title: string; body: string; bodyFormat?: 'markdown' | 'prosemirror'; bodyPlainText?: string; groupId?: string },
): AppData {
  if (data.notes.some((n) => n.id === id)) return data;
  const created = addNote(data, id, input.groupId);
  return {
    ...created,
    notes: created.notes.map((n) =>
      n.id === id
        ? {
            ...n,
            title: input.title.trim().slice(0, 120),
            body: input.body,
            ...(input.bodyFormat ? { bodyFormat: input.bodyFormat } : {}),
            ...(input.bodyPlainText ? { bodyPlainText: input.bodyPlainText } : {}),
          }
        : n,
    ),
  };
}

/** Close a tab. Closing the last one leaves a fresh empty tab so the page is never blank. */
export function closeDocumentTab(data: AppData, id: string): AppData {
  const tabs = data.utilityDocumentTabs ?? [];
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return data;
  const remaining = tabs.filter((t) => t.id !== id);
  if (remaining.length === 0) {
    const fresh = createDocumentTab(uuid(), 'Untitled 1');
    return { ...data, utilityDocumentTabs: [fresh], activeDocumentTabId: fresh.id };
  }
  const activeDocumentTabId =
    data.activeDocumentTabId === id
      ? remaining[Math.min(idx, remaining.length - 1)]!.id
      : data.activeDocumentTabId;
  return { ...data, utilityDocumentTabs: remaining, activeDocumentTabId };
}

export function renameDocumentTab(data: AppData, id: string, title: string): AppData {
  const tabs = data.utilityDocumentTabs ?? [];
  const trimmed = title.trim();
  if (!trimmed) return data;
  let changed = false;
  const next = tabs.map((t) => {
    if (t.id !== id || t.title === trimmed) return t;
    changed = true;
    return { ...t, title: trimmed, updatedAt: nowIso() };
  });
  return changed ? { ...data, utilityDocumentTabs: next } : data;
}

export function setActiveDocumentTab(data: AppData, id: string): AppData {
  if (data.activeDocumentTabId === id) return data;
  if (!(data.utilityDocumentTabs ?? []).some((t) => t.id === id)) return data;
  return { ...data, activeDocumentTabId: id };
}

export function patchDocumentTab(
  data: AppData,
  id: string,
  patch: Partial<Pick<UtilityDocumentTab, 'body' | 'bodyFormat' | 'bodyPlainText'>>,
): AppData {
  const tabs = data.utilityDocumentTabs ?? [];
  let changed = false;
  const next = tabs.map((t) => {
    if (t.id !== id) return t;
    changed = true;
    return { ...t, ...patch, updatedAt: nowIso() };
  });
  return changed ? { ...data, utilityDocumentTabs: next } : data;
}

// ---------------------------------------------------------------------------
// Move a Tools tab into Notes. One pure update: the note is created and the tab
// removed together, so a save can never persist one without the other.
// ---------------------------------------------------------------------------

export type MoveToNoteFields = {
  title: string;
  body: string;
  bodyFormat?: 'markdown' | 'prosemirror';
  bodyPlainText?: string;
};

type MoveToNoteArgs = { tabId: string; noteId: string; groupId?: string };

function withNoteFromFields(data: AppData, noteId: string, groupId: string | undefined, f: MoveToNoteFields): AppData {
  const created = addNote(data, noteId, groupId);
  const t = nowIso();
  return {
    ...created,
    notes: created.notes.map((n) =>
      n.id === noteId
        ? { ...n, title: f.title, body: f.body, bodyFormat: f.bodyFormat, bodyPlainText: f.bodyPlainText, updatedAt: t }
        : n,
    ),
  };
}

/** Pick the neighbour that becomes active after `id` leaves `tabs`. */
function neighbourAfterRemoval(tabs: readonly { id: string }[], id: string): string | undefined {
  const idx = tabs.findIndex((t) => t.id === id);
  const remaining = tabs.filter((t) => t.id !== id);
  return remaining.length === 0 ? undefined : remaining[Math.min(idx, remaining.length - 1)]!.id;
}

export function moveDocumentTabToNote(data: AppData, args: MoveToNoteArgs): AppData {
  const tabs = data.utilityDocumentTabs ?? [];
  const tab = tabs.find((t) => t.id === args.tabId);
  if (!tab || data.notes.some((n) => n.id === args.noteId)) return data;
  const withNote = withNoteFromFields(data, args.noteId, args.groupId, {
    title: tab.title,
    body: tab.body,
    bodyFormat: tab.bodyFormat,
    bodyPlainText: tab.bodyPlainText,
  });
  const activeDocumentTabId =
    data.activeDocumentTabId === tab.id ? neighbourAfterRemoval(tabs, tab.id) : data.activeDocumentTabId;
  return {
    ...withNote,
    utilityDocumentTabs: tabs.filter((t) => t.id !== tab.id),
    activeDocumentTabId,
  };
}

export function moveStructuredTabToNote(
  data: AppData,
  args: MoveToNoteArgs & { fields: MoveToNoteFields },
): AppData {
  const tabs = data.utilityStructuredTabs ?? [];
  const tab = tabs.find((t) => t.id === args.tabId);
  if (!tab || data.notes.some((n) => n.id === args.noteId)) return data;
  const withNote = withNoteFromFields(data, args.noteId, args.groupId, args.fields);
  const activeStructuredTabId =
    data.activeStructuredTabId === tab.id ? neighbourAfterRemoval(tabs, tab.id) : data.activeStructuredTabId;
  return {
    ...withNote,
    utilityStructuredTabs: tabs.filter((t) => t.id !== tab.id),
    activeStructuredTabId,
  };
}

// ---------------------------------------------------------------------------
// Utilities → Tools → ERD / Sketch named libraries (explicit Save only).
// ---------------------------------------------------------------------------

export type UpsertUtilityErdResult =
  | { ok: true; data: AppData; id: string }
  | { ok: false; error: string };

export type UpsertUtilitySketchResult =
  | { ok: true; data: AppData; id: string }
  | { ok: false; error: string };

/**
 * Insert or update a saved ERD. `id` is always caller-supplied so React Strict
 * Mode double-invokes of the AppData updater stay idempotent.
 */
export function upsertUtilityErdDocument(
  data: AppData,
  input: {
    id: string;
    title: string;
    document: ErdDocument;
  },
): UpsertUtilityErdResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Title is required.' };
  if (!input.id.trim()) return { ok: false, error: 'Missing document id.' };
  const valid = validateErdDocumentForSave(input.document);
  if (!valid.ok) return valid;

  const list = data.utilityErdDocuments ?? [];
  const t = nowIso();
  const idx = list.findIndex((d) => d.id === input.id);
  if (idx >= 0) {
    const prev = list[idx]!;
    const next: UtilityErdDocument = {
      ...prev,
      title,
      document: input.document,
      updatedAt: t,
    };
    const utilityErdDocuments = list.map((d, i) => (i === idx ? next : d));
    return { ok: true, data: { ...data, utilityErdDocuments }, id: next.id };
  }

  const created: UtilityErdDocument = {
    id: input.id,
    title,
    document: input.document,
    createdAt: t,
    updatedAt: t,
  };
  return {
    ok: true,
    data: { ...data, utilityErdDocuments: [created, ...list] },
    id: created.id,
  };
}

export function renameUtilityErdDocument(data: AppData, id: string, title: string): AppData {
  const nextTitle = title.trim();
  if (!nextTitle) return data;
  const list = data.utilityErdDocuments ?? [];
  let changed = false;
  const utilityErdDocuments = list.map((d) => {
    if (d.id !== id) return d;
    changed = true;
    return { ...d, title: nextTitle, updatedAt: nowIso() };
  });
  return changed ? { ...data, utilityErdDocuments } : data;
}

export function removeUtilityErdDocument(data: AppData, id: string): AppData {
  const list = data.utilityErdDocuments ?? [];
  const utilityErdDocuments = list.filter((d) => d.id !== id);
  if (utilityErdDocuments.length === list.length) return data;
  return { ...data, utilityErdDocuments };
}

/** Insert or update a saved Sketch. `id` is always caller-supplied (idempotent). */
export function upsertUtilitySketchDocument(
  data: AppData,
  input: {
    id: string;
    title: string;
    sceneJson: string;
  },
): UpsertUtilitySketchResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Title is required.' };
  if (!input.id.trim()) return { ok: false, error: 'Missing document id.' };
  const valid = validateSketchSceneForSave(input.sceneJson);
  if (!valid.ok) return valid;

  const list = data.utilitySketchDocuments ?? [];
  const t = nowIso();
  const idx = list.findIndex((d) => d.id === input.id);
  if (idx >= 0) {
    const prev = list[idx]!;
    const next: UtilitySketchDocument = {
      ...prev,
      title,
      sceneJson: input.sceneJson,
      updatedAt: t,
    };
    const utilitySketchDocuments = list.map((d, i) => (i === idx ? next : d));
    return { ok: true, data: { ...data, utilitySketchDocuments }, id: next.id };
  }

  const created: UtilitySketchDocument = {
    id: input.id,
    title,
    sceneJson: input.sceneJson,
    createdAt: t,
    updatedAt: t,
  };
  return {
    ok: true,
    data: { ...data, utilitySketchDocuments: [created, ...list] },
    id: created.id,
  };
}

export function renameUtilitySketchDocument(data: AppData, id: string, title: string): AppData {
  const nextTitle = title.trim();
  if (!nextTitle) return data;
  const list = data.utilitySketchDocuments ?? [];
  let changed = false;
  const utilitySketchDocuments = list.map((d) => {
    if (d.id !== id) return d;
    changed = true;
    return { ...d, title: nextTitle, updatedAt: nowIso() };
  });
  return changed ? { ...data, utilitySketchDocuments } : data;
}

export function removeUtilitySketchDocument(data: AppData, id: string): AppData {
  const list = data.utilitySketchDocuments ?? [];
  const utilitySketchDocuments = list.filter((d) => d.id !== id);
  if (utilitySketchDocuments.length === list.length) return data;
  return { ...data, utilitySketchDocuments };
}
