import { uuid } from './lib/uuid';

/** Legacy single-team self identifier (used during migration). */
export const LEGACY_SELF_PERSON_ID = '__self';

export type ItemKind = 'task' | 'note' | 'goal' | 'document' | 'feedback';

export type GoalStatus = 'planned' | 'active' | 'completed' | 'cancelled';

export const GOAL_STATUS_OPTIONS: { value: GoalStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export type FeedbackKind = 'praise' | 'coaching' | 'concern';

export const FEEDBACK_KIND_OPTIONS: { value: FeedbackKind; label: string; tone: string }[] = [
  { value: 'praise', label: 'Praise', tone: 'ok' },
  { value: 'coaching', label: 'Coaching', tone: 'info' },
  { value: 'concern', label: 'Concern', tone: 'danger' },
];

export type TeamStatus = 'active' | 'paused' | 'archived';

export interface Team {
  id: string;
  name: string;
  createdAt: string;
  /** Team status (UI + filtering). */
  status?: TeamStatus;
}

export interface UserProfile {
  displayName: string;
  /** Ordered list of favourite team ids (first → highest priority). */
  favoriteTeamIds: string[];
  jobTitle?: string;
  department?: string;
  phone?: string;
  /** Short bio / about. */
  bio?: string;
  /** Optional avatar as a data: URL (PNG/JPEG/WebP). Stored alongside profile data. */
  avatarDataUrl?: string;
}

export interface Person {
  id: string;
  teamId: string;
  name: string;
  title?: string;
  isSelf?: boolean;
  /** Free-form notes / 1:1 scratchpad (per person). */
  scratchpad?: string;
  /** Persistent 1:1 meeting agenda (markdown). Cleared and carry-over on archive. */
  agenda?: string;
  createdAt: string;
}

export interface Item {
  id: string;
  personId: string;
  kind: ItemKind;
  title: string;
  body: string;
  /** Optional free-form category (e.g. Initiative, Operations). */
  category?: string;
  /** Goal / task deadline. */
  dueAt?: string;
  /** Goal start date. */
  startAt?: string;
  /** Goal workflow status; relevant only when kind === 'goal'. */
  goalStatus?: GoalStatus;
  /** Feedback tone; relevant only when kind === 'feedback'. */
  feedbackKind?: FeedbackKind;
  remindAt?: string;
  /** Optional reminder recurrence ('daily' | 'weekly' | 'monthly'); fires repeatedly when set. */
  remindRepeat?: ReminderRepeat;
  done: boolean;
  doneAt?: string;
  url?: string;
  createdAt: string;
  updatedAt: string;
}

export type ReminderRepeat = 'daily' | 'weekly' | 'monthly';

export const REMIND_REPEAT_OPTIONS: { value: '' | ReminderRepeat; label: string }[] = [
  { value: '', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export const PRIORITY_OPTIONS: { value: Priority; label: string; rank: number; tone: string }[] = [
  { value: 'urgent', label: 'Urgent', rank: 0, tone: 'danger' },
  { value: 'high', label: 'High', rank: 1, tone: 'warn' },
  { value: 'normal', label: 'Normal', rank: 2, tone: 'info' },
  { value: 'low', label: 'Low', rank: 3, tone: 'muted' },
];

export function priorityRank(p: Priority | undefined): number {
  if (!p) return 2;
  return PRIORITY_OPTIONS.find((o) => o.value === p)?.rank ?? 2;
}

export interface TodoGroup {
  id: string;
  name: string;
  sortOrder: number;
  /** Pinned groups are sorted above the rest, in their pinned order. */
  pinned?: boolean;
  /** Archived groups are hidden from the main view by default. */
  archived?: boolean;
  /** Optional priority for the entire list (used for cross-list ordering). */
  priority?: Priority;
  createdAt: string;
}

/**
 * Lifecycle status of a to-do item.
 *
 * The earlier model only had a `done: boolean` flag. That worked for a
 * one-off checklist but stopped scaling once people started using the
 * to-dos page as a lightweight project tracker — "I started this but
 * haven't finished" and "I decided not to do this" need their own
 * states or they pollute the open / completed buckets.
 *
 * The set is intentionally Kanban-shaped and small:
 *   - `todo`         — not started yet (default for fresh rows)
 *   - `in_progress`  — actively working on it
 *   - `done`         — finished; equivalent to the legacy `done: true`
 *   - `cancelled`    — explicitly dropped; not counted as overdue and
 *                      excluded from completion-rate denominators
 *
 * `done: boolean` is kept on disk for back-compat (older builds reading
 * a newer file still know what's complete). It is always derived from
 * `status` on every write — never set independently.
 */
export type TodoStatus = 'todo' | 'in_progress' | 'done' | 'cancelled';

export const TODO_STATUS_OPTIONS: {
  value: TodoStatus;
  label: string;
  /** Short label used inside compact badges. */
  shortLabel: string;
  /** Lower = earlier in Kanban-style sort. */
  rank: number;
  /** Reused by `.badge--<tone>` styling in `app.css`. */
  tone: 'info' | 'warn' | 'ok' | 'muted';
}[] = [
  { value: 'todo',        label: 'To do',       shortLabel: 'To do',  rank: 0, tone: 'info' },
  { value: 'in_progress', label: 'In progress', shortLabel: 'WIP',    rank: 1, tone: 'warn' },
  { value: 'done',        label: 'Done',        shortLabel: 'Done',   rank: 2, tone: 'ok' },
  { value: 'cancelled',   label: 'Cancelled',   shortLabel: 'Cancel', rank: 3, tone: 'muted' },
];

export function todoStatusRank(s: TodoStatus | undefined): number {
  return TODO_STATUS_OPTIONS.find((o) => o.value === s)?.rank ?? 0;
}

/** True iff the item is still open (counts towards "open tasks" stats). */
export function isTodoOpen(status: TodoStatus | undefined): boolean {
  return status === 'todo' || status === 'in_progress';
}

export interface TodoItem {
  id: string;
  groupId: string;
  title: string;
  /**
   * Lifecycle status. Always present after a `parseTodoItems` round-trip;
   * older files written before this field existed are migrated from
   * `done` on load (`done: true` → `'done'`, otherwise `'todo'`).
   */
  status: TodoStatus;
  /**
   * Legacy completion flag. Kept in lockstep with `status === 'done'`
   * so older readers and exported backups still report the right
   * checkbox state. New code should branch on `status`, not `done`.
   */
  done: boolean;
  /** Timestamp the item transitioned into `done` (used by analytics). */
  doneAt?: string;
  dueAt?: string;
  /** Per-item priority (urgent / high / normal / low). */
  priority?: Priority;
  /** Order index within the group. Lower comes first. */
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export const DATA_VERSION = 3 as const;

export type AIProvider = 'anthropic' | 'openai' | 'gemini';

export const AI_PROVIDER_OPTIONS: {
  value: AIProvider;
  label: string;
  defaultModel: string;
  /**
   * Short list of currently-valid model names we surface in the UI so users
   * don't have to dig through provider release notes. Keep the most useful
   * default first — that's the one we suggest in the placeholder.
   */
  modelExamples: string[];
}[] = [
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-3-5-sonnet-latest',
    modelExamples: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
  },
  {
    value: 'openai',
    label: 'OpenAI ChatGPT',
    defaultModel: 'gpt-4o-mini',
    modelExamples: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  },
  {
    value: 'gemini',
    label: 'Google Gemini',
    // gemini-1.5-* was retired from v1beta in late 2025; default to the
    // current GA flash model. Users who saved the old name will see a
    // 404 — the error message now nudges them to update.
    defaultModel: 'gemini-2.0-flash',
    modelExamples: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  },
];

export interface AISettings {
  provider?: AIProvider;
  /** API key supplied by the user. Stored alongside other AppData (encrypted on disk in Electron). */
  apiKey?: string;
  /** Model identifier; falls back to the provider default when empty. */
  model?: string;
  /** Optional override for system prompt. */
  systemPrompt?: string;
  /** Optional, remembered free-text hint for the "Extract tasks from notes" feature. */
  extractionGuidance?: string;
}

/**
 * A free-form personal note (macOS Notes-style). Body is Markdown.
 *
 * Locked notes encrypt their body with the workspace master key (see
 * `NotesLock`). The salt lives ONCE in `NotesLock.saltB64`; each ciphertext
 * blob carries only the IV + AES-GCM ciphertext+tag so re-encryption on
 * every keystroke is sub-millisecond.
 */
export interface Note {
  id: string;
  title: string;
  /** Plaintext Markdown body. Empty when the note is locked. */
  body: string;
  /** True if the note is currently encrypted at rest. */
  locked: boolean;
  /** When `locked === true`, the AES-GCM ciphertext + IV (no salt). */
  cipher?: { ivB64: string; cipherB64: string };
  /** Pinned notes float to the top of the list. */
  pinned?: boolean;
  /** Optional manual sort order; lower number first within the same pinned tier. */
  sortOrder?: number;
  /** ISO timestamp of the last time the user opened this note for viewing.
   *  Optional so historical data continues to load without migration; the
   *  Notes page treats a missing value as "never opened" and falls back to
   *  `updatedAt` when sorting by Opened. */
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Workspace-level Notes lock. Present iff the user has set a Notes
 * passphrase. Contains the PBKDF2 salt for the master key plus a verifier
 * blob ("decrypt this constant under the derived key — if it succeeds the
 * passphrase was right").
 *
 * Optionally also carries a `recovery` envelope: the Notes passphrase
 * itself, encrypted with a key derived from the user's account password.
 * Lets a user who forgot their Notes passphrase recover by entering their
 * account password instead — without ever weakening the at-rest
 * encryption (an attacker still has to guess the strongest of the two
 * passwords).
 */
export interface NotesLock {
  saltB64: string;
  verifierIvB64: string;
  verifierCipherB64: string;
  /** Optional: passphrase wrapped with account-password-derived key. */
  recovery?: {
    /** PBKDF2 salt for deriving the recovery wrap key from the account password. */
    saltB64: string;
    /** AES-GCM IV used to encrypt the Notes passphrase. */
    ivB64: string;
    /** AES-GCM ciphertext (+ tag) of the Notes passphrase. */
    cipherB64: string;
  };
}

export interface AppData {
  version: typeof DATA_VERSION;
  teams: Team[];
  people: Person[];
  items: Item[];
  notifiedReminderIds: string[];
  /** Last selected team (UI preference). */
  lastTeamId?: string;
  /** Local user profile. */
  profile?: UserProfile;
  /** Personal to-do lists (team independent). */
  todoGroups: TodoGroup[];
  todoItems: TodoItem[];
  /** Optional AI assistant settings (BYO API key). */
  aiSettings?: AISettings;
  /** Standalone Markdown notes (macOS-Notes-style). Always present (empty array when unused). */
  notes: Note[];
  /** Workspace-level lock for notes (verifier blob). Absent until the user enables note locking. */
  notesLock?: NotesLock;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function selfPersonIdForTeam(teamId: string): string {
  return `__self__${teamId}`;
}

export function leaderPersonIdForTeam(teamId: string): string {
  return `__leader__${teamId}`;
}

export function isSelfPerson(p: Pick<Person, 'isSelf' | 'id'>): boolean {
  if (p.isSelf) return true;
  return p.id.startsWith('__self__');
}

export function isLeaderPerson(p: Pick<Person, 'id'>): boolean {
  return p.id.startsWith('__leader__');
}

export function getSelfPerson(data: Pick<AppData, 'people'>, teamId: string): Person | undefined {
  return data.people.find((p) => p.teamId === teamId && isSelfPerson(p));
}

export function getLeaderPerson(data: Pick<AppData, 'people'>, teamId: string): Person | undefined {
  return data.people.find((p) => p.teamId === teamId && isLeaderPerson(p));
}

/** Team members excluding the special "Me" and "My leader" rows. */
export function teamPeople(data: Pick<AppData, 'people'>, teamId: string): Person[] {
  return data.people.filter((p) => p.teamId === teamId && !isSelfPerson(p) && !isLeaderPerson(p));
}

export function emptyData(): AppData {
  const t = nowIso();
  const teamId = uuid();
  const selfId = selfPersonIdForTeam(teamId);
  const leaderId = leaderPersonIdForTeam(teamId);
  return {
    version: DATA_VERSION,
    teams: [{ id: teamId, name: 'My first team', createdAt: t, status: 'active' }],
    people: [
      {
        id: selfId,
        teamId,
        name: 'Me',
        isSelf: true,
        scratchpad: '',
        createdAt: t,
      },
      {
        id: leaderId,
        teamId,
        name: 'My leader',
        scratchpad: '',
        createdAt: t,
      },
    ],
    items: [],
    notifiedReminderIds: [],
    lastTeamId: teamId,
    profile: { displayName: 'Me', favoriteTeamIds: [] },
    notes: [],
    ...defaultTodoBundle(),
  };
}

function defaultTodoBundle(): { todoGroups: TodoGroup[]; todoItems: TodoItem[] } {
  const id = uuid();
  const t = nowIso();
  return {
    todoGroups: [{ id, name: 'General', sortOrder: 0, createdAt: t }],
    todoItems: [],
  };
}

function parsePeople(raw: unknown[]): Person[] {
  return raw
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => ({
      id: typeof p.id === 'string' ? p.id : uuid(),
      teamId: typeof p.teamId === 'string' ? p.teamId : '',
      name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Unnamed',
      title: typeof p.title === 'string' ? p.title : undefined,
      isSelf: !!p.isSelf || (typeof p.id === 'string' && p.id.startsWith('__self__')),
      scratchpad: typeof p.scratchpad === 'string' ? p.scratchpad : '',
      agenda: typeof p.agenda === 'string' ? p.agenda : '',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : nowIso(),
    }));
}

function parseTeams(raw: unknown[]): Team[] {
  const statuses: TeamStatus[] = ['active', 'paused', 'archived'];
  return raw
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => {
      const st = t.status;
      const status = statuses.includes(st as TeamStatus) ? (st as TeamStatus) : 'active';
      return {
        id: typeof t.id === 'string' ? t.id : uuid(),
        name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Team',
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowIso(),
        status,
      };
    });
}

function parseItems(raw: unknown[]): Item[] {
  const goals: GoalStatus[] = ['planned', 'active', 'completed', 'cancelled'];
  const feedbackKinds: FeedbackKind[] = ['praise', 'coaching', 'concern'];
  const repeats: ReminderRepeat[] = ['daily', 'weekly', 'monthly'];
  const knownKinds: ItemKind[] = ['task', 'note', 'goal', 'document', 'feedback'];
  return raw
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => {
      const kind: ItemKind = knownKinds.includes(it.kind as ItemKind) ? (it.kind as ItemKind) : 'note';
      const goalStatusRaw = it.goalStatus;
      const goalStatus =
        kind === 'goal' && typeof goalStatusRaw === 'string' && goals.includes(goalStatusRaw as GoalStatus)
          ? (goalStatusRaw as GoalStatus)
          : undefined;
      const feedbackRaw = it.feedbackKind;
      const feedbackKind =
        kind === 'feedback' && typeof feedbackRaw === 'string' && feedbackKinds.includes(feedbackRaw as FeedbackKind)
          ? (feedbackRaw as FeedbackKind)
          : kind === 'feedback'
            ? 'coaching'
            : undefined;
      const repeatRaw = it.remindRepeat;
      const remindRepeat =
        typeof repeatRaw === 'string' && repeats.includes(repeatRaw as ReminderRepeat)
          ? (repeatRaw as ReminderRepeat)
          : undefined;
      return {
        id: typeof it.id === 'string' ? it.id : uuid(),
        personId: typeof it.personId === 'string' ? it.personId : '',
        kind,
        title: typeof it.title === 'string' ? it.title : '',
        body: typeof it.body === 'string' ? it.body : '',
        dueAt: typeof it.dueAt === 'string' ? it.dueAt : undefined,
        startAt: typeof it.startAt === 'string' ? it.startAt : undefined,
        goalStatus,
        feedbackKind,
        remindAt: typeof it.remindAt === 'string' ? it.remindAt : undefined,
        remindRepeat,
        done: !!it.done,
        doneAt: typeof it.doneAt === 'string' ? it.doneAt : undefined,
        url: typeof it.url === 'string' ? it.url : undefined,
        category: typeof it.category === 'string' && it.category.trim() ? it.category.trim() : undefined,
        createdAt: typeof it.createdAt === 'string' ? it.createdAt : nowIso(),
        updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : nowIso(),
      };
    });
}

const KNOWN_PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

function parsePriority(value: unknown): Priority | undefined {
  return typeof value === 'string' && KNOWN_PRIORITIES.includes(value as Priority)
    ? (value as Priority)
    : undefined;
}

function parseTodoGroups(raw: unknown[]): TodoGroup[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g, i) => ({
      id: typeof g.id === 'string' ? g.id : uuid(),
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : 'List',
      sortOrder: typeof g.sortOrder === 'number' ? g.sortOrder : i,
      pinned: g.pinned === true ? true : undefined,
      archived: g.archived === true ? true : undefined,
      priority: parsePriority(g.priority),
      createdAt: typeof g.createdAt === 'string' ? g.createdAt : nowIso(),
    }));
}

function parseTodoStatus(raw: unknown, done: boolean): TodoStatus {
  // Accept any string that matches one of the known statuses. Anything
  // else (older files, hand-edited JSON, future statuses we don't know)
  // falls back to deriving from `done` so the row at least lands in
  // the right open / closed bucket.
  if (typeof raw === 'string') {
    const candidate = raw as TodoStatus;
    if (TODO_STATUS_OPTIONS.some((o) => o.value === candidate)) return candidate;
  }
  return done ? 'done' : 'todo';
}

function parseTodoItems(raw: unknown[]): TodoItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x, i) => {
      const done = !!x.done;
      const status = parseTodoStatus(x.status, done);
      // Keep the legacy `done` flag in lockstep with `status === 'done'`.
      // This matters for backups written by older builds being re-read:
      // if someone manually edits status to 'done' but leaves done:false,
      // we still want the row to behave as completed.
      const resolvedDone = status === 'done';
      return {
        id: typeof x.id === 'string' ? x.id : uuid(),
        groupId: typeof x.groupId === 'string' ? x.groupId : '',
        title: typeof x.title === 'string' ? x.title : '',
        status,
        done: resolvedDone,
        doneAt: typeof x.doneAt === 'string' ? x.doneAt : undefined,
        dueAt: typeof x.dueAt === 'string' ? x.dueAt : undefined,
        priority: parsePriority(x.priority),
        sortOrder: typeof x.sortOrder === 'number' ? x.sortOrder : i,
        createdAt: typeof x.createdAt === 'string' ? x.createdAt : nowIso(),
        updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : nowIso(),
      };
    });
}

/** v1 -> v2 migration: single implicit team, assign teamId to every person, __self -> __self__{team}. */
function migrateV1ToV2(o: Record<string, unknown>): AppData {
  const t = nowIso();
  const teamId = uuid();
  const newSelfId = selfPersonIdForTeam(teamId);
  const rawPeople = Array.isArray(o.people) ? o.people : [];
  const people: Person[] = rawPeople
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .map((p) => {
      const oldId = typeof p.id === 'string' ? p.id : uuid();
      const id = oldId === LEGACY_SELF_PERSON_ID ? newSelfId : oldId;
      const isSelf = oldId === LEGACY_SELF_PERSON_ID;
      return {
        id,
        teamId,
        name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Unnamed',
        title: typeof p.title === 'string' ? p.title : undefined,
        isSelf,
        scratchpad: '',
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : t,
      };
    });

  if (!people.some((p) => p.id === newSelfId)) {
    people.unshift({
      id: newSelfId,
      teamId,
      name: 'Me',
      isSelf: true,
      scratchpad: '',
      createdAt: t,
    });
  }

  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items = parseItems(rawItems).map((it) => ({
    ...it,
    personId: it.personId === LEGACY_SELF_PERSON_ID ? newSelfId : it.personId,
  }));

  const notified = Array.isArray(o.notifiedReminderIds) ? o.notifiedReminderIds : [];

  return ensureProfile(
    ensureTeamsHaveLeader(
      ensureTeamsHaveSelf({
        version: DATA_VERSION,
        teams: [{ id: teamId, name: 'Default team', createdAt: t, status: 'active' }],
        people,
        items,
        notifiedReminderIds: [...notified].filter((x): x is string => typeof x === 'string'),
        lastTeamId: teamId,
        notes: [],
        ...defaultTodoBundle(),
      }),
    ),
  );
}

function ensureTeamsHaveSelf(data: AppData): AppData {
  const t = nowIso();
  let { teams, people } = data;
  const additions: Person[] = [];

  for (const team of teams) {
    const hasSelf = people.some((p) => p.teamId === team.id && isSelfPerson(p));
    if (!hasSelf) {
      additions.push({
        id: selfPersonIdForTeam(team.id),
        teamId: team.id,
        name: 'Me',
        isSelf: true,
        scratchpad: '',
        createdAt: t,
      });
    }
  }

  if (additions.length) {
    people = [...people, ...additions];
  }

  /** Attach orphaned people (missing teamId) to the first available team. */
  const missingTeam = people.filter((p) => !p.teamId || !teams.some((x) => x.id === p.teamId));
  if (missingTeam.length) {
    let fallbackTeamId = teams[0]?.id;
    if (!fallbackTeamId) {
      fallbackTeamId = uuid();
      teams = [...teams, { id: fallbackTeamId, name: 'Team', createdAt: t, status: 'active' as TeamStatus }];
    }
    people = people.map((p) =>
      !p.teamId || !teams.some((x) => x.id === p.teamId) ? { ...p, teamId: fallbackTeamId! } : p,
    );
  }

  return { ...data, teams, people };
}

function ensureTeamsHaveLeader(data: AppData): AppData {
  const t = nowIso();
  let { teams, people } = data;
  const additions: Person[] = [];

  for (const team of teams) {
    const lid = leaderPersonIdForTeam(team.id);
    if (!people.some((p) => p.id === lid)) {
      additions.push({
        id: lid,
        teamId: team.id,
        name: 'My leader',
        scratchpad: '',
        createdAt: t,
      });
    }
  }

  if (additions.length) {
    people = [...people, ...additions];
  }

  return { ...data, teams, people };
}

function normalizeGoalItem(it: Item): Item {
  if (it.kind !== 'goal') {
    const { goalStatus: _g, startAt: _s, ...rest } = it;
    void _g;
    void _s;
    return rest as Item;
  }
  const allowed: GoalStatus[] = ['planned', 'active', 'completed', 'cancelled'];
  const goalStatus: GoalStatus =
    it.goalStatus && allowed.includes(it.goalStatus) ? it.goalStatus : it.done ? 'completed' : 'planned';
  const done = goalStatus === 'completed';
  return {
    ...it,
    goalStatus,
    done,
    startAt: typeof it.startAt === 'string' ? it.startAt : undefined,
  };
}

function ensureTodoDomain(data: AppData): AppData {
  let todoGroups = [...(data.todoGroups ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  let todoItems = [...(data.todoItems ?? [])];
  if (todoGroups.length === 0) {
    const id = uuid();
    todoGroups = [{ id, name: 'Genel', sortOrder: 0, createdAt: nowIso() }];
  }
  const firstId = todoGroups[0]!.id;
  todoItems = todoItems.map((x) => ({
    ...x,
    groupId: todoGroups.some((g) => g.id === x.groupId) ? x.groupId : firstId,
  }));
  return { ...data, todoGroups, todoItems };
}

function patchDataToV3(data: AppData): AppData {
  let d: AppData = { ...data, version: DATA_VERSION };
  d = ensureTodoDomain(d);
  d = { ...d, items: d.items.map(normalizeGoalItem) };
  return d;
}

export function normalizeData(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;

  const o = raw as Record<string, unknown>;
  const ver = typeof o.version === 'number' ? o.version : 1;

  if (ver < 2) {
    return patchDataToV3(migrateV1ToV2(o));
  }

  let teams = parseTeams(Array.isArray(o.teams) ? o.teams : []);
  let people = parsePeople(Array.isArray(o.people) ? o.people : []);
  const items = parseItems(Array.isArray(o.items) ? o.items : []);
  const notified = [...(Array.isArray(o.notifiedReminderIds) ? o.notifiedReminderIds : [])].filter(
    (x): x is string => typeof x === 'string',
  );
  const lastTeamId = typeof o.lastTeamId === 'string' ? o.lastTeamId : undefined;
  const todoGroups = parseTodoGroups(Array.isArray(o.todoGroups) ? o.todoGroups : []);
  const todoItems = parseTodoItems(Array.isArray(o.todoItems) ? o.todoItems : []);

  if (teams.length === 0) {
    const tid = uuid();
    teams = [{ id: tid, name: 'My first team', createdAt: nowIso(), status: 'active' }];
    people = people.map((p) => ({ ...p, teamId: p.teamId || tid }));
  }

  let data: AppData = {
    version: DATA_VERSION,
    teams,
    people,
    items,
    notifiedReminderIds: notified,
    lastTeamId: lastTeamId && teams.some((x) => x.id === lastTeamId) ? lastTeamId : teams[0]?.id,
    todoGroups,
    todoItems,
    aiSettings: parseAISettings(o.aiSettings),
    notes: parseNotes(o.notes),
    notesLock: parseNotesLock(o.notesLock),
  };

  data = ensureTeamsHaveSelf(data);
  data = ensureTeamsHaveLeader(data);
  data = ensureProfile(data);

  return patchDataToV3(data);
}

function parseAISettings(raw: unknown): AISettings | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const providers: AIProvider[] = ['anthropic', 'openai', 'gemini'];
  const provider =
    typeof o.provider === 'string' && providers.includes(o.provider as AIProvider)
      ? (o.provider as AIProvider)
      : undefined;
  const apiKey = typeof o.apiKey === 'string' && o.apiKey.trim() ? o.apiKey.trim() : undefined;
  const model = typeof o.model === 'string' && o.model.trim() ? o.model.trim() : undefined;
  const systemPrompt = typeof o.systemPrompt === 'string' ? o.systemPrompt : undefined;
  const extractionGuidance =
    typeof o.extractionGuidance === 'string' ? o.extractionGuidance : undefined;
  if (!provider && !apiKey && !model && !systemPrompt && !extractionGuidance) return undefined;
  return { provider, apiKey, model, systemPrompt, extractionGuidance };
}

function parseNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return [];
  const out: Note[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const o = n as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id) continue;
    const locked = !!o.locked;
    const cipher = locked && o.cipher && typeof o.cipher === 'object'
      ? (() => {
          const c = o.cipher as Record<string, unknown>;
          if (typeof c.ivB64 === 'string' && typeof c.cipherB64 === 'string') {
            return { ivB64: c.ivB64, cipherB64: c.cipherB64 };
          }
          return undefined;
        })()
      : undefined;
    out.push({
      id: o.id,
      title: typeof o.title === 'string' ? o.title : '',
      body: typeof o.body === 'string' && !locked ? o.body : '',
      locked,
      cipher,
      pinned: !!o.pinned,
      sortOrder: typeof o.sortOrder === 'number' ? o.sortOrder : undefined,
      lastOpenedAt: typeof o.lastOpenedAt === 'string' ? o.lastOpenedAt : undefined,
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : nowIso(),
      updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : nowIso(),
    });
  }
  return out;
}

function parseNotesLock(raw: unknown): NotesLock | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.saltB64 !== 'string' ||
    typeof o.verifierIvB64 !== 'string' ||
    typeof o.verifierCipherB64 !== 'string'
  ) {
    return undefined;
  }
  let recovery: NotesLock['recovery'] | undefined;
  if (o.recovery && typeof o.recovery === 'object') {
    const r = o.recovery as Record<string, unknown>;
    if (
      typeof r.saltB64 === 'string' &&
      typeof r.ivB64 === 'string' &&
      typeof r.cipherB64 === 'string'
    ) {
      recovery = { saltB64: r.saltB64, ivB64: r.ivB64, cipherB64: r.cipherB64 };
    }
  }
  return {
    saltB64: o.saltB64,
    verifierIvB64: o.verifierIvB64,
    verifierCipherB64: o.verifierCipherB64,
    ...(recovery ? { recovery } : {}),
  };
}

function ensureProfile(data: AppData): AppData {
  const raw = data.profile ?? {
    displayName: 'Me',
    favoriteTeamIds: [],
  };
  const fav = (raw.favoriteTeamIds ?? []).filter((id) => data.teams.some((t) => t.id === id));
  const teams = data.teams.map((t) => ({
    ...t,
    status: t.status && ['active', 'paused', 'archived'].includes(t.status) ? t.status : 'active',
  }));
  const avatar =
    typeof raw.avatarDataUrl === 'string' && raw.avatarDataUrl.startsWith('data:')
      ? raw.avatarDataUrl
      : undefined;
  const profile: UserProfile = {
    displayName: raw.displayName?.trim() ? raw.displayName.trim() : 'Me',
    favoriteTeamIds: fav,
    jobTitle: raw.jobTitle?.trim() || undefined,
    department: raw.department?.trim() || undefined,
    phone: raw.phone?.trim() || undefined,
    bio: raw.bio?.trim() || undefined,
    avatarDataUrl: avatar,
  };
  return { ...data, profile, teams };
}
