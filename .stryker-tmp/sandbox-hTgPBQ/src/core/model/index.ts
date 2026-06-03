// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { uuid } from '../../lib/uuid';

/** Legacy single-team self identifier (used during migration). */
export const LEGACY_SELF_PERSON_ID = stryMutAct_9fa48("1198") ? "" : (stryCov_9fa48("1198"), '__self');
export type ItemKind = 'task' | 'note' | 'goal' | 'document' | 'feedback';
export type GoalStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export const GOAL_STATUS_OPTIONS: {
  value: GoalStatus;
  label: string;
}[] = stryMutAct_9fa48("1199") ? [] : (stryCov_9fa48("1199"), [stryMutAct_9fa48("1200") ? {} : (stryCov_9fa48("1200"), {
  value: stryMutAct_9fa48("1201") ? "" : (stryCov_9fa48("1201"), 'planned'),
  label: stryMutAct_9fa48("1202") ? "" : (stryCov_9fa48("1202"), 'Planned')
}), stryMutAct_9fa48("1203") ? {} : (stryCov_9fa48("1203"), {
  value: stryMutAct_9fa48("1204") ? "" : (stryCov_9fa48("1204"), 'active'),
  label: stryMutAct_9fa48("1205") ? "" : (stryCov_9fa48("1205"), 'In progress')
}), stryMutAct_9fa48("1206") ? {} : (stryCov_9fa48("1206"), {
  value: stryMutAct_9fa48("1207") ? "" : (stryCov_9fa48("1207"), 'completed'),
  label: stryMutAct_9fa48("1208") ? "" : (stryCov_9fa48("1208"), 'Completed')
}), stryMutAct_9fa48("1209") ? {} : (stryCov_9fa48("1209"), {
  value: stryMutAct_9fa48("1210") ? "" : (stryCov_9fa48("1210"), 'cancelled'),
  label: stryMutAct_9fa48("1211") ? "" : (stryCov_9fa48("1211"), 'Cancelled')
})]);
export type FeedbackKind = 'praise' | 'coaching' | 'concern';
export const FEEDBACK_KIND_OPTIONS: {
  value: FeedbackKind;
  label: string;
  tone: string;
}[] = stryMutAct_9fa48("1212") ? [] : (stryCov_9fa48("1212"), [stryMutAct_9fa48("1213") ? {} : (stryCov_9fa48("1213"), {
  value: stryMutAct_9fa48("1214") ? "" : (stryCov_9fa48("1214"), 'praise'),
  label: stryMutAct_9fa48("1215") ? "" : (stryCov_9fa48("1215"), 'Praise'),
  tone: stryMutAct_9fa48("1216") ? "" : (stryCov_9fa48("1216"), 'ok')
}), stryMutAct_9fa48("1217") ? {} : (stryCov_9fa48("1217"), {
  value: stryMutAct_9fa48("1218") ? "" : (stryCov_9fa48("1218"), 'coaching'),
  label: stryMutAct_9fa48("1219") ? "" : (stryCov_9fa48("1219"), 'Coaching'),
  tone: stryMutAct_9fa48("1220") ? "" : (stryCov_9fa48("1220"), 'info')
}), stryMutAct_9fa48("1221") ? {} : (stryCov_9fa48("1221"), {
  value: stryMutAct_9fa48("1222") ? "" : (stryCov_9fa48("1222"), 'concern'),
  label: stryMutAct_9fa48("1223") ? "" : (stryCov_9fa48("1223"), 'Concern'),
  tone: stryMutAct_9fa48("1224") ? "" : (stryCov_9fa48("1224"), 'danger')
})]);
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
export const REMIND_REPEAT_OPTIONS: {
  value: '' | ReminderRepeat;
  label: string;
}[] = stryMutAct_9fa48("1225") ? [] : (stryCov_9fa48("1225"), [stryMutAct_9fa48("1226") ? {} : (stryCov_9fa48("1226"), {
  value: stryMutAct_9fa48("1227") ? "Stryker was here!" : (stryCov_9fa48("1227"), ''),
  label: stryMutAct_9fa48("1228") ? "" : (stryCov_9fa48("1228"), 'One-time')
}), stryMutAct_9fa48("1229") ? {} : (stryCov_9fa48("1229"), {
  value: stryMutAct_9fa48("1230") ? "" : (stryCov_9fa48("1230"), 'daily'),
  label: stryMutAct_9fa48("1231") ? "" : (stryCov_9fa48("1231"), 'Daily')
}), stryMutAct_9fa48("1232") ? {} : (stryCov_9fa48("1232"), {
  value: stryMutAct_9fa48("1233") ? "" : (stryCov_9fa48("1233"), 'weekly'),
  label: stryMutAct_9fa48("1234") ? "" : (stryCov_9fa48("1234"), 'Weekly')
}), stryMutAct_9fa48("1235") ? {} : (stryCov_9fa48("1235"), {
  value: stryMutAct_9fa48("1236") ? "" : (stryCov_9fa48("1236"), 'monthly'),
  label: stryMutAct_9fa48("1237") ? "" : (stryCov_9fa48("1237"), 'Monthly')
})]);
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export const PRIORITY_OPTIONS: {
  value: Priority;
  label: string;
  rank: number;
  tone: string;
}[] = stryMutAct_9fa48("1238") ? [] : (stryCov_9fa48("1238"), [stryMutAct_9fa48("1239") ? {} : (stryCov_9fa48("1239"), {
  value: stryMutAct_9fa48("1240") ? "" : (stryCov_9fa48("1240"), 'urgent'),
  label: stryMutAct_9fa48("1241") ? "" : (stryCov_9fa48("1241"), 'Urgent'),
  rank: 0,
  tone: stryMutAct_9fa48("1242") ? "" : (stryCov_9fa48("1242"), 'danger')
}), stryMutAct_9fa48("1243") ? {} : (stryCov_9fa48("1243"), {
  value: stryMutAct_9fa48("1244") ? "" : (stryCov_9fa48("1244"), 'high'),
  label: stryMutAct_9fa48("1245") ? "" : (stryCov_9fa48("1245"), 'High'),
  rank: 1,
  tone: stryMutAct_9fa48("1246") ? "" : (stryCov_9fa48("1246"), 'warn')
}), stryMutAct_9fa48("1247") ? {} : (stryCov_9fa48("1247"), {
  value: stryMutAct_9fa48("1248") ? "" : (stryCov_9fa48("1248"), 'normal'),
  label: stryMutAct_9fa48("1249") ? "" : (stryCov_9fa48("1249"), 'Normal'),
  rank: 2,
  tone: stryMutAct_9fa48("1250") ? "" : (stryCov_9fa48("1250"), 'info')
}), stryMutAct_9fa48("1251") ? {} : (stryCov_9fa48("1251"), {
  value: stryMutAct_9fa48("1252") ? "" : (stryCov_9fa48("1252"), 'low'),
  label: stryMutAct_9fa48("1253") ? "" : (stryCov_9fa48("1253"), 'Low'),
  rank: 3,
  tone: stryMutAct_9fa48("1254") ? "" : (stryCov_9fa48("1254"), 'muted')
})]);
export function priorityRank(p: Priority | undefined): number {
  if (stryMutAct_9fa48("1255")) {
    {}
  } else {
    stryCov_9fa48("1255");
    if (stryMutAct_9fa48("1258") ? false : stryMutAct_9fa48("1257") ? true : stryMutAct_9fa48("1256") ? p : (stryCov_9fa48("1256", "1257", "1258"), !p)) return 2;
    return stryMutAct_9fa48("1259") ? PRIORITY_OPTIONS.find(o => o.value === p)?.rank && 2 : (stryCov_9fa48("1259"), (stryMutAct_9fa48("1260") ? PRIORITY_OPTIONS.find(o => o.value === p).rank : (stryCov_9fa48("1260"), PRIORITY_OPTIONS.find(stryMutAct_9fa48("1261") ? () => undefined : (stryCov_9fa48("1261"), o => stryMutAct_9fa48("1264") ? o.value !== p : stryMutAct_9fa48("1263") ? false : stryMutAct_9fa48("1262") ? true : (stryCov_9fa48("1262", "1263", "1264"), o.value === p)))?.rank)) ?? 2);
  }
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
}[] = stryMutAct_9fa48("1265") ? [] : (stryCov_9fa48("1265"), [stryMutAct_9fa48("1266") ? {} : (stryCov_9fa48("1266"), {
  value: stryMutAct_9fa48("1267") ? "" : (stryCov_9fa48("1267"), 'todo'),
  label: stryMutAct_9fa48("1268") ? "" : (stryCov_9fa48("1268"), 'To do'),
  shortLabel: stryMutAct_9fa48("1269") ? "" : (stryCov_9fa48("1269"), 'To do'),
  rank: 0,
  tone: stryMutAct_9fa48("1270") ? "" : (stryCov_9fa48("1270"), 'info')
}), stryMutAct_9fa48("1271") ? {} : (stryCov_9fa48("1271"), {
  value: stryMutAct_9fa48("1272") ? "" : (stryCov_9fa48("1272"), 'in_progress'),
  label: stryMutAct_9fa48("1273") ? "" : (stryCov_9fa48("1273"), 'In progress'),
  shortLabel: stryMutAct_9fa48("1274") ? "" : (stryCov_9fa48("1274"), 'WIP'),
  rank: 1,
  tone: stryMutAct_9fa48("1275") ? "" : (stryCov_9fa48("1275"), 'warn')
}), stryMutAct_9fa48("1276") ? {} : (stryCov_9fa48("1276"), {
  value: stryMutAct_9fa48("1277") ? "" : (stryCov_9fa48("1277"), 'done'),
  label: stryMutAct_9fa48("1278") ? "" : (stryCov_9fa48("1278"), 'Done'),
  shortLabel: stryMutAct_9fa48("1279") ? "" : (stryCov_9fa48("1279"), 'Done'),
  rank: 2,
  tone: stryMutAct_9fa48("1280") ? "" : (stryCov_9fa48("1280"), 'ok')
}), stryMutAct_9fa48("1281") ? {} : (stryCov_9fa48("1281"), {
  value: stryMutAct_9fa48("1282") ? "" : (stryCov_9fa48("1282"), 'cancelled'),
  label: stryMutAct_9fa48("1283") ? "" : (stryCov_9fa48("1283"), 'Cancelled'),
  shortLabel: stryMutAct_9fa48("1284") ? "" : (stryCov_9fa48("1284"), 'Cancel'),
  rank: 3,
  tone: stryMutAct_9fa48("1285") ? "" : (stryCov_9fa48("1285"), 'muted')
})]);
export function todoStatusRank(s: TodoStatus | undefined): number {
  if (stryMutAct_9fa48("1286")) {
    {}
  } else {
    stryCov_9fa48("1286");
    return stryMutAct_9fa48("1287") ? TODO_STATUS_OPTIONS.find(o => o.value === s)?.rank && 0 : (stryCov_9fa48("1287"), (stryMutAct_9fa48("1288") ? TODO_STATUS_OPTIONS.find(o => o.value === s).rank : (stryCov_9fa48("1288"), TODO_STATUS_OPTIONS.find(stryMutAct_9fa48("1289") ? () => undefined : (stryCov_9fa48("1289"), o => stryMutAct_9fa48("1292") ? o.value !== s : stryMutAct_9fa48("1291") ? false : stryMutAct_9fa48("1290") ? true : (stryCov_9fa48("1290", "1291", "1292"), o.value === s)))?.rank)) ?? 0);
  }
}

/** True iff the item is still open (counts towards "open tasks" stats). */
export function isTodoOpen(status: TodoStatus | undefined): boolean {
  if (stryMutAct_9fa48("1293")) {
    {}
  } else {
    stryCov_9fa48("1293");
    return stryMutAct_9fa48("1296") ? status === 'todo' && status === 'in_progress' : stryMutAct_9fa48("1295") ? false : stryMutAct_9fa48("1294") ? true : (stryCov_9fa48("1294", "1295", "1296"), (stryMutAct_9fa48("1298") ? status !== 'todo' : stryMutAct_9fa48("1297") ? false : (stryCov_9fa48("1297", "1298"), status === (stryMutAct_9fa48("1299") ? "" : (stryCov_9fa48("1299"), 'todo')))) || (stryMutAct_9fa48("1301") ? status !== 'in_progress' : stryMutAct_9fa48("1300") ? false : (stryCov_9fa48("1300", "1301"), status === (stryMutAct_9fa48("1302") ? "" : (stryCov_9fa48("1302"), 'in_progress')))));
  }
}
export interface TodoItem {
  id: string;
  groupId: string;
  title: string;
  /**
   * Optional long-form description for the task. After the rich editor,
   * `bodyFormat: 'prosemirror'` stores ProseMirror JSON; legacy rows omit
   * the field and stay markdown until first edit.
   */
  body?: string;
  /** `'prosemirror'` when `body` is JSON; absent = legacy markdown. */
  bodyFormat?: 'markdown' | 'prosemirror';
  /** Denormalised plain text for search and AI (updated on every save). */
  bodyPlainText?: string;
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
  /**
   * When to fire a desktop / browser reminder for this todo.
   *
   * Schema-wise this is independent from `dueAt` (you can have a
   * reminder without a deadline, e.g. "ping me at 10am about this
   * open-ended task"), but the schedule popover currently mirrors
   * `dueAt` whenever the user toggles reminders on — that's the most
   * common case and avoids a separate "pick a reminder date" UI.
   * Power-users (or sync from another device) can still write the
   * fields independently.
   */
  remindAt?: string;
  /**
   * Optional recurrence for the reminder ('daily' | 'weekly' | 'monthly').
   * When the reminder fires and a repeat is set, `useReminderWatcher`
   * advances `remindAt` to the next occurrence instead of marking it as
   * notified once.
   */
  remindRepeat?: ReminderRepeat;
  /** Order index within the group. Lower comes first. */
  sortOrder?: number;
  /**
   * Optional reference to the note this task was derived from.
   *
   * Today this gets set automatically when the user runs the AI task
   * extractor on a specific note (Notes sidebar → ✨ Extract tasks).
   * Manual link/unlink can be added later — the field is just a
   * note `id`, so any UI that wants to manage it later is free to.
   *
   * If the referenced note gets deleted the field is intentionally
   * NOT cleared on the task: keeping the orphan id is harmless (the
   * UI renders it as "(deleted note)" with no link), and the moment
   * the user undoes the delete from a backup the link is restored
   * automatically. Wiping the field would lose that recovery hook
   * and would require migrating every linked task on every note
   * delete — both bad trade-offs for a back-reference that's already
   * only advisory.
   */
  sourceNoteId?: string;
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
}[] = stryMutAct_9fa48("1303") ? [] : (stryCov_9fa48("1303"), [stryMutAct_9fa48("1304") ? {} : (stryCov_9fa48("1304"), {
  value: stryMutAct_9fa48("1305") ? "" : (stryCov_9fa48("1305"), 'anthropic'),
  label: stryMutAct_9fa48("1306") ? "" : (stryCov_9fa48("1306"), 'Anthropic Claude'),
  defaultModel: stryMutAct_9fa48("1307") ? "" : (stryCov_9fa48("1307"), 'claude-3-5-sonnet-latest'),
  modelExamples: stryMutAct_9fa48("1308") ? [] : (stryCov_9fa48("1308"), [stryMutAct_9fa48("1309") ? "" : (stryCov_9fa48("1309"), 'claude-3-5-sonnet-latest'), stryMutAct_9fa48("1310") ? "" : (stryCov_9fa48("1310"), 'claude-3-5-haiku-latest'), stryMutAct_9fa48("1311") ? "" : (stryCov_9fa48("1311"), 'claude-3-opus-latest')])
}), stryMutAct_9fa48("1312") ? {} : (stryCov_9fa48("1312"), {
  value: stryMutAct_9fa48("1313") ? "" : (stryCov_9fa48("1313"), 'openai'),
  label: stryMutAct_9fa48("1314") ? "" : (stryCov_9fa48("1314"), 'OpenAI ChatGPT'),
  defaultModel: stryMutAct_9fa48("1315") ? "" : (stryCov_9fa48("1315"), 'gpt-4o-mini'),
  modelExamples: stryMutAct_9fa48("1316") ? [] : (stryCov_9fa48("1316"), [stryMutAct_9fa48("1317") ? "" : (stryCov_9fa48("1317"), 'gpt-4o-mini'), stryMutAct_9fa48("1318") ? "" : (stryCov_9fa48("1318"), 'gpt-4o'), stryMutAct_9fa48("1319") ? "" : (stryCov_9fa48("1319"), 'gpt-4.1-mini')])
}), stryMutAct_9fa48("1320") ? {} : (stryCov_9fa48("1320"), {
  value: stryMutAct_9fa48("1321") ? "" : (stryCov_9fa48("1321"), 'gemini'),
  label: stryMutAct_9fa48("1322") ? "" : (stryCov_9fa48("1322"), 'Google Gemini'),
  // gemini-1.5-* was retired from v1beta in late 2025; default to the
  // current GA flash model. Users who saved the old name will see a
  // 404 — the error message now nudges them to update.
  defaultModel: stryMutAct_9fa48("1323") ? "" : (stryCov_9fa48("1323"), 'gemini-2.0-flash'),
  modelExamples: stryMutAct_9fa48("1324") ? [] : (stryCov_9fa48("1324"), [stryMutAct_9fa48("1325") ? "" : (stryCov_9fa48("1325"), 'gemini-2.0-flash'), stryMutAct_9fa48("1326") ? "" : (stryCov_9fa48("1326"), 'gemini-2.0-flash-lite'), stryMutAct_9fa48("1327") ? "" : (stryCov_9fa48("1327"), 'gemini-2.5-flash'), stryMutAct_9fa48("1328") ? "" : (stryCov_9fa48("1328"), 'gemini-2.5-pro')])
})]);
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
 * A free-form personal note (macOS Notes-style).
 *
 * `body` holds either legacy markdown or serialised ProseMirror JSON
 * (`bodyFormat: 'prosemirror'`). Locked notes encrypt the body string;
 * `bodyPlainText` is cleared on disk while locked.
 */
export interface Note {
  id: string;
  title: string;
  /** Plaintext body (markdown or ProseMirror JSON). Empty when locked. */
  body: string;
  /** `'prosemirror'` when `body` is JSON; absent = legacy markdown. */
  bodyFormat?: 'markdown' | 'prosemirror';
  /** Denormalised plain text for search / AI. Omitted when locked. */
  bodyPlainText?: string;
  /** True if the note is currently encrypted at rest. */
  locked: boolean;
  /** When `locked === true`, the AES-GCM ciphertext + IV (no salt). */
  cipher?: {
    ivB64: string;
    cipherB64: string;
  };
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
  /**
   * Standalone scratch document (Utilities → Document). Not a Note or Todo —
   * a free-form workspace for drafts, paste buffers, etc.
   */
  utilityDocument?: UtilityDocument;
  /** Utilities → JSON / YAML scratch buffer (synced in workspace JSON). */
  utilityStructuredText?: UtilityStructuredText;
}

/** Persisted rich-text scratch pad under Utilities. */
export interface UtilityDocument {
  body: string;
  bodyFormat?: 'markdown' | 'prosemirror';
  bodyPlainText?: string;
  updatedAt: string;
}
export interface UtilityStructuredText {
  content: string;
  /** Second buffer for side-by-side diff (After). */
  diffContent?: string;
  language: 'json' | 'yaml';
  updatedAt: string;
}
export function nowIso(): string {
  if (stryMutAct_9fa48("1329")) {
    {}
  } else {
    stryCov_9fa48("1329");
    return new Date().toISOString();
  }
}
export function selfPersonIdForTeam(teamId: string): string {
  if (stryMutAct_9fa48("1330")) {
    {}
  } else {
    stryCov_9fa48("1330");
    return stryMutAct_9fa48("1331") ? `` : (stryCov_9fa48("1331"), `__self__${teamId}`);
  }
}
export function leaderPersonIdForTeam(teamId: string): string {
  if (stryMutAct_9fa48("1332")) {
    {}
  } else {
    stryCov_9fa48("1332");
    return stryMutAct_9fa48("1333") ? `` : (stryCov_9fa48("1333"), `__leader__${teamId}`);
  }
}
export function isSelfPerson(p: Pick<Person, 'isSelf' | 'id'>): boolean {
  if (stryMutAct_9fa48("1334")) {
    {}
  } else {
    stryCov_9fa48("1334");
    if (stryMutAct_9fa48("1336") ? false : stryMutAct_9fa48("1335") ? true : (stryCov_9fa48("1335", "1336"), p.isSelf)) return stryMutAct_9fa48("1337") ? false : (stryCov_9fa48("1337"), true);
    return stryMutAct_9fa48("1338") ? p.id.endsWith('__self__') : (stryCov_9fa48("1338"), p.id.startsWith(stryMutAct_9fa48("1339") ? "" : (stryCov_9fa48("1339"), '__self__')));
  }
}
export function isLeaderPerson(p: Pick<Person, 'id'>): boolean {
  if (stryMutAct_9fa48("1340")) {
    {}
  } else {
    stryCov_9fa48("1340");
    return stryMutAct_9fa48("1341") ? p.id.endsWith('__leader__') : (stryCov_9fa48("1341"), p.id.startsWith(stryMutAct_9fa48("1342") ? "" : (stryCov_9fa48("1342"), '__leader__')));
  }
}
export function getSelfPerson(data: Pick<AppData, 'people'>, teamId: string): Person | undefined {
  if (stryMutAct_9fa48("1343")) {
    {}
  } else {
    stryCov_9fa48("1343");
    return data.people.find(stryMutAct_9fa48("1344") ? () => undefined : (stryCov_9fa48("1344"), p => stryMutAct_9fa48("1347") ? p.teamId === teamId || isSelfPerson(p) : stryMutAct_9fa48("1346") ? false : stryMutAct_9fa48("1345") ? true : (stryCov_9fa48("1345", "1346", "1347"), (stryMutAct_9fa48("1349") ? p.teamId !== teamId : stryMutAct_9fa48("1348") ? true : (stryCov_9fa48("1348", "1349"), p.teamId === teamId)) && isSelfPerson(p))));
  }
}
export function getLeaderPerson(data: Pick<AppData, 'people'>, teamId: string): Person | undefined {
  if (stryMutAct_9fa48("1350")) {
    {}
  } else {
    stryCov_9fa48("1350");
    return data.people.find(stryMutAct_9fa48("1351") ? () => undefined : (stryCov_9fa48("1351"), p => stryMutAct_9fa48("1354") ? p.teamId === teamId || isLeaderPerson(p) : stryMutAct_9fa48("1353") ? false : stryMutAct_9fa48("1352") ? true : (stryCov_9fa48("1352", "1353", "1354"), (stryMutAct_9fa48("1356") ? p.teamId !== teamId : stryMutAct_9fa48("1355") ? true : (stryCov_9fa48("1355", "1356"), p.teamId === teamId)) && isLeaderPerson(p))));
  }
}

/** Team members excluding the special "Me" and "My leader" rows. */
export function teamPeople(data: Pick<AppData, 'people'>, teamId: string): Person[] {
  if (stryMutAct_9fa48("1357")) {
    {}
  } else {
    stryCov_9fa48("1357");
    return stryMutAct_9fa48("1358") ? data.people : (stryCov_9fa48("1358"), data.people.filter(stryMutAct_9fa48("1359") ? () => undefined : (stryCov_9fa48("1359"), p => stryMutAct_9fa48("1362") ? p.teamId === teamId && !isSelfPerson(p) || !isLeaderPerson(p) : stryMutAct_9fa48("1361") ? false : stryMutAct_9fa48("1360") ? true : (stryCov_9fa48("1360", "1361", "1362"), (stryMutAct_9fa48("1364") ? p.teamId === teamId || !isSelfPerson(p) : stryMutAct_9fa48("1363") ? true : (stryCov_9fa48("1363", "1364"), (stryMutAct_9fa48("1366") ? p.teamId !== teamId : stryMutAct_9fa48("1365") ? true : (stryCov_9fa48("1365", "1366"), p.teamId === teamId)) && (stryMutAct_9fa48("1367") ? isSelfPerson(p) : (stryCov_9fa48("1367"), !isSelfPerson(p))))) && (stryMutAct_9fa48("1368") ? isLeaderPerson(p) : (stryCov_9fa48("1368"), !isLeaderPerson(p)))))));
  }
}
export function emptyData(): AppData {
  if (stryMutAct_9fa48("1369")) {
    {}
  } else {
    stryCov_9fa48("1369");
    const t = nowIso();
    const teamId = uuid();
    const selfId = selfPersonIdForTeam(teamId);
    const leaderId = leaderPersonIdForTeam(teamId);
    return stryMutAct_9fa48("1370") ? {} : (stryCov_9fa48("1370"), {
      version: DATA_VERSION,
      teams: stryMutAct_9fa48("1371") ? [] : (stryCov_9fa48("1371"), [stryMutAct_9fa48("1372") ? {} : (stryCov_9fa48("1372"), {
        id: teamId,
        name: stryMutAct_9fa48("1373") ? "" : (stryCov_9fa48("1373"), 'My first team'),
        createdAt: t,
        status: stryMutAct_9fa48("1374") ? "" : (stryCov_9fa48("1374"), 'active')
      })]),
      people: stryMutAct_9fa48("1375") ? [] : (stryCov_9fa48("1375"), [stryMutAct_9fa48("1376") ? {} : (stryCov_9fa48("1376"), {
        id: selfId,
        teamId,
        name: stryMutAct_9fa48("1377") ? "" : (stryCov_9fa48("1377"), 'Me'),
        isSelf: stryMutAct_9fa48("1378") ? false : (stryCov_9fa48("1378"), true),
        scratchpad: stryMutAct_9fa48("1379") ? "Stryker was here!" : (stryCov_9fa48("1379"), ''),
        createdAt: t
      }), stryMutAct_9fa48("1380") ? {} : (stryCov_9fa48("1380"), {
        id: leaderId,
        teamId,
        name: stryMutAct_9fa48("1381") ? "" : (stryCov_9fa48("1381"), 'My leader'),
        scratchpad: stryMutAct_9fa48("1382") ? "Stryker was here!" : (stryCov_9fa48("1382"), ''),
        createdAt: t
      })]),
      items: stryMutAct_9fa48("1383") ? ["Stryker was here"] : (stryCov_9fa48("1383"), []),
      notifiedReminderIds: stryMutAct_9fa48("1384") ? ["Stryker was here"] : (stryCov_9fa48("1384"), []),
      lastTeamId: teamId,
      profile: stryMutAct_9fa48("1385") ? {} : (stryCov_9fa48("1385"), {
        displayName: stryMutAct_9fa48("1386") ? "" : (stryCov_9fa48("1386"), 'Me'),
        favoriteTeamIds: stryMutAct_9fa48("1387") ? ["Stryker was here"] : (stryCov_9fa48("1387"), [])
      }),
      notes: stryMutAct_9fa48("1388") ? ["Stryker was here"] : (stryCov_9fa48("1388"), []),
      ...defaultTodoBundle()
    });
  }
}
function defaultTodoBundle(): {
  todoGroups: TodoGroup[];
  todoItems: TodoItem[];
} {
  if (stryMutAct_9fa48("1389")) {
    {}
  } else {
    stryCov_9fa48("1389");
    const id = uuid();
    const t = nowIso();
    return stryMutAct_9fa48("1390") ? {} : (stryCov_9fa48("1390"), {
      todoGroups: stryMutAct_9fa48("1391") ? [] : (stryCov_9fa48("1391"), [stryMutAct_9fa48("1392") ? {} : (stryCov_9fa48("1392"), {
        id,
        name: stryMutAct_9fa48("1393") ? "" : (stryCov_9fa48("1393"), 'General'),
        sortOrder: 0,
        createdAt: t
      })]),
      todoItems: stryMutAct_9fa48("1394") ? ["Stryker was here"] : (stryCov_9fa48("1394"), [])
    });
  }
}
function parsePeople(raw: unknown[]): Person[] {
  if (stryMutAct_9fa48("1395")) {
    {}
  } else {
    stryCov_9fa48("1395");
    return stryMutAct_9fa48("1396") ? raw.map(p => ({
      id: typeof p.id === 'string' ? p.id : uuid(),
      teamId: typeof p.teamId === 'string' ? p.teamId : '',
      name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Unnamed',
      title: typeof p.title === 'string' ? p.title : undefined,
      isSelf: !!p.isSelf || typeof p.id === 'string' && p.id.startsWith('__self__'),
      scratchpad: typeof p.scratchpad === 'string' ? p.scratchpad : '',
      agenda: typeof p.agenda === 'string' ? p.agenda : '',
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : nowIso()
    })) : (stryCov_9fa48("1396"), raw.filter(stryMutAct_9fa48("1397") ? () => undefined : (stryCov_9fa48("1397"), (p): p is Record<string, unknown> => stryMutAct_9fa48("1400") ? !!p || typeof p === 'object' : stryMutAct_9fa48("1399") ? false : stryMutAct_9fa48("1398") ? true : (stryCov_9fa48("1398", "1399", "1400"), (stryMutAct_9fa48("1401") ? !p : (stryCov_9fa48("1401"), !(stryMutAct_9fa48("1402") ? p : (stryCov_9fa48("1402"), !p)))) && (stryMutAct_9fa48("1404") ? typeof p !== 'object' : stryMutAct_9fa48("1403") ? true : (stryCov_9fa48("1403", "1404"), typeof p === (stryMutAct_9fa48("1405") ? "" : (stryCov_9fa48("1405"), 'object'))))))).map(stryMutAct_9fa48("1406") ? () => undefined : (stryCov_9fa48("1406"), p => stryMutAct_9fa48("1407") ? {} : (stryCov_9fa48("1407"), {
      id: (stryMutAct_9fa48("1410") ? typeof p.id !== 'string' : stryMutAct_9fa48("1409") ? false : stryMutAct_9fa48("1408") ? true : (stryCov_9fa48("1408", "1409", "1410"), typeof p.id === (stryMutAct_9fa48("1411") ? "" : (stryCov_9fa48("1411"), 'string')))) ? p.id : uuid(),
      teamId: (stryMutAct_9fa48("1414") ? typeof p.teamId !== 'string' : stryMutAct_9fa48("1413") ? false : stryMutAct_9fa48("1412") ? true : (stryCov_9fa48("1412", "1413", "1414"), typeof p.teamId === (stryMutAct_9fa48("1415") ? "" : (stryCov_9fa48("1415"), 'string')))) ? p.teamId : stryMutAct_9fa48("1416") ? "Stryker was here!" : (stryCov_9fa48("1416"), ''),
      name: (stryMutAct_9fa48("1419") ? typeof p.name === 'string' || p.name.trim() : stryMutAct_9fa48("1418") ? false : stryMutAct_9fa48("1417") ? true : (stryCov_9fa48("1417", "1418", "1419"), (stryMutAct_9fa48("1421") ? typeof p.name !== 'string' : stryMutAct_9fa48("1420") ? true : (stryCov_9fa48("1420", "1421"), typeof p.name === (stryMutAct_9fa48("1422") ? "" : (stryCov_9fa48("1422"), 'string')))) && (stryMutAct_9fa48("1423") ? p.name : (stryCov_9fa48("1423"), p.name.trim())))) ? p.name : stryMutAct_9fa48("1424") ? "" : (stryCov_9fa48("1424"), 'Unnamed'),
      title: (stryMutAct_9fa48("1427") ? typeof p.title !== 'string' : stryMutAct_9fa48("1426") ? false : stryMutAct_9fa48("1425") ? true : (stryCov_9fa48("1425", "1426", "1427"), typeof p.title === (stryMutAct_9fa48("1428") ? "" : (stryCov_9fa48("1428"), 'string')))) ? p.title : undefined,
      isSelf: stryMutAct_9fa48("1431") ? !!p.isSelf && typeof p.id === 'string' && p.id.startsWith('__self__') : stryMutAct_9fa48("1430") ? false : stryMutAct_9fa48("1429") ? true : (stryCov_9fa48("1429", "1430", "1431"), (stryMutAct_9fa48("1432") ? !p.isSelf : (stryCov_9fa48("1432"), !(stryMutAct_9fa48("1433") ? p.isSelf : (stryCov_9fa48("1433"), !p.isSelf)))) || (stryMutAct_9fa48("1435") ? typeof p.id === 'string' || p.id.startsWith('__self__') : stryMutAct_9fa48("1434") ? false : (stryCov_9fa48("1434", "1435"), (stryMutAct_9fa48("1437") ? typeof p.id !== 'string' : stryMutAct_9fa48("1436") ? true : (stryCov_9fa48("1436", "1437"), typeof p.id === (stryMutAct_9fa48("1438") ? "" : (stryCov_9fa48("1438"), 'string')))) && (stryMutAct_9fa48("1439") ? p.id.endsWith('__self__') : (stryCov_9fa48("1439"), p.id.startsWith(stryMutAct_9fa48("1440") ? "" : (stryCov_9fa48("1440"), '__self__'))))))),
      scratchpad: (stryMutAct_9fa48("1443") ? typeof p.scratchpad !== 'string' : stryMutAct_9fa48("1442") ? false : stryMutAct_9fa48("1441") ? true : (stryCov_9fa48("1441", "1442", "1443"), typeof p.scratchpad === (stryMutAct_9fa48("1444") ? "" : (stryCov_9fa48("1444"), 'string')))) ? p.scratchpad : stryMutAct_9fa48("1445") ? "Stryker was here!" : (stryCov_9fa48("1445"), ''),
      agenda: (stryMutAct_9fa48("1448") ? typeof p.agenda !== 'string' : stryMutAct_9fa48("1447") ? false : stryMutAct_9fa48("1446") ? true : (stryCov_9fa48("1446", "1447", "1448"), typeof p.agenda === (stryMutAct_9fa48("1449") ? "" : (stryCov_9fa48("1449"), 'string')))) ? p.agenda : stryMutAct_9fa48("1450") ? "Stryker was here!" : (stryCov_9fa48("1450"), ''),
      createdAt: (stryMutAct_9fa48("1453") ? typeof p.createdAt !== 'string' : stryMutAct_9fa48("1452") ? false : stryMutAct_9fa48("1451") ? true : (stryCov_9fa48("1451", "1452", "1453"), typeof p.createdAt === (stryMutAct_9fa48("1454") ? "" : (stryCov_9fa48("1454"), 'string')))) ? p.createdAt : nowIso()
    }))));
  }
}
function parseTeams(raw: unknown[]): Team[] {
  if (stryMutAct_9fa48("1455")) {
    {}
  } else {
    stryCov_9fa48("1455");
    const statuses: TeamStatus[] = stryMutAct_9fa48("1456") ? [] : (stryCov_9fa48("1456"), [stryMutAct_9fa48("1457") ? "" : (stryCov_9fa48("1457"), 'active'), stryMutAct_9fa48("1458") ? "" : (stryCov_9fa48("1458"), 'paused'), stryMutAct_9fa48("1459") ? "" : (stryCov_9fa48("1459"), 'archived')]);
    return stryMutAct_9fa48("1460") ? raw.map(t => {
      const st = t.status;
      const status = statuses.includes(st as TeamStatus) ? st as TeamStatus : 'active';
      return {
        id: typeof t.id === 'string' ? t.id : uuid(),
        name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Team',
        createdAt: typeof t.createdAt === 'string' ? t.createdAt : nowIso(),
        status
      };
    }) : (stryCov_9fa48("1460"), raw.filter(stryMutAct_9fa48("1461") ? () => undefined : (stryCov_9fa48("1461"), (t): t is Record<string, unknown> => stryMutAct_9fa48("1464") ? !!t || typeof t === 'object' : stryMutAct_9fa48("1463") ? false : stryMutAct_9fa48("1462") ? true : (stryCov_9fa48("1462", "1463", "1464"), (stryMutAct_9fa48("1465") ? !t : (stryCov_9fa48("1465"), !(stryMutAct_9fa48("1466") ? t : (stryCov_9fa48("1466"), !t)))) && (stryMutAct_9fa48("1468") ? typeof t !== 'object' : stryMutAct_9fa48("1467") ? true : (stryCov_9fa48("1467", "1468"), typeof t === (stryMutAct_9fa48("1469") ? "" : (stryCov_9fa48("1469"), 'object'))))))).map(t => {
      if (stryMutAct_9fa48("1470")) {
        {}
      } else {
        stryCov_9fa48("1470");
        const st = t.status;
        const status = statuses.includes(st as TeamStatus) ? st as TeamStatus : stryMutAct_9fa48("1471") ? "" : (stryCov_9fa48("1471"), 'active');
        return stryMutAct_9fa48("1472") ? {} : (stryCov_9fa48("1472"), {
          id: (stryMutAct_9fa48("1475") ? typeof t.id !== 'string' : stryMutAct_9fa48("1474") ? false : stryMutAct_9fa48("1473") ? true : (stryCov_9fa48("1473", "1474", "1475"), typeof t.id === (stryMutAct_9fa48("1476") ? "" : (stryCov_9fa48("1476"), 'string')))) ? t.id : uuid(),
          name: (stryMutAct_9fa48("1479") ? typeof t.name === 'string' || t.name.trim() : stryMutAct_9fa48("1478") ? false : stryMutAct_9fa48("1477") ? true : (stryCov_9fa48("1477", "1478", "1479"), (stryMutAct_9fa48("1481") ? typeof t.name !== 'string' : stryMutAct_9fa48("1480") ? true : (stryCov_9fa48("1480", "1481"), typeof t.name === (stryMutAct_9fa48("1482") ? "" : (stryCov_9fa48("1482"), 'string')))) && (stryMutAct_9fa48("1483") ? t.name : (stryCov_9fa48("1483"), t.name.trim())))) ? t.name : stryMutAct_9fa48("1484") ? "" : (stryCov_9fa48("1484"), 'Team'),
          createdAt: (stryMutAct_9fa48("1487") ? typeof t.createdAt !== 'string' : stryMutAct_9fa48("1486") ? false : stryMutAct_9fa48("1485") ? true : (stryCov_9fa48("1485", "1486", "1487"), typeof t.createdAt === (stryMutAct_9fa48("1488") ? "" : (stryCov_9fa48("1488"), 'string')))) ? t.createdAt : nowIso(),
          status
        });
      }
    }));
  }
}
function parseItems(raw: unknown[]): Item[] {
  if (stryMutAct_9fa48("1489")) {
    {}
  } else {
    stryCov_9fa48("1489");
    const goals: GoalStatus[] = stryMutAct_9fa48("1490") ? [] : (stryCov_9fa48("1490"), [stryMutAct_9fa48("1491") ? "" : (stryCov_9fa48("1491"), 'planned'), stryMutAct_9fa48("1492") ? "" : (stryCov_9fa48("1492"), 'active'), stryMutAct_9fa48("1493") ? "" : (stryCov_9fa48("1493"), 'completed'), stryMutAct_9fa48("1494") ? "" : (stryCov_9fa48("1494"), 'cancelled')]);
    const feedbackKinds: FeedbackKind[] = stryMutAct_9fa48("1495") ? [] : (stryCov_9fa48("1495"), [stryMutAct_9fa48("1496") ? "" : (stryCov_9fa48("1496"), 'praise'), stryMutAct_9fa48("1497") ? "" : (stryCov_9fa48("1497"), 'coaching'), stryMutAct_9fa48("1498") ? "" : (stryCov_9fa48("1498"), 'concern')]);
    const repeats: ReminderRepeat[] = stryMutAct_9fa48("1499") ? [] : (stryCov_9fa48("1499"), [stryMutAct_9fa48("1500") ? "" : (stryCov_9fa48("1500"), 'daily'), stryMutAct_9fa48("1501") ? "" : (stryCov_9fa48("1501"), 'weekly'), stryMutAct_9fa48("1502") ? "" : (stryCov_9fa48("1502"), 'monthly')]);
    const knownKinds: ItemKind[] = stryMutAct_9fa48("1503") ? [] : (stryCov_9fa48("1503"), [stryMutAct_9fa48("1504") ? "" : (stryCov_9fa48("1504"), 'task'), stryMutAct_9fa48("1505") ? "" : (stryCov_9fa48("1505"), 'note'), stryMutAct_9fa48("1506") ? "" : (stryCov_9fa48("1506"), 'goal'), stryMutAct_9fa48("1507") ? "" : (stryCov_9fa48("1507"), 'document'), stryMutAct_9fa48("1508") ? "" : (stryCov_9fa48("1508"), 'feedback')]);
    return stryMutAct_9fa48("1509") ? raw.map(it => {
      const kind: ItemKind = knownKinds.includes(it.kind as ItemKind) ? it.kind as ItemKind : 'note';
      const goalStatusRaw = it.goalStatus;
      const goalStatus = kind === 'goal' && typeof goalStatusRaw === 'string' && goals.includes(goalStatusRaw as GoalStatus) ? goalStatusRaw as GoalStatus : undefined;
      const feedbackRaw = it.feedbackKind;
      const feedbackKind = kind === 'feedback' && typeof feedbackRaw === 'string' && feedbackKinds.includes(feedbackRaw as FeedbackKind) ? feedbackRaw as FeedbackKind : kind === 'feedback' ? 'coaching' : undefined;
      const repeatRaw = it.remindRepeat;
      const remindRepeat = typeof repeatRaw === 'string' && repeats.includes(repeatRaw as ReminderRepeat) ? repeatRaw as ReminderRepeat : undefined;
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
        updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : nowIso()
      };
    }) : (stryCov_9fa48("1509"), raw.filter(stryMutAct_9fa48("1510") ? () => undefined : (stryCov_9fa48("1510"), (it): it is Record<string, unknown> => stryMutAct_9fa48("1513") ? !!it || typeof it === 'object' : stryMutAct_9fa48("1512") ? false : stryMutAct_9fa48("1511") ? true : (stryCov_9fa48("1511", "1512", "1513"), (stryMutAct_9fa48("1514") ? !it : (stryCov_9fa48("1514"), !(stryMutAct_9fa48("1515") ? it : (stryCov_9fa48("1515"), !it)))) && (stryMutAct_9fa48("1517") ? typeof it !== 'object' : stryMutAct_9fa48("1516") ? true : (stryCov_9fa48("1516", "1517"), typeof it === (stryMutAct_9fa48("1518") ? "" : (stryCov_9fa48("1518"), 'object'))))))).map(it => {
      if (stryMutAct_9fa48("1519")) {
        {}
      } else {
        stryCov_9fa48("1519");
        const kind: ItemKind = knownKinds.includes(it.kind as ItemKind) ? it.kind as ItemKind : stryMutAct_9fa48("1520") ? "" : (stryCov_9fa48("1520"), 'note');
        const goalStatusRaw = it.goalStatus;
        const goalStatus = (stryMutAct_9fa48("1523") ? kind === 'goal' && typeof goalStatusRaw === 'string' || goals.includes(goalStatusRaw as GoalStatus) : stryMutAct_9fa48("1522") ? false : stryMutAct_9fa48("1521") ? true : (stryCov_9fa48("1521", "1522", "1523"), (stryMutAct_9fa48("1525") ? kind === 'goal' || typeof goalStatusRaw === 'string' : stryMutAct_9fa48("1524") ? true : (stryCov_9fa48("1524", "1525"), (stryMutAct_9fa48("1527") ? kind !== 'goal' : stryMutAct_9fa48("1526") ? true : (stryCov_9fa48("1526", "1527"), kind === (stryMutAct_9fa48("1528") ? "" : (stryCov_9fa48("1528"), 'goal')))) && (stryMutAct_9fa48("1530") ? typeof goalStatusRaw !== 'string' : stryMutAct_9fa48("1529") ? true : (stryCov_9fa48("1529", "1530"), typeof goalStatusRaw === (stryMutAct_9fa48("1531") ? "" : (stryCov_9fa48("1531"), 'string')))))) && goals.includes(goalStatusRaw as GoalStatus))) ? goalStatusRaw as GoalStatus : undefined;
        const feedbackRaw = it.feedbackKind;
        const feedbackKind = (stryMutAct_9fa48("1534") ? kind === 'feedback' && typeof feedbackRaw === 'string' || feedbackKinds.includes(feedbackRaw as FeedbackKind) : stryMutAct_9fa48("1533") ? false : stryMutAct_9fa48("1532") ? true : (stryCov_9fa48("1532", "1533", "1534"), (stryMutAct_9fa48("1536") ? kind === 'feedback' || typeof feedbackRaw === 'string' : stryMutAct_9fa48("1535") ? true : (stryCov_9fa48("1535", "1536"), (stryMutAct_9fa48("1538") ? kind !== 'feedback' : stryMutAct_9fa48("1537") ? true : (stryCov_9fa48("1537", "1538"), kind === (stryMutAct_9fa48("1539") ? "" : (stryCov_9fa48("1539"), 'feedback')))) && (stryMutAct_9fa48("1541") ? typeof feedbackRaw !== 'string' : stryMutAct_9fa48("1540") ? true : (stryCov_9fa48("1540", "1541"), typeof feedbackRaw === (stryMutAct_9fa48("1542") ? "" : (stryCov_9fa48("1542"), 'string')))))) && feedbackKinds.includes(feedbackRaw as FeedbackKind))) ? feedbackRaw as FeedbackKind : (stryMutAct_9fa48("1545") ? kind !== 'feedback' : stryMutAct_9fa48("1544") ? false : stryMutAct_9fa48("1543") ? true : (stryCov_9fa48("1543", "1544", "1545"), kind === (stryMutAct_9fa48("1546") ? "" : (stryCov_9fa48("1546"), 'feedback')))) ? stryMutAct_9fa48("1547") ? "" : (stryCov_9fa48("1547"), 'coaching') : undefined;
        const repeatRaw = it.remindRepeat;
        const remindRepeat = (stryMutAct_9fa48("1550") ? typeof repeatRaw === 'string' || repeats.includes(repeatRaw as ReminderRepeat) : stryMutAct_9fa48("1549") ? false : stryMutAct_9fa48("1548") ? true : (stryCov_9fa48("1548", "1549", "1550"), (stryMutAct_9fa48("1552") ? typeof repeatRaw !== 'string' : stryMutAct_9fa48("1551") ? true : (stryCov_9fa48("1551", "1552"), typeof repeatRaw === (stryMutAct_9fa48("1553") ? "" : (stryCov_9fa48("1553"), 'string')))) && repeats.includes(repeatRaw as ReminderRepeat))) ? repeatRaw as ReminderRepeat : undefined;
        return stryMutAct_9fa48("1554") ? {} : (stryCov_9fa48("1554"), {
          id: (stryMutAct_9fa48("1557") ? typeof it.id !== 'string' : stryMutAct_9fa48("1556") ? false : stryMutAct_9fa48("1555") ? true : (stryCov_9fa48("1555", "1556", "1557"), typeof it.id === (stryMutAct_9fa48("1558") ? "" : (stryCov_9fa48("1558"), 'string')))) ? it.id : uuid(),
          personId: (stryMutAct_9fa48("1561") ? typeof it.personId !== 'string' : stryMutAct_9fa48("1560") ? false : stryMutAct_9fa48("1559") ? true : (stryCov_9fa48("1559", "1560", "1561"), typeof it.personId === (stryMutAct_9fa48("1562") ? "" : (stryCov_9fa48("1562"), 'string')))) ? it.personId : stryMutAct_9fa48("1563") ? "Stryker was here!" : (stryCov_9fa48("1563"), ''),
          kind,
          title: (stryMutAct_9fa48("1566") ? typeof it.title !== 'string' : stryMutAct_9fa48("1565") ? false : stryMutAct_9fa48("1564") ? true : (stryCov_9fa48("1564", "1565", "1566"), typeof it.title === (stryMutAct_9fa48("1567") ? "" : (stryCov_9fa48("1567"), 'string')))) ? it.title : stryMutAct_9fa48("1568") ? "Stryker was here!" : (stryCov_9fa48("1568"), ''),
          body: (stryMutAct_9fa48("1571") ? typeof it.body !== 'string' : stryMutAct_9fa48("1570") ? false : stryMutAct_9fa48("1569") ? true : (stryCov_9fa48("1569", "1570", "1571"), typeof it.body === (stryMutAct_9fa48("1572") ? "" : (stryCov_9fa48("1572"), 'string')))) ? it.body : stryMutAct_9fa48("1573") ? "Stryker was here!" : (stryCov_9fa48("1573"), ''),
          dueAt: (stryMutAct_9fa48("1576") ? typeof it.dueAt !== 'string' : stryMutAct_9fa48("1575") ? false : stryMutAct_9fa48("1574") ? true : (stryCov_9fa48("1574", "1575", "1576"), typeof it.dueAt === (stryMutAct_9fa48("1577") ? "" : (stryCov_9fa48("1577"), 'string')))) ? it.dueAt : undefined,
          startAt: (stryMutAct_9fa48("1580") ? typeof it.startAt !== 'string' : stryMutAct_9fa48("1579") ? false : stryMutAct_9fa48("1578") ? true : (stryCov_9fa48("1578", "1579", "1580"), typeof it.startAt === (stryMutAct_9fa48("1581") ? "" : (stryCov_9fa48("1581"), 'string')))) ? it.startAt : undefined,
          goalStatus,
          feedbackKind,
          remindAt: (stryMutAct_9fa48("1584") ? typeof it.remindAt !== 'string' : stryMutAct_9fa48("1583") ? false : stryMutAct_9fa48("1582") ? true : (stryCov_9fa48("1582", "1583", "1584"), typeof it.remindAt === (stryMutAct_9fa48("1585") ? "" : (stryCov_9fa48("1585"), 'string')))) ? it.remindAt : undefined,
          remindRepeat,
          done: stryMutAct_9fa48("1586") ? !it.done : (stryCov_9fa48("1586"), !(stryMutAct_9fa48("1587") ? it.done : (stryCov_9fa48("1587"), !it.done))),
          doneAt: (stryMutAct_9fa48("1590") ? typeof it.doneAt !== 'string' : stryMutAct_9fa48("1589") ? false : stryMutAct_9fa48("1588") ? true : (stryCov_9fa48("1588", "1589", "1590"), typeof it.doneAt === (stryMutAct_9fa48("1591") ? "" : (stryCov_9fa48("1591"), 'string')))) ? it.doneAt : undefined,
          url: (stryMutAct_9fa48("1594") ? typeof it.url !== 'string' : stryMutAct_9fa48("1593") ? false : stryMutAct_9fa48("1592") ? true : (stryCov_9fa48("1592", "1593", "1594"), typeof it.url === (stryMutAct_9fa48("1595") ? "" : (stryCov_9fa48("1595"), 'string')))) ? it.url : undefined,
          category: (stryMutAct_9fa48("1598") ? typeof it.category === 'string' || it.category.trim() : stryMutAct_9fa48("1597") ? false : stryMutAct_9fa48("1596") ? true : (stryCov_9fa48("1596", "1597", "1598"), (stryMutAct_9fa48("1600") ? typeof it.category !== 'string' : stryMutAct_9fa48("1599") ? true : (stryCov_9fa48("1599", "1600"), typeof it.category === (stryMutAct_9fa48("1601") ? "" : (stryCov_9fa48("1601"), 'string')))) && (stryMutAct_9fa48("1602") ? it.category : (stryCov_9fa48("1602"), it.category.trim())))) ? stryMutAct_9fa48("1603") ? it.category : (stryCov_9fa48("1603"), it.category.trim()) : undefined,
          createdAt: (stryMutAct_9fa48("1606") ? typeof it.createdAt !== 'string' : stryMutAct_9fa48("1605") ? false : stryMutAct_9fa48("1604") ? true : (stryCov_9fa48("1604", "1605", "1606"), typeof it.createdAt === (stryMutAct_9fa48("1607") ? "" : (stryCov_9fa48("1607"), 'string')))) ? it.createdAt : nowIso(),
          updatedAt: (stryMutAct_9fa48("1610") ? typeof it.updatedAt !== 'string' : stryMutAct_9fa48("1609") ? false : stryMutAct_9fa48("1608") ? true : (stryCov_9fa48("1608", "1609", "1610"), typeof it.updatedAt === (stryMutAct_9fa48("1611") ? "" : (stryCov_9fa48("1611"), 'string')))) ? it.updatedAt : nowIso()
        });
      }
    }));
  }
}
const KNOWN_PRIORITIES: Priority[] = stryMutAct_9fa48("1612") ? [] : (stryCov_9fa48("1612"), [stryMutAct_9fa48("1613") ? "" : (stryCov_9fa48("1613"), 'low'), stryMutAct_9fa48("1614") ? "" : (stryCov_9fa48("1614"), 'normal'), stryMutAct_9fa48("1615") ? "" : (stryCov_9fa48("1615"), 'high'), stryMutAct_9fa48("1616") ? "" : (stryCov_9fa48("1616"), 'urgent')]);
function parsePriority(value: unknown): Priority | undefined {
  if (stryMutAct_9fa48("1617")) {
    {}
  } else {
    stryCov_9fa48("1617");
    return (stryMutAct_9fa48("1620") ? typeof value === 'string' || KNOWN_PRIORITIES.includes(value as Priority) : stryMutAct_9fa48("1619") ? false : stryMutAct_9fa48("1618") ? true : (stryCov_9fa48("1618", "1619", "1620"), (stryMutAct_9fa48("1622") ? typeof value !== 'string' : stryMutAct_9fa48("1621") ? true : (stryCov_9fa48("1621", "1622"), typeof value === (stryMutAct_9fa48("1623") ? "" : (stryCov_9fa48("1623"), 'string')))) && KNOWN_PRIORITIES.includes(value as Priority))) ? value as Priority : undefined;
  }
}
function parseTodoGroups(raw: unknown[]): TodoGroup[] {
  if (stryMutAct_9fa48("1624")) {
    {}
  } else {
    stryCov_9fa48("1624");
    if (stryMutAct_9fa48("1627") ? false : stryMutAct_9fa48("1626") ? true : stryMutAct_9fa48("1625") ? Array.isArray(raw) : (stryCov_9fa48("1625", "1626", "1627"), !Array.isArray(raw))) return stryMutAct_9fa48("1628") ? ["Stryker was here"] : (stryCov_9fa48("1628"), []);
    return stryMutAct_9fa48("1629") ? raw.map((g, i) => ({
      id: typeof g.id === 'string' ? g.id : uuid(),
      name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : 'List',
      sortOrder: typeof g.sortOrder === 'number' ? g.sortOrder : i,
      pinned: g.pinned === true ? true : undefined,
      archived: g.archived === true ? true : undefined,
      priority: parsePriority(g.priority),
      createdAt: typeof g.createdAt === 'string' ? g.createdAt : nowIso()
    })) : (stryCov_9fa48("1629"), raw.filter(stryMutAct_9fa48("1630") ? () => undefined : (stryCov_9fa48("1630"), (g): g is Record<string, unknown> => stryMutAct_9fa48("1633") ? !!g || typeof g === 'object' : stryMutAct_9fa48("1632") ? false : stryMutAct_9fa48("1631") ? true : (stryCov_9fa48("1631", "1632", "1633"), (stryMutAct_9fa48("1634") ? !g : (stryCov_9fa48("1634"), !(stryMutAct_9fa48("1635") ? g : (stryCov_9fa48("1635"), !g)))) && (stryMutAct_9fa48("1637") ? typeof g !== 'object' : stryMutAct_9fa48("1636") ? true : (stryCov_9fa48("1636", "1637"), typeof g === (stryMutAct_9fa48("1638") ? "" : (stryCov_9fa48("1638"), 'object'))))))).map(stryMutAct_9fa48("1639") ? () => undefined : (stryCov_9fa48("1639"), (g, i) => stryMutAct_9fa48("1640") ? {} : (stryCov_9fa48("1640"), {
      id: (stryMutAct_9fa48("1643") ? typeof g.id !== 'string' : stryMutAct_9fa48("1642") ? false : stryMutAct_9fa48("1641") ? true : (stryCov_9fa48("1641", "1642", "1643"), typeof g.id === (stryMutAct_9fa48("1644") ? "" : (stryCov_9fa48("1644"), 'string')))) ? g.id : uuid(),
      name: (stryMutAct_9fa48("1647") ? typeof g.name === 'string' || g.name.trim() : stryMutAct_9fa48("1646") ? false : stryMutAct_9fa48("1645") ? true : (stryCov_9fa48("1645", "1646", "1647"), (stryMutAct_9fa48("1649") ? typeof g.name !== 'string' : stryMutAct_9fa48("1648") ? true : (stryCov_9fa48("1648", "1649"), typeof g.name === (stryMutAct_9fa48("1650") ? "" : (stryCov_9fa48("1650"), 'string')))) && (stryMutAct_9fa48("1651") ? g.name : (stryCov_9fa48("1651"), g.name.trim())))) ? stryMutAct_9fa48("1652") ? g.name : (stryCov_9fa48("1652"), g.name.trim()) : stryMutAct_9fa48("1653") ? "" : (stryCov_9fa48("1653"), 'List'),
      sortOrder: (stryMutAct_9fa48("1656") ? typeof g.sortOrder !== 'number' : stryMutAct_9fa48("1655") ? false : stryMutAct_9fa48("1654") ? true : (stryCov_9fa48("1654", "1655", "1656"), typeof g.sortOrder === (stryMutAct_9fa48("1657") ? "" : (stryCov_9fa48("1657"), 'number')))) ? g.sortOrder : i,
      pinned: (stryMutAct_9fa48("1660") ? g.pinned !== true : stryMutAct_9fa48("1659") ? false : stryMutAct_9fa48("1658") ? true : (stryCov_9fa48("1658", "1659", "1660"), g.pinned === (stryMutAct_9fa48("1661") ? false : (stryCov_9fa48("1661"), true)))) ? stryMutAct_9fa48("1662") ? false : (stryCov_9fa48("1662"), true) : undefined,
      archived: (stryMutAct_9fa48("1665") ? g.archived !== true : stryMutAct_9fa48("1664") ? false : stryMutAct_9fa48("1663") ? true : (stryCov_9fa48("1663", "1664", "1665"), g.archived === (stryMutAct_9fa48("1666") ? false : (stryCov_9fa48("1666"), true)))) ? stryMutAct_9fa48("1667") ? false : (stryCov_9fa48("1667"), true) : undefined,
      priority: parsePriority(g.priority),
      createdAt: (stryMutAct_9fa48("1670") ? typeof g.createdAt !== 'string' : stryMutAct_9fa48("1669") ? false : stryMutAct_9fa48("1668") ? true : (stryCov_9fa48("1668", "1669", "1670"), typeof g.createdAt === (stryMutAct_9fa48("1671") ? "" : (stryCov_9fa48("1671"), 'string')))) ? g.createdAt : nowIso()
    }))));
  }
}
function parseTodoStatus(raw: unknown, done: boolean): TodoStatus {
  if (stryMutAct_9fa48("1672")) {
    {}
  } else {
    stryCov_9fa48("1672");
    // Accept any string that matches one of the known statuses. Anything
    // else (older files, hand-edited JSON, future statuses we don't know)
    // falls back to deriving from `done` so the row at least lands in
    // the right open / closed bucket.
    if (stryMutAct_9fa48("1675") ? typeof raw !== 'string' : stryMutAct_9fa48("1674") ? false : stryMutAct_9fa48("1673") ? true : (stryCov_9fa48("1673", "1674", "1675"), typeof raw === (stryMutAct_9fa48("1676") ? "" : (stryCov_9fa48("1676"), 'string')))) {
      if (stryMutAct_9fa48("1677")) {
        {}
      } else {
        stryCov_9fa48("1677");
        const candidate = raw as TodoStatus;
        if (stryMutAct_9fa48("1680") ? TODO_STATUS_OPTIONS.every(o => o.value === candidate) : stryMutAct_9fa48("1679") ? false : stryMutAct_9fa48("1678") ? true : (stryCov_9fa48("1678", "1679", "1680"), TODO_STATUS_OPTIONS.some(stryMutAct_9fa48("1681") ? () => undefined : (stryCov_9fa48("1681"), o => stryMutAct_9fa48("1684") ? o.value !== candidate : stryMutAct_9fa48("1683") ? false : stryMutAct_9fa48("1682") ? true : (stryCov_9fa48("1682", "1683", "1684"), o.value === candidate))))) return candidate;
      }
    }
    return done ? stryMutAct_9fa48("1685") ? "" : (stryCov_9fa48("1685"), 'done') : stryMutAct_9fa48("1686") ? "" : (stryCov_9fa48("1686"), 'todo');
  }
}
function parseTodoItems(raw: unknown[]): TodoItem[] {
  if (stryMutAct_9fa48("1687")) {
    {}
  } else {
    stryCov_9fa48("1687");
    if (stryMutAct_9fa48("1690") ? false : stryMutAct_9fa48("1689") ? true : stryMutAct_9fa48("1688") ? Array.isArray(raw) : (stryCov_9fa48("1688", "1689", "1690"), !Array.isArray(raw))) return stryMutAct_9fa48("1691") ? ["Stryker was here"] : (stryCov_9fa48("1691"), []);
    return stryMutAct_9fa48("1692") ? raw.map((x, i) => {
      const done = !!x.done;
      const status = parseTodoStatus(x.status, done);
      // Keep the legacy `done` flag in lockstep with `status === 'done'`.
      // This matters for backups written by older builds being re-read:
      // if someone manually edits status to 'done' but leaves done:false,
      // we still want the row to behave as completed.
      const resolvedDone = status === 'done';
      const repeatRaw = x.remindRepeat;
      const repeats: ReminderRepeat[] = ['daily', 'weekly', 'monthly'];
      const remindRepeat = typeof repeatRaw === 'string' && repeats.includes(repeatRaw as ReminderRepeat) ? repeatRaw as ReminderRepeat : undefined;
      // Trim whitespace-only bodies down to undefined: a markdown editor
      // that's been opened-and-closed without any input would otherwise
      // leave an empty string in the file. Empty strings and undefined
      // mean the same thing in UI terms, so we normalise to one
      // representation here and keep the file lean for sync diffs.
      const rawBody = typeof x.body === 'string' ? x.body : undefined;
      const initialBody = rawBody && rawBody.trim() ? rawBody : undefined;
      const sourceNoteId = typeof x.sourceNoteId === 'string' && x.sourceNoteId.trim() ? x.sourceNoteId : undefined;
      // Multi-line title repair. Older builds (and any future paste-into-
      // title accident) could land a multi-line blob into the `title`
      // field with the actual body trapped inside it after newlines.
      // The closed-view CSS uses `white-space: pre-wrap` and a 2-line
      // clamp, which makes those rows look "broken" (the title gets
      // truncated mid-content with no body chip), and once expanded
      // the body lines render in title typography instead of through
      // MarkdownView. We split on the first newline here on every load
      // so the row matches the same shape as a freshly-created task:
      // single-line title + Markdown body. Any pre-existing body is
      // preserved by appending it after the rescued lines.
      const rawTitle = typeof x.title === 'string' ? x.title : '';
      let title = rawTitle;
      let body = initialBody;
      if (rawTitle.includes('\n')) {
        const titleLines = rawTitle.split('\n');
        let firstNonEmpty = -1;
        for (let li = 0; li < titleLines.length; li++) {
          if (titleLines[li].trim()) {
            firstNonEmpty = li;
            break;
          }
        }
        if (firstNonEmpty >= 0) {
          title = titleLines[firstNonEmpty].trim().replace(/^#+\s+/, '');
          const trailing = titleLines.slice(firstNonEmpty + 1).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');
          if (trailing) {
            body = initialBody && initialBody.trim() ? `${trailing}\n\n${initialBody}` : trailing;
          }
        }
      }
      return {
        id: typeof x.id === 'string' ? x.id : uuid(),
        groupId: typeof x.groupId === 'string' ? x.groupId : '',
        title,
        body,
        bodyFormat: x.bodyFormat === 'markdown' || x.bodyFormat === 'prosemirror' ? x.bodyFormat : undefined,
        bodyPlainText: typeof x.bodyPlainText === 'string' ? x.bodyPlainText : undefined,
        status,
        done: resolvedDone,
        doneAt: typeof x.doneAt === 'string' ? x.doneAt : undefined,
        dueAt: typeof x.dueAt === 'string' ? x.dueAt : undefined,
        priority: parsePriority(x.priority),
        remindAt: typeof x.remindAt === 'string' ? x.remindAt : undefined,
        remindRepeat,
        sortOrder: typeof x.sortOrder === 'number' ? x.sortOrder : i,
        sourceNoteId,
        createdAt: typeof x.createdAt === 'string' ? x.createdAt : nowIso(),
        updatedAt: typeof x.updatedAt === 'string' ? x.updatedAt : nowIso()
      };
    }) : (stryCov_9fa48("1692"), raw.filter(stryMutAct_9fa48("1693") ? () => undefined : (stryCov_9fa48("1693"), (x): x is Record<string, unknown> => stryMutAct_9fa48("1696") ? !!x || typeof x === 'object' : stryMutAct_9fa48("1695") ? false : stryMutAct_9fa48("1694") ? true : (stryCov_9fa48("1694", "1695", "1696"), (stryMutAct_9fa48("1697") ? !x : (stryCov_9fa48("1697"), !(stryMutAct_9fa48("1698") ? x : (stryCov_9fa48("1698"), !x)))) && (stryMutAct_9fa48("1700") ? typeof x !== 'object' : stryMutAct_9fa48("1699") ? true : (stryCov_9fa48("1699", "1700"), typeof x === (stryMutAct_9fa48("1701") ? "" : (stryCov_9fa48("1701"), 'object'))))))).map((x, i) => {
      if (stryMutAct_9fa48("1702")) {
        {}
      } else {
        stryCov_9fa48("1702");
        const done = stryMutAct_9fa48("1703") ? !x.done : (stryCov_9fa48("1703"), !(stryMutAct_9fa48("1704") ? x.done : (stryCov_9fa48("1704"), !x.done)));
        const status = parseTodoStatus(x.status, done);
        // Keep the legacy `done` flag in lockstep with `status === 'done'`.
        // This matters for backups written by older builds being re-read:
        // if someone manually edits status to 'done' but leaves done:false,
        // we still want the row to behave as completed.
        const resolvedDone = stryMutAct_9fa48("1707") ? status !== 'done' : stryMutAct_9fa48("1706") ? false : stryMutAct_9fa48("1705") ? true : (stryCov_9fa48("1705", "1706", "1707"), status === (stryMutAct_9fa48("1708") ? "" : (stryCov_9fa48("1708"), 'done')));
        const repeatRaw = x.remindRepeat;
        const repeats: ReminderRepeat[] = stryMutAct_9fa48("1709") ? [] : (stryCov_9fa48("1709"), [stryMutAct_9fa48("1710") ? "" : (stryCov_9fa48("1710"), 'daily'), stryMutAct_9fa48("1711") ? "" : (stryCov_9fa48("1711"), 'weekly'), stryMutAct_9fa48("1712") ? "" : (stryCov_9fa48("1712"), 'monthly')]);
        const remindRepeat = (stryMutAct_9fa48("1715") ? typeof repeatRaw === 'string' || repeats.includes(repeatRaw as ReminderRepeat) : stryMutAct_9fa48("1714") ? false : stryMutAct_9fa48("1713") ? true : (stryCov_9fa48("1713", "1714", "1715"), (stryMutAct_9fa48("1717") ? typeof repeatRaw !== 'string' : stryMutAct_9fa48("1716") ? true : (stryCov_9fa48("1716", "1717"), typeof repeatRaw === (stryMutAct_9fa48("1718") ? "" : (stryCov_9fa48("1718"), 'string')))) && repeats.includes(repeatRaw as ReminderRepeat))) ? repeatRaw as ReminderRepeat : undefined;
        // Trim whitespace-only bodies down to undefined: a markdown editor
        // that's been opened-and-closed without any input would otherwise
        // leave an empty string in the file. Empty strings and undefined
        // mean the same thing in UI terms, so we normalise to one
        // representation here and keep the file lean for sync diffs.
        const rawBody = (stryMutAct_9fa48("1721") ? typeof x.body !== 'string' : stryMutAct_9fa48("1720") ? false : stryMutAct_9fa48("1719") ? true : (stryCov_9fa48("1719", "1720", "1721"), typeof x.body === (stryMutAct_9fa48("1722") ? "" : (stryCov_9fa48("1722"), 'string')))) ? x.body : undefined;
        const initialBody = (stryMutAct_9fa48("1725") ? rawBody || rawBody.trim() : stryMutAct_9fa48("1724") ? false : stryMutAct_9fa48("1723") ? true : (stryCov_9fa48("1723", "1724", "1725"), rawBody && (stryMutAct_9fa48("1726") ? rawBody : (stryCov_9fa48("1726"), rawBody.trim())))) ? rawBody : undefined;
        const sourceNoteId = (stryMutAct_9fa48("1729") ? typeof x.sourceNoteId === 'string' || x.sourceNoteId.trim() : stryMutAct_9fa48("1728") ? false : stryMutAct_9fa48("1727") ? true : (stryCov_9fa48("1727", "1728", "1729"), (stryMutAct_9fa48("1731") ? typeof x.sourceNoteId !== 'string' : stryMutAct_9fa48("1730") ? true : (stryCov_9fa48("1730", "1731"), typeof x.sourceNoteId === (stryMutAct_9fa48("1732") ? "" : (stryCov_9fa48("1732"), 'string')))) && (stryMutAct_9fa48("1733") ? x.sourceNoteId : (stryCov_9fa48("1733"), x.sourceNoteId.trim())))) ? x.sourceNoteId : undefined;
        // Multi-line title repair. Older builds (and any future paste-into-
        // title accident) could land a multi-line blob into the `title`
        // field with the actual body trapped inside it after newlines.
        // The closed-view CSS uses `white-space: pre-wrap` and a 2-line
        // clamp, which makes those rows look "broken" (the title gets
        // truncated mid-content with no body chip), and once expanded
        // the body lines render in title typography instead of through
        // MarkdownView. We split on the first newline here on every load
        // so the row matches the same shape as a freshly-created task:
        // single-line title + Markdown body. Any pre-existing body is
        // preserved by appending it after the rescued lines.
        const rawTitle = (stryMutAct_9fa48("1736") ? typeof x.title !== 'string' : stryMutAct_9fa48("1735") ? false : stryMutAct_9fa48("1734") ? true : (stryCov_9fa48("1734", "1735", "1736"), typeof x.title === (stryMutAct_9fa48("1737") ? "" : (stryCov_9fa48("1737"), 'string')))) ? x.title : stryMutAct_9fa48("1738") ? "Stryker was here!" : (stryCov_9fa48("1738"), '');
        let title = rawTitle;
        let body = initialBody;
        if (stryMutAct_9fa48("1740") ? false : stryMutAct_9fa48("1739") ? true : (stryCov_9fa48("1739", "1740"), rawTitle.includes(stryMutAct_9fa48("1741") ? "" : (stryCov_9fa48("1741"), '\n')))) {
          if (stryMutAct_9fa48("1742")) {
            {}
          } else {
            stryCov_9fa48("1742");
            const titleLines = rawTitle.split(stryMutAct_9fa48("1743") ? "" : (stryCov_9fa48("1743"), '\n'));
            let firstNonEmpty = stryMutAct_9fa48("1744") ? +1 : (stryCov_9fa48("1744"), -1);
            for (let li = 0; stryMutAct_9fa48("1747") ? li >= titleLines.length : stryMutAct_9fa48("1746") ? li <= titleLines.length : stryMutAct_9fa48("1745") ? false : (stryCov_9fa48("1745", "1746", "1747"), li < titleLines.length); stryMutAct_9fa48("1748") ? li-- : (stryCov_9fa48("1748"), li++)) {
              if (stryMutAct_9fa48("1749")) {
                {}
              } else {
                stryCov_9fa48("1749");
                if (stryMutAct_9fa48("1752") ? titleLines[li] : stryMutAct_9fa48("1751") ? false : stryMutAct_9fa48("1750") ? true : (stryCov_9fa48("1750", "1751", "1752"), titleLines[li].trim())) {
                  if (stryMutAct_9fa48("1753")) {
                    {}
                  } else {
                    stryCov_9fa48("1753");
                    firstNonEmpty = li;
                    break;
                  }
                }
              }
            }
            if (stryMutAct_9fa48("1757") ? firstNonEmpty < 0 : stryMutAct_9fa48("1756") ? firstNonEmpty > 0 : stryMutAct_9fa48("1755") ? false : stryMutAct_9fa48("1754") ? true : (stryCov_9fa48("1754", "1755", "1756", "1757"), firstNonEmpty >= 0)) {
              if (stryMutAct_9fa48("1758")) {
                {}
              } else {
                stryCov_9fa48("1758");
                title = stryMutAct_9fa48("1759") ? titleLines[firstNonEmpty].replace(/^#+\s+/, '') : (stryCov_9fa48("1759"), titleLines[firstNonEmpty].trim().replace(stryMutAct_9fa48("1763") ? /^#+\S+/ : stryMutAct_9fa48("1762") ? /^#+\s/ : stryMutAct_9fa48("1761") ? /^#\s+/ : stryMutAct_9fa48("1760") ? /#+\s+/ : (stryCov_9fa48("1760", "1761", "1762", "1763"), /^#+\s+/), stryMutAct_9fa48("1764") ? "Stryker was here!" : (stryCov_9fa48("1764"), '')));
                const trailing = stryMutAct_9fa48("1765") ? titleLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '') : (stryCov_9fa48("1765"), titleLines.slice(stryMutAct_9fa48("1766") ? firstNonEmpty - 1 : (stryCov_9fa48("1766"), firstNonEmpty + 1)).join(stryMutAct_9fa48("1767") ? "" : (stryCov_9fa48("1767"), '\n')).replace(stryMutAct_9fa48("1769") ? /^\n/ : stryMutAct_9fa48("1768") ? /\n+/ : (stryCov_9fa48("1768", "1769"), /^\n+/), stryMutAct_9fa48("1770") ? "Stryker was here!" : (stryCov_9fa48("1770"), '')).replace(stryMutAct_9fa48("1772") ? /\n$/ : stryMutAct_9fa48("1771") ? /\n+/ : (stryCov_9fa48("1771", "1772"), /\n+$/), stryMutAct_9fa48("1773") ? "Stryker was here!" : (stryCov_9fa48("1773"), '')));
                if (stryMutAct_9fa48("1775") ? false : stryMutAct_9fa48("1774") ? true : (stryCov_9fa48("1774", "1775"), trailing)) {
                  if (stryMutAct_9fa48("1776")) {
                    {}
                  } else {
                    stryCov_9fa48("1776");
                    body = (stryMutAct_9fa48("1779") ? initialBody || initialBody.trim() : stryMutAct_9fa48("1778") ? false : stryMutAct_9fa48("1777") ? true : (stryCov_9fa48("1777", "1778", "1779"), initialBody && (stryMutAct_9fa48("1780") ? initialBody : (stryCov_9fa48("1780"), initialBody.trim())))) ? stryMutAct_9fa48("1781") ? `` : (stryCov_9fa48("1781"), `${trailing}\n\n${initialBody}`) : trailing;
                  }
                }
              }
            }
          }
        }
        return stryMutAct_9fa48("1782") ? {} : (stryCov_9fa48("1782"), {
          id: (stryMutAct_9fa48("1785") ? typeof x.id !== 'string' : stryMutAct_9fa48("1784") ? false : stryMutAct_9fa48("1783") ? true : (stryCov_9fa48("1783", "1784", "1785"), typeof x.id === (stryMutAct_9fa48("1786") ? "" : (stryCov_9fa48("1786"), 'string')))) ? x.id : uuid(),
          groupId: (stryMutAct_9fa48("1789") ? typeof x.groupId !== 'string' : stryMutAct_9fa48("1788") ? false : stryMutAct_9fa48("1787") ? true : (stryCov_9fa48("1787", "1788", "1789"), typeof x.groupId === (stryMutAct_9fa48("1790") ? "" : (stryCov_9fa48("1790"), 'string')))) ? x.groupId : stryMutAct_9fa48("1791") ? "Stryker was here!" : (stryCov_9fa48("1791"), ''),
          title,
          body,
          bodyFormat: (stryMutAct_9fa48("1794") ? x.bodyFormat === 'markdown' && x.bodyFormat === 'prosemirror' : stryMutAct_9fa48("1793") ? false : stryMutAct_9fa48("1792") ? true : (stryCov_9fa48("1792", "1793", "1794"), (stryMutAct_9fa48("1796") ? x.bodyFormat !== 'markdown' : stryMutAct_9fa48("1795") ? false : (stryCov_9fa48("1795", "1796"), x.bodyFormat === (stryMutAct_9fa48("1797") ? "" : (stryCov_9fa48("1797"), 'markdown')))) || (stryMutAct_9fa48("1799") ? x.bodyFormat !== 'prosemirror' : stryMutAct_9fa48("1798") ? false : (stryCov_9fa48("1798", "1799"), x.bodyFormat === (stryMutAct_9fa48("1800") ? "" : (stryCov_9fa48("1800"), 'prosemirror')))))) ? x.bodyFormat : undefined,
          bodyPlainText: (stryMutAct_9fa48("1803") ? typeof x.bodyPlainText !== 'string' : stryMutAct_9fa48("1802") ? false : stryMutAct_9fa48("1801") ? true : (stryCov_9fa48("1801", "1802", "1803"), typeof x.bodyPlainText === (stryMutAct_9fa48("1804") ? "" : (stryCov_9fa48("1804"), 'string')))) ? x.bodyPlainText : undefined,
          status,
          done: resolvedDone,
          doneAt: (stryMutAct_9fa48("1807") ? typeof x.doneAt !== 'string' : stryMutAct_9fa48("1806") ? false : stryMutAct_9fa48("1805") ? true : (stryCov_9fa48("1805", "1806", "1807"), typeof x.doneAt === (stryMutAct_9fa48("1808") ? "" : (stryCov_9fa48("1808"), 'string')))) ? x.doneAt : undefined,
          dueAt: (stryMutAct_9fa48("1811") ? typeof x.dueAt !== 'string' : stryMutAct_9fa48("1810") ? false : stryMutAct_9fa48("1809") ? true : (stryCov_9fa48("1809", "1810", "1811"), typeof x.dueAt === (stryMutAct_9fa48("1812") ? "" : (stryCov_9fa48("1812"), 'string')))) ? x.dueAt : undefined,
          priority: parsePriority(x.priority),
          remindAt: (stryMutAct_9fa48("1815") ? typeof x.remindAt !== 'string' : stryMutAct_9fa48("1814") ? false : stryMutAct_9fa48("1813") ? true : (stryCov_9fa48("1813", "1814", "1815"), typeof x.remindAt === (stryMutAct_9fa48("1816") ? "" : (stryCov_9fa48("1816"), 'string')))) ? x.remindAt : undefined,
          remindRepeat,
          sortOrder: (stryMutAct_9fa48("1819") ? typeof x.sortOrder !== 'number' : stryMutAct_9fa48("1818") ? false : stryMutAct_9fa48("1817") ? true : (stryCov_9fa48("1817", "1818", "1819"), typeof x.sortOrder === (stryMutAct_9fa48("1820") ? "" : (stryCov_9fa48("1820"), 'number')))) ? x.sortOrder : i,
          sourceNoteId,
          createdAt: (stryMutAct_9fa48("1823") ? typeof x.createdAt !== 'string' : stryMutAct_9fa48("1822") ? false : stryMutAct_9fa48("1821") ? true : (stryCov_9fa48("1821", "1822", "1823"), typeof x.createdAt === (stryMutAct_9fa48("1824") ? "" : (stryCov_9fa48("1824"), 'string')))) ? x.createdAt : nowIso(),
          updatedAt: (stryMutAct_9fa48("1827") ? typeof x.updatedAt !== 'string' : stryMutAct_9fa48("1826") ? false : stryMutAct_9fa48("1825") ? true : (stryCov_9fa48("1825", "1826", "1827"), typeof x.updatedAt === (stryMutAct_9fa48("1828") ? "" : (stryCov_9fa48("1828"), 'string')))) ? x.updatedAt : nowIso()
        });
      }
    }));
  }
}

/** v1 -> v2 migration: single implicit team, assign teamId to every person, __self -> __self__{team}. */
function migrateV1ToV2(o: Record<string, unknown>): AppData {
  if (stryMutAct_9fa48("1829")) {
    {}
  } else {
    stryCov_9fa48("1829");
    const t = nowIso();
    const teamId = uuid();
    const newSelfId = selfPersonIdForTeam(teamId);
    const rawPeople = Array.isArray(o.people) ? o.people : stryMutAct_9fa48("1830") ? ["Stryker was here"] : (stryCov_9fa48("1830"), []);
    const people: Person[] = stryMutAct_9fa48("1831") ? rawPeople.map(p => {
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
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : t
      };
    }) : (stryCov_9fa48("1831"), rawPeople.filter(stryMutAct_9fa48("1832") ? () => undefined : (stryCov_9fa48("1832"), (p): p is Record<string, unknown> => stryMutAct_9fa48("1835") ? !!p || typeof p === 'object' : stryMutAct_9fa48("1834") ? false : stryMutAct_9fa48("1833") ? true : (stryCov_9fa48("1833", "1834", "1835"), (stryMutAct_9fa48("1836") ? !p : (stryCov_9fa48("1836"), !(stryMutAct_9fa48("1837") ? p : (stryCov_9fa48("1837"), !p)))) && (stryMutAct_9fa48("1839") ? typeof p !== 'object' : stryMutAct_9fa48("1838") ? true : (stryCov_9fa48("1838", "1839"), typeof p === (stryMutAct_9fa48("1840") ? "" : (stryCov_9fa48("1840"), 'object'))))))).map(p => {
      if (stryMutAct_9fa48("1841")) {
        {}
      } else {
        stryCov_9fa48("1841");
        const oldId = (stryMutAct_9fa48("1844") ? typeof p.id !== 'string' : stryMutAct_9fa48("1843") ? false : stryMutAct_9fa48("1842") ? true : (stryCov_9fa48("1842", "1843", "1844"), typeof p.id === (stryMutAct_9fa48("1845") ? "" : (stryCov_9fa48("1845"), 'string')))) ? p.id : uuid();
        const id = (stryMutAct_9fa48("1848") ? oldId !== LEGACY_SELF_PERSON_ID : stryMutAct_9fa48("1847") ? false : stryMutAct_9fa48("1846") ? true : (stryCov_9fa48("1846", "1847", "1848"), oldId === LEGACY_SELF_PERSON_ID)) ? newSelfId : oldId;
        const isSelf = stryMutAct_9fa48("1851") ? oldId !== LEGACY_SELF_PERSON_ID : stryMutAct_9fa48("1850") ? false : stryMutAct_9fa48("1849") ? true : (stryCov_9fa48("1849", "1850", "1851"), oldId === LEGACY_SELF_PERSON_ID);
        return stryMutAct_9fa48("1852") ? {} : (stryCov_9fa48("1852"), {
          id,
          teamId,
          name: (stryMutAct_9fa48("1855") ? typeof p.name === 'string' || p.name.trim() : stryMutAct_9fa48("1854") ? false : stryMutAct_9fa48("1853") ? true : (stryCov_9fa48("1853", "1854", "1855"), (stryMutAct_9fa48("1857") ? typeof p.name !== 'string' : stryMutAct_9fa48("1856") ? true : (stryCov_9fa48("1856", "1857"), typeof p.name === (stryMutAct_9fa48("1858") ? "" : (stryCov_9fa48("1858"), 'string')))) && (stryMutAct_9fa48("1859") ? p.name : (stryCov_9fa48("1859"), p.name.trim())))) ? p.name : stryMutAct_9fa48("1860") ? "" : (stryCov_9fa48("1860"), 'Unnamed'),
          title: (stryMutAct_9fa48("1863") ? typeof p.title !== 'string' : stryMutAct_9fa48("1862") ? false : stryMutAct_9fa48("1861") ? true : (stryCov_9fa48("1861", "1862", "1863"), typeof p.title === (stryMutAct_9fa48("1864") ? "" : (stryCov_9fa48("1864"), 'string')))) ? p.title : undefined,
          isSelf,
          scratchpad: stryMutAct_9fa48("1865") ? "Stryker was here!" : (stryCov_9fa48("1865"), ''),
          createdAt: (stryMutAct_9fa48("1868") ? typeof p.createdAt !== 'string' : stryMutAct_9fa48("1867") ? false : stryMutAct_9fa48("1866") ? true : (stryCov_9fa48("1866", "1867", "1868"), typeof p.createdAt === (stryMutAct_9fa48("1869") ? "" : (stryCov_9fa48("1869"), 'string')))) ? p.createdAt : t
        });
      }
    }));
    if (stryMutAct_9fa48("1872") ? false : stryMutAct_9fa48("1871") ? true : stryMutAct_9fa48("1870") ? people.some(p => p.id === newSelfId) : (stryCov_9fa48("1870", "1871", "1872"), !(stryMutAct_9fa48("1873") ? people.every(p => p.id === newSelfId) : (stryCov_9fa48("1873"), people.some(stryMutAct_9fa48("1874") ? () => undefined : (stryCov_9fa48("1874"), p => stryMutAct_9fa48("1877") ? p.id !== newSelfId : stryMutAct_9fa48("1876") ? false : stryMutAct_9fa48("1875") ? true : (stryCov_9fa48("1875", "1876", "1877"), p.id === newSelfId))))))) {
      if (stryMutAct_9fa48("1878")) {
        {}
      } else {
        stryCov_9fa48("1878");
        people.unshift(stryMutAct_9fa48("1879") ? {} : (stryCov_9fa48("1879"), {
          id: newSelfId,
          teamId,
          name: stryMutAct_9fa48("1880") ? "" : (stryCov_9fa48("1880"), 'Me'),
          isSelf: stryMutAct_9fa48("1881") ? false : (stryCov_9fa48("1881"), true),
          scratchpad: stryMutAct_9fa48("1882") ? "Stryker was here!" : (stryCov_9fa48("1882"), ''),
          createdAt: t
        }));
      }
    }
    const rawItems = Array.isArray(o.items) ? o.items : stryMutAct_9fa48("1883") ? ["Stryker was here"] : (stryCov_9fa48("1883"), []);
    const items = parseItems(rawItems).map(stryMutAct_9fa48("1884") ? () => undefined : (stryCov_9fa48("1884"), it => stryMutAct_9fa48("1885") ? {} : (stryCov_9fa48("1885"), {
      ...it,
      personId: (stryMutAct_9fa48("1888") ? it.personId !== LEGACY_SELF_PERSON_ID : stryMutAct_9fa48("1887") ? false : stryMutAct_9fa48("1886") ? true : (stryCov_9fa48("1886", "1887", "1888"), it.personId === LEGACY_SELF_PERSON_ID)) ? newSelfId : it.personId
    })));
    const notified = Array.isArray(o.notifiedReminderIds) ? o.notifiedReminderIds : stryMutAct_9fa48("1889") ? ["Stryker was here"] : (stryCov_9fa48("1889"), []);
    return ensureProfile(ensureTeamsHaveLeader(ensureTeamsHaveSelf(stryMutAct_9fa48("1890") ? {} : (stryCov_9fa48("1890"), {
      version: DATA_VERSION,
      teams: stryMutAct_9fa48("1891") ? [] : (stryCov_9fa48("1891"), [stryMutAct_9fa48("1892") ? {} : (stryCov_9fa48("1892"), {
        id: teamId,
        name: stryMutAct_9fa48("1893") ? "" : (stryCov_9fa48("1893"), 'Default team'),
        createdAt: t,
        status: stryMutAct_9fa48("1894") ? "" : (stryCov_9fa48("1894"), 'active')
      })]),
      people,
      items,
      notifiedReminderIds: stryMutAct_9fa48("1895") ? [...notified] : (stryCov_9fa48("1895"), (stryMutAct_9fa48("1896") ? [] : (stryCov_9fa48("1896"), [...notified])).filter(stryMutAct_9fa48("1897") ? () => undefined : (stryCov_9fa48("1897"), (x): x is string => stryMutAct_9fa48("1900") ? typeof x !== 'string' : stryMutAct_9fa48("1899") ? false : stryMutAct_9fa48("1898") ? true : (stryCov_9fa48("1898", "1899", "1900"), typeof x === (stryMutAct_9fa48("1901") ? "" : (stryCov_9fa48("1901"), 'string')))))),
      lastTeamId: teamId,
      notes: stryMutAct_9fa48("1902") ? ["Stryker was here"] : (stryCov_9fa48("1902"), []),
      ...defaultTodoBundle()
    }))));
  }
}
function ensureTeamsHaveSelf(data: AppData): AppData {
  if (stryMutAct_9fa48("1903")) {
    {}
  } else {
    stryCov_9fa48("1903");
    const t = nowIso();
    let {
      teams,
      people
    } = data;
    const additions: Person[] = stryMutAct_9fa48("1904") ? ["Stryker was here"] : (stryCov_9fa48("1904"), []);
    for (const team of teams) {
      if (stryMutAct_9fa48("1905")) {
        {}
      } else {
        stryCov_9fa48("1905");
        const hasSelf = stryMutAct_9fa48("1906") ? people.every(p => p.teamId === team.id && isSelfPerson(p)) : (stryCov_9fa48("1906"), people.some(stryMutAct_9fa48("1907") ? () => undefined : (stryCov_9fa48("1907"), p => stryMutAct_9fa48("1910") ? p.teamId === team.id || isSelfPerson(p) : stryMutAct_9fa48("1909") ? false : stryMutAct_9fa48("1908") ? true : (stryCov_9fa48("1908", "1909", "1910"), (stryMutAct_9fa48("1912") ? p.teamId !== team.id : stryMutAct_9fa48("1911") ? true : (stryCov_9fa48("1911", "1912"), p.teamId === team.id)) && isSelfPerson(p)))));
        if (stryMutAct_9fa48("1915") ? false : stryMutAct_9fa48("1914") ? true : stryMutAct_9fa48("1913") ? hasSelf : (stryCov_9fa48("1913", "1914", "1915"), !hasSelf)) {
          if (stryMutAct_9fa48("1916")) {
            {}
          } else {
            stryCov_9fa48("1916");
            additions.push(stryMutAct_9fa48("1917") ? {} : (stryCov_9fa48("1917"), {
              id: selfPersonIdForTeam(team.id),
              teamId: team.id,
              name: stryMutAct_9fa48("1918") ? "" : (stryCov_9fa48("1918"), 'Me'),
              isSelf: stryMutAct_9fa48("1919") ? false : (stryCov_9fa48("1919"), true),
              scratchpad: stryMutAct_9fa48("1920") ? "Stryker was here!" : (stryCov_9fa48("1920"), ''),
              createdAt: t
            }));
          }
        }
      }
    }
    if (stryMutAct_9fa48("1922") ? false : stryMutAct_9fa48("1921") ? true : (stryCov_9fa48("1921", "1922"), additions.length)) {
      if (stryMutAct_9fa48("1923")) {
        {}
      } else {
        stryCov_9fa48("1923");
        people = stryMutAct_9fa48("1924") ? [] : (stryCov_9fa48("1924"), [...people, ...additions]);
      }
    }

    /** Attach orphaned people (missing teamId) to the first available team. */
    const missingTeam = stryMutAct_9fa48("1925") ? people : (stryCov_9fa48("1925"), people.filter(stryMutAct_9fa48("1926") ? () => undefined : (stryCov_9fa48("1926"), p => stryMutAct_9fa48("1929") ? !p.teamId && !teams.some(x => x.id === p.teamId) : stryMutAct_9fa48("1928") ? false : stryMutAct_9fa48("1927") ? true : (stryCov_9fa48("1927", "1928", "1929"), (stryMutAct_9fa48("1930") ? p.teamId : (stryCov_9fa48("1930"), !p.teamId)) || (stryMutAct_9fa48("1931") ? teams.some(x => x.id === p.teamId) : (stryCov_9fa48("1931"), !(stryMutAct_9fa48("1932") ? teams.every(x => x.id === p.teamId) : (stryCov_9fa48("1932"), teams.some(stryMutAct_9fa48("1933") ? () => undefined : (stryCov_9fa48("1933"), x => stryMutAct_9fa48("1936") ? x.id !== p.teamId : stryMutAct_9fa48("1935") ? false : stryMutAct_9fa48("1934") ? true : (stryCov_9fa48("1934", "1935", "1936"), x.id === p.teamId)))))))))));
    if (stryMutAct_9fa48("1938") ? false : stryMutAct_9fa48("1937") ? true : (stryCov_9fa48("1937", "1938"), missingTeam.length)) {
      if (stryMutAct_9fa48("1939")) {
        {}
      } else {
        stryCov_9fa48("1939");
        let fallbackTeamId = stryMutAct_9fa48("1940") ? teams[0].id : (stryCov_9fa48("1940"), teams[0]?.id);
        if (stryMutAct_9fa48("1943") ? false : stryMutAct_9fa48("1942") ? true : stryMutAct_9fa48("1941") ? fallbackTeamId : (stryCov_9fa48("1941", "1942", "1943"), !fallbackTeamId)) {
          if (stryMutAct_9fa48("1944")) {
            {}
          } else {
            stryCov_9fa48("1944");
            fallbackTeamId = uuid();
            teams = stryMutAct_9fa48("1945") ? [] : (stryCov_9fa48("1945"), [...teams, stryMutAct_9fa48("1946") ? {} : (stryCov_9fa48("1946"), {
              id: fallbackTeamId,
              name: stryMutAct_9fa48("1947") ? "" : (stryCov_9fa48("1947"), 'Team'),
              createdAt: t,
              status: 'active' as TeamStatus
            })]);
          }
        }
        people = people.map(stryMutAct_9fa48("1948") ? () => undefined : (stryCov_9fa48("1948"), p => (stryMutAct_9fa48("1951") ? !p.teamId && !teams.some(x => x.id === p.teamId) : stryMutAct_9fa48("1950") ? false : stryMutAct_9fa48("1949") ? true : (stryCov_9fa48("1949", "1950", "1951"), (stryMutAct_9fa48("1952") ? p.teamId : (stryCov_9fa48("1952"), !p.teamId)) || (stryMutAct_9fa48("1953") ? teams.some(x => x.id === p.teamId) : (stryCov_9fa48("1953"), !(stryMutAct_9fa48("1954") ? teams.every(x => x.id === p.teamId) : (stryCov_9fa48("1954"), teams.some(stryMutAct_9fa48("1955") ? () => undefined : (stryCov_9fa48("1955"), x => stryMutAct_9fa48("1958") ? x.id !== p.teamId : stryMutAct_9fa48("1957") ? false : stryMutAct_9fa48("1956") ? true : (stryCov_9fa48("1956", "1957", "1958"), x.id === p.teamId))))))))) ? stryMutAct_9fa48("1959") ? {} : (stryCov_9fa48("1959"), {
          ...p,
          teamId: fallbackTeamId!
        }) : p));
      }
    }
    return stryMutAct_9fa48("1960") ? {} : (stryCov_9fa48("1960"), {
      ...data,
      teams,
      people
    });
  }
}
function ensureTeamsHaveLeader(data: AppData): AppData {
  if (stryMutAct_9fa48("1961")) {
    {}
  } else {
    stryCov_9fa48("1961");
    const t = nowIso();
    let {
      teams,
      people
    } = data;
    const additions: Person[] = stryMutAct_9fa48("1962") ? ["Stryker was here"] : (stryCov_9fa48("1962"), []);
    for (const team of teams) {
      if (stryMutAct_9fa48("1963")) {
        {}
      } else {
        stryCov_9fa48("1963");
        const lid = leaderPersonIdForTeam(team.id);
        if (stryMutAct_9fa48("1966") ? false : stryMutAct_9fa48("1965") ? true : stryMutAct_9fa48("1964") ? people.some(p => p.id === lid) : (stryCov_9fa48("1964", "1965", "1966"), !(stryMutAct_9fa48("1967") ? people.every(p => p.id === lid) : (stryCov_9fa48("1967"), people.some(stryMutAct_9fa48("1968") ? () => undefined : (stryCov_9fa48("1968"), p => stryMutAct_9fa48("1971") ? p.id !== lid : stryMutAct_9fa48("1970") ? false : stryMutAct_9fa48("1969") ? true : (stryCov_9fa48("1969", "1970", "1971"), p.id === lid))))))) {
          if (stryMutAct_9fa48("1972")) {
            {}
          } else {
            stryCov_9fa48("1972");
            additions.push(stryMutAct_9fa48("1973") ? {} : (stryCov_9fa48("1973"), {
              id: lid,
              teamId: team.id,
              name: stryMutAct_9fa48("1974") ? "" : (stryCov_9fa48("1974"), 'My leader'),
              scratchpad: stryMutAct_9fa48("1975") ? "Stryker was here!" : (stryCov_9fa48("1975"), ''),
              createdAt: t
            }));
          }
        }
      }
    }
    if (stryMutAct_9fa48("1977") ? false : stryMutAct_9fa48("1976") ? true : (stryCov_9fa48("1976", "1977"), additions.length)) {
      if (stryMutAct_9fa48("1978")) {
        {}
      } else {
        stryCov_9fa48("1978");
        people = stryMutAct_9fa48("1979") ? [] : (stryCov_9fa48("1979"), [...people, ...additions]);
      }
    }
    return stryMutAct_9fa48("1980") ? {} : (stryCov_9fa48("1980"), {
      ...data,
      teams,
      people
    });
  }
}
function normalizeGoalItem(it: Item): Item {
  if (stryMutAct_9fa48("1981")) {
    {}
  } else {
    stryCov_9fa48("1981");
    if (stryMutAct_9fa48("1984") ? it.kind === 'goal' : stryMutAct_9fa48("1983") ? false : stryMutAct_9fa48("1982") ? true : (stryCov_9fa48("1982", "1983", "1984"), it.kind !== (stryMutAct_9fa48("1985") ? "" : (stryCov_9fa48("1985"), 'goal')))) {
      if (stryMutAct_9fa48("1986")) {
        {}
      } else {
        stryCov_9fa48("1986");
        const {
          goalStatus: _g,
          startAt: _s,
          ...rest
        } = it;
        void _g;
        void _s;
        return rest as Item;
      }
    }
    const allowed: GoalStatus[] = stryMutAct_9fa48("1987") ? [] : (stryCov_9fa48("1987"), [stryMutAct_9fa48("1988") ? "" : (stryCov_9fa48("1988"), 'planned'), stryMutAct_9fa48("1989") ? "" : (stryCov_9fa48("1989"), 'active'), stryMutAct_9fa48("1990") ? "" : (stryCov_9fa48("1990"), 'completed'), stryMutAct_9fa48("1991") ? "" : (stryCov_9fa48("1991"), 'cancelled')]);
    const goalStatus: GoalStatus = (stryMutAct_9fa48("1994") ? it.goalStatus || allowed.includes(it.goalStatus) : stryMutAct_9fa48("1993") ? false : stryMutAct_9fa48("1992") ? true : (stryCov_9fa48("1992", "1993", "1994"), it.goalStatus && allowed.includes(it.goalStatus))) ? it.goalStatus : it.done ? stryMutAct_9fa48("1995") ? "" : (stryCov_9fa48("1995"), 'completed') : stryMutAct_9fa48("1996") ? "" : (stryCov_9fa48("1996"), 'planned');
    const done = stryMutAct_9fa48("1999") ? goalStatus !== 'completed' : stryMutAct_9fa48("1998") ? false : stryMutAct_9fa48("1997") ? true : (stryCov_9fa48("1997", "1998", "1999"), goalStatus === (stryMutAct_9fa48("2000") ? "" : (stryCov_9fa48("2000"), 'completed')));
    return stryMutAct_9fa48("2001") ? {} : (stryCov_9fa48("2001"), {
      ...it,
      goalStatus,
      done,
      startAt: (stryMutAct_9fa48("2004") ? typeof it.startAt !== 'string' : stryMutAct_9fa48("2003") ? false : stryMutAct_9fa48("2002") ? true : (stryCov_9fa48("2002", "2003", "2004"), typeof it.startAt === (stryMutAct_9fa48("2005") ? "" : (stryCov_9fa48("2005"), 'string')))) ? it.startAt : undefined
    });
  }
}
function ensureTodoDomain(data: AppData): AppData {
  if (stryMutAct_9fa48("2006")) {
    {}
  } else {
    stryCov_9fa48("2006");
    let todoGroups = stryMutAct_9fa48("2007") ? [...(data.todoGroups ?? [])] : (stryCov_9fa48("2007"), (stryMutAct_9fa48("2008") ? [] : (stryCov_9fa48("2008"), [...(stryMutAct_9fa48("2009") ? data.todoGroups && [] : (stryCov_9fa48("2009"), data.todoGroups ?? (stryMutAct_9fa48("2010") ? ["Stryker was here"] : (stryCov_9fa48("2010"), []))))])).sort(stryMutAct_9fa48("2011") ? () => undefined : (stryCov_9fa48("2011"), (a, b) => stryMutAct_9fa48("2012") ? a.sortOrder + b.sortOrder : (stryCov_9fa48("2012"), a.sortOrder - b.sortOrder))));
    let todoItems = stryMutAct_9fa48("2013") ? [] : (stryCov_9fa48("2013"), [...(stryMutAct_9fa48("2014") ? data.todoItems && [] : (stryCov_9fa48("2014"), data.todoItems ?? (stryMutAct_9fa48("2015") ? ["Stryker was here"] : (stryCov_9fa48("2015"), []))))]);
    if (stryMutAct_9fa48("2018") ? todoGroups.length !== 0 : stryMutAct_9fa48("2017") ? false : stryMutAct_9fa48("2016") ? true : (stryCov_9fa48("2016", "2017", "2018"), todoGroups.length === 0)) {
      if (stryMutAct_9fa48("2019")) {
        {}
      } else {
        stryCov_9fa48("2019");
        const id = uuid();
        todoGroups = stryMutAct_9fa48("2020") ? [] : (stryCov_9fa48("2020"), [stryMutAct_9fa48("2021") ? {} : (stryCov_9fa48("2021"), {
          id,
          name: stryMutAct_9fa48("2022") ? "" : (stryCov_9fa48("2022"), 'Genel'),
          sortOrder: 0,
          createdAt: nowIso()
        })]);
      }
    }
    const firstId = todoGroups[0]!.id;
    todoItems = todoItems.map(stryMutAct_9fa48("2023") ? () => undefined : (stryCov_9fa48("2023"), x => stryMutAct_9fa48("2024") ? {} : (stryCov_9fa48("2024"), {
      ...x,
      groupId: (stryMutAct_9fa48("2025") ? todoGroups.every(g => g.id === x.groupId) : (stryCov_9fa48("2025"), todoGroups.some(stryMutAct_9fa48("2026") ? () => undefined : (stryCov_9fa48("2026"), g => stryMutAct_9fa48("2029") ? g.id !== x.groupId : stryMutAct_9fa48("2028") ? false : stryMutAct_9fa48("2027") ? true : (stryCov_9fa48("2027", "2028", "2029"), g.id === x.groupId))))) ? x.groupId : firstId
    })));
    return stryMutAct_9fa48("2030") ? {} : (stryCov_9fa48("2030"), {
      ...data,
      todoGroups,
      todoItems
    });
  }
}
function patchDataToV3(data: AppData): AppData {
  if (stryMutAct_9fa48("2031")) {
    {}
  } else {
    stryCov_9fa48("2031");
    let d: AppData = stryMutAct_9fa48("2032") ? {} : (stryCov_9fa48("2032"), {
      ...data,
      version: DATA_VERSION
    });
    d = ensureTodoDomain(d);
    d = stryMutAct_9fa48("2033") ? {} : (stryCov_9fa48("2033"), {
      ...d,
      items: d.items.map(normalizeGoalItem)
    });
    return d;
  }
}
export function normalizeData(raw: unknown): AppData {
  if (stryMutAct_9fa48("2034")) {
    {}
  } else {
    stryCov_9fa48("2034");
    const base = emptyData();
    if (stryMutAct_9fa48("2037") ? !raw && typeof raw !== 'object' : stryMutAct_9fa48("2036") ? false : stryMutAct_9fa48("2035") ? true : (stryCov_9fa48("2035", "2036", "2037"), (stryMutAct_9fa48("2038") ? raw : (stryCov_9fa48("2038"), !raw)) || (stryMutAct_9fa48("2040") ? typeof raw === 'object' : stryMutAct_9fa48("2039") ? false : (stryCov_9fa48("2039", "2040"), typeof raw !== (stryMutAct_9fa48("2041") ? "" : (stryCov_9fa48("2041"), 'object')))))) return base;
    const o = raw as Record<string, unknown>;
    const ver = (stryMutAct_9fa48("2044") ? typeof o.version !== 'number' : stryMutAct_9fa48("2043") ? false : stryMutAct_9fa48("2042") ? true : (stryCov_9fa48("2042", "2043", "2044"), typeof o.version === (stryMutAct_9fa48("2045") ? "" : (stryCov_9fa48("2045"), 'number')))) ? o.version : 1;
    if (stryMutAct_9fa48("2049") ? ver >= 2 : stryMutAct_9fa48("2048") ? ver <= 2 : stryMutAct_9fa48("2047") ? false : stryMutAct_9fa48("2046") ? true : (stryCov_9fa48("2046", "2047", "2048", "2049"), ver < 2)) {
      if (stryMutAct_9fa48("2050")) {
        {}
      } else {
        stryCov_9fa48("2050");
        return patchDataToV3(migrateV1ToV2(o));
      }
    }
    let teams = parseTeams(Array.isArray(o.teams) ? o.teams : stryMutAct_9fa48("2051") ? ["Stryker was here"] : (stryCov_9fa48("2051"), []));
    let people = parsePeople(Array.isArray(o.people) ? o.people : stryMutAct_9fa48("2052") ? ["Stryker was here"] : (stryCov_9fa48("2052"), []));
    const items = parseItems(Array.isArray(o.items) ? o.items : stryMutAct_9fa48("2053") ? ["Stryker was here"] : (stryCov_9fa48("2053"), []));
    const notified = stryMutAct_9fa48("2054") ? [...(Array.isArray(o.notifiedReminderIds) ? o.notifiedReminderIds : [])] : (stryCov_9fa48("2054"), (stryMutAct_9fa48("2055") ? [] : (stryCov_9fa48("2055"), [...(Array.isArray(o.notifiedReminderIds) ? o.notifiedReminderIds : stryMutAct_9fa48("2056") ? ["Stryker was here"] : (stryCov_9fa48("2056"), []))])).filter(stryMutAct_9fa48("2057") ? () => undefined : (stryCov_9fa48("2057"), (x): x is string => stryMutAct_9fa48("2060") ? typeof x !== 'string' : stryMutAct_9fa48("2059") ? false : stryMutAct_9fa48("2058") ? true : (stryCov_9fa48("2058", "2059", "2060"), typeof x === (stryMutAct_9fa48("2061") ? "" : (stryCov_9fa48("2061"), 'string'))))));
    const lastTeamId = (stryMutAct_9fa48("2064") ? typeof o.lastTeamId !== 'string' : stryMutAct_9fa48("2063") ? false : stryMutAct_9fa48("2062") ? true : (stryCov_9fa48("2062", "2063", "2064"), typeof o.lastTeamId === (stryMutAct_9fa48("2065") ? "" : (stryCov_9fa48("2065"), 'string')))) ? o.lastTeamId : undefined;
    const todoGroups = parseTodoGroups(Array.isArray(o.todoGroups) ? o.todoGroups : stryMutAct_9fa48("2066") ? ["Stryker was here"] : (stryCov_9fa48("2066"), []));
    const todoItems = parseTodoItems(Array.isArray(o.todoItems) ? o.todoItems : stryMutAct_9fa48("2067") ? ["Stryker was here"] : (stryCov_9fa48("2067"), []));
    if (stryMutAct_9fa48("2070") ? teams.length !== 0 : stryMutAct_9fa48("2069") ? false : stryMutAct_9fa48("2068") ? true : (stryCov_9fa48("2068", "2069", "2070"), teams.length === 0)) {
      if (stryMutAct_9fa48("2071")) {
        {}
      } else {
        stryCov_9fa48("2071");
        const tid = uuid();
        teams = stryMutAct_9fa48("2072") ? [] : (stryCov_9fa48("2072"), [stryMutAct_9fa48("2073") ? {} : (stryCov_9fa48("2073"), {
          id: tid,
          name: stryMutAct_9fa48("2074") ? "" : (stryCov_9fa48("2074"), 'My first team'),
          createdAt: nowIso(),
          status: stryMutAct_9fa48("2075") ? "" : (stryCov_9fa48("2075"), 'active')
        })]);
        people = people.map(stryMutAct_9fa48("2076") ? () => undefined : (stryCov_9fa48("2076"), p => stryMutAct_9fa48("2077") ? {} : (stryCov_9fa48("2077"), {
          ...p,
          teamId: stryMutAct_9fa48("2080") ? p.teamId && tid : stryMutAct_9fa48("2079") ? false : stryMutAct_9fa48("2078") ? true : (stryCov_9fa48("2078", "2079", "2080"), p.teamId || tid)
        })));
      }
    }
    const notes = parseNotes(o.notes);
    let notesLock = parseNotesLock(o.notesLock);
    const utilityDocument = parseUtilityDocument(o.utilityDocument);
    const utilityStructuredText = parseUtilityStructuredText(o.utilityStructuredText);

    // Defensive: orphan notesLock cleanup. The lock object can survive on
    // disk after the user clears the notes passphrase if the corresponding
    // write was interrupted, or after a sync pull from a device that had
    // already unlocked everything. Keeping the orphan lock around makes
    // the NotesPage prompt the user for a passphrase that no longer
    // unlocks anything, which is indistinguishable from "my data is gone"
    // for a non-technical user. The lock is a UI affordance, not the
    // source of truth, so dropping it here is safe — the only thing it
    // could potentially still decrypt is gone (locked=true notes have
    // already been stripped if their cipher was malformed).
    const hasAnyLockedNote = stryMutAct_9fa48("2081") ? notes.every(n => n.locked) : (stryCov_9fa48("2081"), notes.some(stryMutAct_9fa48("2082") ? () => undefined : (stryCov_9fa48("2082"), n => n.locked)));
    if (stryMutAct_9fa48("2085") ? notesLock || !hasAnyLockedNote : stryMutAct_9fa48("2084") ? false : stryMutAct_9fa48("2083") ? true : (stryCov_9fa48("2083", "2084", "2085"), notesLock && (stryMutAct_9fa48("2086") ? hasAnyLockedNote : (stryCov_9fa48("2086"), !hasAnyLockedNote)))) {
      if (stryMutAct_9fa48("2087")) {
        {}
      } else {
        stryCov_9fa48("2087");
        notesLock = undefined;
      }
    }
    let data: AppData = stryMutAct_9fa48("2088") ? {} : (stryCov_9fa48("2088"), {
      version: DATA_VERSION,
      teams,
      people,
      items,
      notifiedReminderIds: notified,
      lastTeamId: (stryMutAct_9fa48("2091") ? lastTeamId || teams.some(x => x.id === lastTeamId) : stryMutAct_9fa48("2090") ? false : stryMutAct_9fa48("2089") ? true : (stryCov_9fa48("2089", "2090", "2091"), lastTeamId && (stryMutAct_9fa48("2092") ? teams.every(x => x.id === lastTeamId) : (stryCov_9fa48("2092"), teams.some(stryMutAct_9fa48("2093") ? () => undefined : (stryCov_9fa48("2093"), x => stryMutAct_9fa48("2096") ? x.id !== lastTeamId : stryMutAct_9fa48("2095") ? false : stryMutAct_9fa48("2094") ? true : (stryCov_9fa48("2094", "2095", "2096"), x.id === lastTeamId))))))) ? lastTeamId : stryMutAct_9fa48("2097") ? teams[0].id : (stryCov_9fa48("2097"), teams[0]?.id),
      todoGroups,
      todoItems,
      aiSettings: parseAISettings(o.aiSettings),
      notes,
      notesLock,
      utilityDocument,
      utilityStructuredText,
      profile: parseProfile(o.profile)
    });
    data = ensureTeamsHaveSelf(data);
    data = ensureTeamsHaveLeader(data);
    data = ensureProfile(data);
    return patchDataToV3(data);
  }
}

/**
 * A coarse fingerprint of the user's workspace: how many of each kind of
 * "user-visible thing" the file contains. This is the canonical shape we
 * compare across boots / backups when we suspect data may have been lost.
 *
 * Why this design:
 *   - The numbers themselves are non-sensitive (they don't leak any
 *     content), which means we can safely persist them in localStorage as
 *     a last-known-good marker. localStorage is process-local to the
 *     renderer; it survives Electron restarts but not OS reinstalls.
 *   - "Total" is a single integer that's easy to compare with `<` for
 *     "did we suddenly shrink?". Per-kind values let the integrity banner
 *     tell the user "5 todos before, 0 now" instead of an opaque
 *     "data may be missing".
 *   - We deliberately do NOT include archived/visible distinctions here:
 *     if a user archives every todo group, the total stays the same and
 *     we don't fire a false-positive data-loss banner. The
 *     "all groups archived → empty UI" failure mode is handled by the
 *     TodosPage empty-state hint instead.
 */
export type DataShape = {
  teams: number;
  people: number;
  items: number;
  todoGroups: number;
  todoItems: number;
  notes: number;
  total: number;
};
export function shapeOfData(d: AppData | null | undefined): DataShape {
  if (stryMutAct_9fa48("2098")) {
    {}
  } else {
    stryCov_9fa48("2098");
    if (stryMutAct_9fa48("2101") ? false : stryMutAct_9fa48("2100") ? true : stryMutAct_9fa48("2099") ? d : (stryCov_9fa48("2099", "2100", "2101"), !d)) return stryMutAct_9fa48("2102") ? {} : (stryCov_9fa48("2102"), {
      teams: 0,
      people: 0,
      items: 0,
      todoGroups: 0,
      todoItems: 0,
      notes: 0,
      total: 0
    });
    const teams = d.teams.length;
    // Self / leader auto-people don't count — they're an empty-workspace
    // convenience scaffold, not actual user content. We strip them so the
    // shape matches what a user would call "my data".
    const people = stryMutAct_9fa48("2103") ? d.people.length : (stryCov_9fa48("2103"), d.people.filter(stryMutAct_9fa48("2104") ? () => undefined : (stryCov_9fa48("2104"), p => stryMutAct_9fa48("2107") ? p.id.indexOf('__self__') !== 0 || p.id.indexOf('__leader__') !== 0 : stryMutAct_9fa48("2106") ? false : stryMutAct_9fa48("2105") ? true : (stryCov_9fa48("2105", "2106", "2107"), (stryMutAct_9fa48("2109") ? p.id.indexOf('__self__') === 0 : stryMutAct_9fa48("2108") ? true : (stryCov_9fa48("2108", "2109"), p.id.indexOf(stryMutAct_9fa48("2110") ? "" : (stryCov_9fa48("2110"), '__self__')) !== 0)) && (stryMutAct_9fa48("2112") ? p.id.indexOf('__leader__') === 0 : stryMutAct_9fa48("2111") ? true : (stryCov_9fa48("2111", "2112"), p.id.indexOf(stryMutAct_9fa48("2113") ? "" : (stryCov_9fa48("2113"), '__leader__')) !== 0))))).length);
    const items = d.items.length;
    const todoGroups = d.todoGroups.length;
    const todoItems = d.todoItems.length;
    const notes = d.notes.length;
    const total = stryMutAct_9fa48("2114") ? teams - 1 /* default "My first team" */ + people + items + todoGroups + todoItems - notes : (stryCov_9fa48("2114"), (stryMutAct_9fa48("2115") ? teams - 1 /* default "My first team" */ + people + items + todoGroups - todoItems : (stryCov_9fa48("2115"), (stryMutAct_9fa48("2116") ? teams - 1 /* default "My first team" */ + people + items - todoGroups : (stryCov_9fa48("2116"), (stryMutAct_9fa48("2117") ? teams - 1 /* default "My first team" */ + people - items : (stryCov_9fa48("2117"), (stryMutAct_9fa48("2118") ? teams - 1 /* default "My first team" */ - people : (stryCov_9fa48("2118"), (stryMutAct_9fa48("2119") ? teams + 1 /* default "My first team" */ : (stryCov_9fa48("2119"), teams - 1) /* default "My first team" */) + people)) + items)) + todoGroups)) + todoItems)) + notes);
    return stryMutAct_9fa48("2120") ? {} : (stryCov_9fa48("2120"), {
      teams,
      people,
      items,
      todoGroups,
      todoItems,
      notes,
      total: stryMutAct_9fa48("2121") ? Math.min(0, total) : (stryCov_9fa48("2121"), Math.max(0, total))
    });
  }
}
function parseAISettings(raw: unknown): AISettings | undefined {
  if (stryMutAct_9fa48("2122")) {
    {}
  } else {
    stryCov_9fa48("2122");
    if (stryMutAct_9fa48("2125") ? !raw && typeof raw !== 'object' : stryMutAct_9fa48("2124") ? false : stryMutAct_9fa48("2123") ? true : (stryCov_9fa48("2123", "2124", "2125"), (stryMutAct_9fa48("2126") ? raw : (stryCov_9fa48("2126"), !raw)) || (stryMutAct_9fa48("2128") ? typeof raw === 'object' : stryMutAct_9fa48("2127") ? false : (stryCov_9fa48("2127", "2128"), typeof raw !== (stryMutAct_9fa48("2129") ? "" : (stryCov_9fa48("2129"), 'object')))))) return undefined;
    const o = raw as Record<string, unknown>;
    const providers: AIProvider[] = stryMutAct_9fa48("2130") ? [] : (stryCov_9fa48("2130"), [stryMutAct_9fa48("2131") ? "" : (stryCov_9fa48("2131"), 'anthropic'), stryMutAct_9fa48("2132") ? "" : (stryCov_9fa48("2132"), 'openai'), stryMutAct_9fa48("2133") ? "" : (stryCov_9fa48("2133"), 'gemini')]);
    const provider = (stryMutAct_9fa48("2136") ? typeof o.provider === 'string' || providers.includes(o.provider as AIProvider) : stryMutAct_9fa48("2135") ? false : stryMutAct_9fa48("2134") ? true : (stryCov_9fa48("2134", "2135", "2136"), (stryMutAct_9fa48("2138") ? typeof o.provider !== 'string' : stryMutAct_9fa48("2137") ? true : (stryCov_9fa48("2137", "2138"), typeof o.provider === (stryMutAct_9fa48("2139") ? "" : (stryCov_9fa48("2139"), 'string')))) && providers.includes(o.provider as AIProvider))) ? o.provider as AIProvider : undefined;
    const apiKey = (stryMutAct_9fa48("2142") ? typeof o.apiKey === 'string' || o.apiKey.trim() : stryMutAct_9fa48("2141") ? false : stryMutAct_9fa48("2140") ? true : (stryCov_9fa48("2140", "2141", "2142"), (stryMutAct_9fa48("2144") ? typeof o.apiKey !== 'string' : stryMutAct_9fa48("2143") ? true : (stryCov_9fa48("2143", "2144"), typeof o.apiKey === (stryMutAct_9fa48("2145") ? "" : (stryCov_9fa48("2145"), 'string')))) && (stryMutAct_9fa48("2146") ? o.apiKey : (stryCov_9fa48("2146"), o.apiKey.trim())))) ? stryMutAct_9fa48("2147") ? o.apiKey : (stryCov_9fa48("2147"), o.apiKey.trim()) : undefined;
    const model = (stryMutAct_9fa48("2150") ? typeof o.model === 'string' || o.model.trim() : stryMutAct_9fa48("2149") ? false : stryMutAct_9fa48("2148") ? true : (stryCov_9fa48("2148", "2149", "2150"), (stryMutAct_9fa48("2152") ? typeof o.model !== 'string' : stryMutAct_9fa48("2151") ? true : (stryCov_9fa48("2151", "2152"), typeof o.model === (stryMutAct_9fa48("2153") ? "" : (stryCov_9fa48("2153"), 'string')))) && (stryMutAct_9fa48("2154") ? o.model : (stryCov_9fa48("2154"), o.model.trim())))) ? stryMutAct_9fa48("2155") ? o.model : (stryCov_9fa48("2155"), o.model.trim()) : undefined;
    const systemPrompt = (stryMutAct_9fa48("2158") ? typeof o.systemPrompt !== 'string' : stryMutAct_9fa48("2157") ? false : stryMutAct_9fa48("2156") ? true : (stryCov_9fa48("2156", "2157", "2158"), typeof o.systemPrompt === (stryMutAct_9fa48("2159") ? "" : (stryCov_9fa48("2159"), 'string')))) ? o.systemPrompt : undefined;
    const extractionGuidance = (stryMutAct_9fa48("2162") ? typeof o.extractionGuidance !== 'string' : stryMutAct_9fa48("2161") ? false : stryMutAct_9fa48("2160") ? true : (stryCov_9fa48("2160", "2161", "2162"), typeof o.extractionGuidance === (stryMutAct_9fa48("2163") ? "" : (stryCov_9fa48("2163"), 'string')))) ? o.extractionGuidance : undefined;
    if (stryMutAct_9fa48("2166") ? !provider && !apiKey && !model && !systemPrompt || !extractionGuidance : stryMutAct_9fa48("2165") ? false : stryMutAct_9fa48("2164") ? true : (stryCov_9fa48("2164", "2165", "2166"), (stryMutAct_9fa48("2168") ? !provider && !apiKey && !model || !systemPrompt : stryMutAct_9fa48("2167") ? true : (stryCov_9fa48("2167", "2168"), (stryMutAct_9fa48("2170") ? !provider && !apiKey || !model : stryMutAct_9fa48("2169") ? true : (stryCov_9fa48("2169", "2170"), (stryMutAct_9fa48("2172") ? !provider || !apiKey : stryMutAct_9fa48("2171") ? true : (stryCov_9fa48("2171", "2172"), (stryMutAct_9fa48("2173") ? provider : (stryCov_9fa48("2173"), !provider)) && (stryMutAct_9fa48("2174") ? apiKey : (stryCov_9fa48("2174"), !apiKey)))) && (stryMutAct_9fa48("2175") ? model : (stryCov_9fa48("2175"), !model)))) && (stryMutAct_9fa48("2176") ? systemPrompt : (stryCov_9fa48("2176"), !systemPrompt)))) && (stryMutAct_9fa48("2177") ? extractionGuidance : (stryCov_9fa48("2177"), !extractionGuidance)))) return undefined;
    return stryMutAct_9fa48("2178") ? {} : (stryCov_9fa48("2178"), {
      provider,
      apiKey,
      model,
      systemPrompt,
      extractionGuidance
    });
  }
}
function parseNotes(raw: unknown): Note[] {
  if (stryMutAct_9fa48("2179")) {
    {}
  } else {
    stryCov_9fa48("2179");
    if (stryMutAct_9fa48("2182") ? false : stryMutAct_9fa48("2181") ? true : stryMutAct_9fa48("2180") ? Array.isArray(raw) : (stryCov_9fa48("2180", "2181", "2182"), !Array.isArray(raw))) return stryMutAct_9fa48("2183") ? ["Stryker was here"] : (stryCov_9fa48("2183"), []);
    const out: Note[] = stryMutAct_9fa48("2184") ? ["Stryker was here"] : (stryCov_9fa48("2184"), []);
    for (const n of raw) {
      if (stryMutAct_9fa48("2185")) {
        {}
      } else {
        stryCov_9fa48("2185");
        if (stryMutAct_9fa48("2188") ? !n && typeof n !== 'object' : stryMutAct_9fa48("2187") ? false : stryMutAct_9fa48("2186") ? true : (stryCov_9fa48("2186", "2187", "2188"), (stryMutAct_9fa48("2189") ? n : (stryCov_9fa48("2189"), !n)) || (stryMutAct_9fa48("2191") ? typeof n === 'object' : stryMutAct_9fa48("2190") ? false : (stryCov_9fa48("2190", "2191"), typeof n !== (stryMutAct_9fa48("2192") ? "" : (stryCov_9fa48("2192"), 'object')))))) continue;
        const o = n as Record<string, unknown>;
        if (stryMutAct_9fa48("2195") ? typeof o.id !== 'string' && !o.id : stryMutAct_9fa48("2194") ? false : stryMutAct_9fa48("2193") ? true : (stryCov_9fa48("2193", "2194", "2195"), (stryMutAct_9fa48("2197") ? typeof o.id === 'string' : stryMutAct_9fa48("2196") ? false : (stryCov_9fa48("2196", "2197"), typeof o.id !== (stryMutAct_9fa48("2198") ? "" : (stryCov_9fa48("2198"), 'string')))) || (stryMutAct_9fa48("2199") ? o.id : (stryCov_9fa48("2199"), !o.id)))) continue;
        const locked = stryMutAct_9fa48("2200") ? !o.locked : (stryCov_9fa48("2200"), !(stryMutAct_9fa48("2201") ? o.locked : (stryCov_9fa48("2201"), !o.locked)));
        const cipher = (stryMutAct_9fa48("2204") ? locked && o.cipher || typeof o.cipher === 'object' : stryMutAct_9fa48("2203") ? false : stryMutAct_9fa48("2202") ? true : (stryCov_9fa48("2202", "2203", "2204"), (stryMutAct_9fa48("2206") ? locked || o.cipher : stryMutAct_9fa48("2205") ? true : (stryCov_9fa48("2205", "2206"), locked && o.cipher)) && (stryMutAct_9fa48("2208") ? typeof o.cipher !== 'object' : stryMutAct_9fa48("2207") ? true : (stryCov_9fa48("2207", "2208"), typeof o.cipher === (stryMutAct_9fa48("2209") ? "" : (stryCov_9fa48("2209"), 'object')))))) ? (() => {
          if (stryMutAct_9fa48("2210")) {
            {}
          } else {
            stryCov_9fa48("2210");
            const c = o.cipher as Record<string, unknown>;
            if (stryMutAct_9fa48("2213") ? typeof c.ivB64 === 'string' || typeof c.cipherB64 === 'string' : stryMutAct_9fa48("2212") ? false : stryMutAct_9fa48("2211") ? true : (stryCov_9fa48("2211", "2212", "2213"), (stryMutAct_9fa48("2215") ? typeof c.ivB64 !== 'string' : stryMutAct_9fa48("2214") ? true : (stryCov_9fa48("2214", "2215"), typeof c.ivB64 === (stryMutAct_9fa48("2216") ? "" : (stryCov_9fa48("2216"), 'string')))) && (stryMutAct_9fa48("2218") ? typeof c.cipherB64 !== 'string' : stryMutAct_9fa48("2217") ? true : (stryCov_9fa48("2217", "2218"), typeof c.cipherB64 === (stryMutAct_9fa48("2219") ? "" : (stryCov_9fa48("2219"), 'string')))))) {
              if (stryMutAct_9fa48("2220")) {
                {}
              } else {
                stryCov_9fa48("2220");
                return stryMutAct_9fa48("2221") ? {} : (stryCov_9fa48("2221"), {
                  ivB64: c.ivB64,
                  cipherB64: c.cipherB64
                });
              }
            }
            return undefined;
          }
        })() : undefined;
        out.push(stryMutAct_9fa48("2222") ? {} : (stryCov_9fa48("2222"), {
          id: o.id,
          title: (stryMutAct_9fa48("2225") ? typeof o.title !== 'string' : stryMutAct_9fa48("2224") ? false : stryMutAct_9fa48("2223") ? true : (stryCov_9fa48("2223", "2224", "2225"), typeof o.title === (stryMutAct_9fa48("2226") ? "" : (stryCov_9fa48("2226"), 'string')))) ? o.title : stryMutAct_9fa48("2227") ? "Stryker was here!" : (stryCov_9fa48("2227"), ''),
          body: (stryMutAct_9fa48("2230") ? typeof o.body === 'string' || !locked : stryMutAct_9fa48("2229") ? false : stryMutAct_9fa48("2228") ? true : (stryCov_9fa48("2228", "2229", "2230"), (stryMutAct_9fa48("2232") ? typeof o.body !== 'string' : stryMutAct_9fa48("2231") ? true : (stryCov_9fa48("2231", "2232"), typeof o.body === (stryMutAct_9fa48("2233") ? "" : (stryCov_9fa48("2233"), 'string')))) && (stryMutAct_9fa48("2234") ? locked : (stryCov_9fa48("2234"), !locked)))) ? o.body : stryMutAct_9fa48("2235") ? "Stryker was here!" : (stryCov_9fa48("2235"), ''),
          bodyFormat: (stryMutAct_9fa48("2238") ? o.bodyFormat === 'markdown' && o.bodyFormat === 'prosemirror' : stryMutAct_9fa48("2237") ? false : stryMutAct_9fa48("2236") ? true : (stryCov_9fa48("2236", "2237", "2238"), (stryMutAct_9fa48("2240") ? o.bodyFormat !== 'markdown' : stryMutAct_9fa48("2239") ? false : (stryCov_9fa48("2239", "2240"), o.bodyFormat === (stryMutAct_9fa48("2241") ? "" : (stryCov_9fa48("2241"), 'markdown')))) || (stryMutAct_9fa48("2243") ? o.bodyFormat !== 'prosemirror' : stryMutAct_9fa48("2242") ? false : (stryCov_9fa48("2242", "2243"), o.bodyFormat === (stryMutAct_9fa48("2244") ? "" : (stryCov_9fa48("2244"), 'prosemirror')))))) ? o.bodyFormat : undefined,
          bodyPlainText: (stryMutAct_9fa48("2247") ? !locked || typeof o.bodyPlainText === 'string' : stryMutAct_9fa48("2246") ? false : stryMutAct_9fa48("2245") ? true : (stryCov_9fa48("2245", "2246", "2247"), (stryMutAct_9fa48("2248") ? locked : (stryCov_9fa48("2248"), !locked)) && (stryMutAct_9fa48("2250") ? typeof o.bodyPlainText !== 'string' : stryMutAct_9fa48("2249") ? true : (stryCov_9fa48("2249", "2250"), typeof o.bodyPlainText === (stryMutAct_9fa48("2251") ? "" : (stryCov_9fa48("2251"), 'string')))))) ? o.bodyPlainText : undefined,
          locked,
          cipher,
          pinned: stryMutAct_9fa48("2252") ? !o.pinned : (stryCov_9fa48("2252"), !(stryMutAct_9fa48("2253") ? o.pinned : (stryCov_9fa48("2253"), !o.pinned))),
          sortOrder: (stryMutAct_9fa48("2256") ? typeof o.sortOrder !== 'number' : stryMutAct_9fa48("2255") ? false : stryMutAct_9fa48("2254") ? true : (stryCov_9fa48("2254", "2255", "2256"), typeof o.sortOrder === (stryMutAct_9fa48("2257") ? "" : (stryCov_9fa48("2257"), 'number')))) ? o.sortOrder : undefined,
          lastOpenedAt: (stryMutAct_9fa48("2260") ? typeof o.lastOpenedAt !== 'string' : stryMutAct_9fa48("2259") ? false : stryMutAct_9fa48("2258") ? true : (stryCov_9fa48("2258", "2259", "2260"), typeof o.lastOpenedAt === (stryMutAct_9fa48("2261") ? "" : (stryCov_9fa48("2261"), 'string')))) ? o.lastOpenedAt : undefined,
          createdAt: (stryMutAct_9fa48("2264") ? typeof o.createdAt !== 'string' : stryMutAct_9fa48("2263") ? false : stryMutAct_9fa48("2262") ? true : (stryCov_9fa48("2262", "2263", "2264"), typeof o.createdAt === (stryMutAct_9fa48("2265") ? "" : (stryCov_9fa48("2265"), 'string')))) ? o.createdAt : nowIso(),
          updatedAt: (stryMutAct_9fa48("2268") ? typeof o.updatedAt !== 'string' : stryMutAct_9fa48("2267") ? false : stryMutAct_9fa48("2266") ? true : (stryCov_9fa48("2266", "2267", "2268"), typeof o.updatedAt === (stryMutAct_9fa48("2269") ? "" : (stryCov_9fa48("2269"), 'string')))) ? o.updatedAt : nowIso()
        }));
      }
    }
    return out;
  }
}
function parseUtilityDocument(raw: unknown): UtilityDocument | undefined {
  if (stryMutAct_9fa48("2270")) {
    {}
  } else {
    stryCov_9fa48("2270");
    if (stryMutAct_9fa48("2273") ? !raw && typeof raw !== 'object' : stryMutAct_9fa48("2272") ? false : stryMutAct_9fa48("2271") ? true : (stryCov_9fa48("2271", "2272", "2273"), (stryMutAct_9fa48("2274") ? raw : (stryCov_9fa48("2274"), !raw)) || (stryMutAct_9fa48("2276") ? typeof raw === 'object' : stryMutAct_9fa48("2275") ? false : (stryCov_9fa48("2275", "2276"), typeof raw !== (stryMutAct_9fa48("2277") ? "" : (stryCov_9fa48("2277"), 'object')))))) return undefined;
    const o = raw as Record<string, unknown>;
    if (stryMutAct_9fa48("2280") ? typeof o.body === 'string' : stryMutAct_9fa48("2279") ? false : stryMutAct_9fa48("2278") ? true : (stryCov_9fa48("2278", "2279", "2280"), typeof o.body !== (stryMutAct_9fa48("2281") ? "" : (stryCov_9fa48("2281"), 'string')))) return undefined;
    return stryMutAct_9fa48("2282") ? {} : (stryCov_9fa48("2282"), {
      body: o.body,
      bodyFormat: (stryMutAct_9fa48("2285") ? o.bodyFormat === 'markdown' && o.bodyFormat === 'prosemirror' : stryMutAct_9fa48("2284") ? false : stryMutAct_9fa48("2283") ? true : (stryCov_9fa48("2283", "2284", "2285"), (stryMutAct_9fa48("2287") ? o.bodyFormat !== 'markdown' : stryMutAct_9fa48("2286") ? false : (stryCov_9fa48("2286", "2287"), o.bodyFormat === (stryMutAct_9fa48("2288") ? "" : (stryCov_9fa48("2288"), 'markdown')))) || (stryMutAct_9fa48("2290") ? o.bodyFormat !== 'prosemirror' : stryMutAct_9fa48("2289") ? false : (stryCov_9fa48("2289", "2290"), o.bodyFormat === (stryMutAct_9fa48("2291") ? "" : (stryCov_9fa48("2291"), 'prosemirror')))))) ? o.bodyFormat : undefined,
      bodyPlainText: (stryMutAct_9fa48("2294") ? typeof o.bodyPlainText !== 'string' : stryMutAct_9fa48("2293") ? false : stryMutAct_9fa48("2292") ? true : (stryCov_9fa48("2292", "2293", "2294"), typeof o.bodyPlainText === (stryMutAct_9fa48("2295") ? "" : (stryCov_9fa48("2295"), 'string')))) ? o.bodyPlainText : undefined,
      updatedAt: (stryMutAct_9fa48("2298") ? typeof o.updatedAt !== 'string' : stryMutAct_9fa48("2297") ? false : stryMutAct_9fa48("2296") ? true : (stryCov_9fa48("2296", "2297", "2298"), typeof o.updatedAt === (stryMutAct_9fa48("2299") ? "" : (stryCov_9fa48("2299"), 'string')))) ? o.updatedAt : nowIso()
    });
  }
}
function parseUtilityStructuredText(raw: unknown): UtilityStructuredText | undefined {
  if (stryMutAct_9fa48("2300")) {
    {}
  } else {
    stryCov_9fa48("2300");
    if (stryMutAct_9fa48("2303") ? !raw && typeof raw !== 'object' : stryMutAct_9fa48("2302") ? false : stryMutAct_9fa48("2301") ? true : (stryCov_9fa48("2301", "2302", "2303"), (stryMutAct_9fa48("2304") ? raw : (stryCov_9fa48("2304"), !raw)) || (stryMutAct_9fa48("2306") ? typeof raw === 'object' : stryMutAct_9fa48("2305") ? false : (stryCov_9fa48("2305", "2306"), typeof raw !== (stryMutAct_9fa48("2307") ? "" : (stryCov_9fa48("2307"), 'object')))))) return undefined;
    const o = raw as Record<string, unknown>;
    if (stryMutAct_9fa48("2310") ? typeof o.content === 'string' : stryMutAct_9fa48("2309") ? false : stryMutAct_9fa48("2308") ? true : (stryCov_9fa48("2308", "2309", "2310"), typeof o.content !== (stryMutAct_9fa48("2311") ? "" : (stryCov_9fa48("2311"), 'string')))) return undefined;
    return stryMutAct_9fa48("2312") ? {} : (stryCov_9fa48("2312"), {
      content: o.content,
      diffContent: (stryMutAct_9fa48("2315") ? typeof o.diffContent !== 'string' : stryMutAct_9fa48("2314") ? false : stryMutAct_9fa48("2313") ? true : (stryCov_9fa48("2313", "2314", "2315"), typeof o.diffContent === (stryMutAct_9fa48("2316") ? "" : (stryCov_9fa48("2316"), 'string')))) ? o.diffContent : undefined,
      language: (stryMutAct_9fa48("2319") ? o.language !== 'yaml' : stryMutAct_9fa48("2318") ? false : stryMutAct_9fa48("2317") ? true : (stryCov_9fa48("2317", "2318", "2319"), o.language === (stryMutAct_9fa48("2320") ? "" : (stryCov_9fa48("2320"), 'yaml')))) ? stryMutAct_9fa48("2321") ? "" : (stryCov_9fa48("2321"), 'yaml') : stryMutAct_9fa48("2322") ? "" : (stryCov_9fa48("2322"), 'json'),
      updatedAt: (stryMutAct_9fa48("2325") ? typeof o.updatedAt !== 'string' : stryMutAct_9fa48("2324") ? false : stryMutAct_9fa48("2323") ? true : (stryCov_9fa48("2323", "2324", "2325"), typeof o.updatedAt === (stryMutAct_9fa48("2326") ? "" : (stryCov_9fa48("2326"), 'string')))) ? o.updatedAt : nowIso()
    });
  }
}
function parseNotesLock(raw: unknown): NotesLock | undefined {
  if (stryMutAct_9fa48("2327")) {
    {}
  } else {
    stryCov_9fa48("2327");
    if (stryMutAct_9fa48("2330") ? !raw && typeof raw !== 'object' : stryMutAct_9fa48("2329") ? false : stryMutAct_9fa48("2328") ? true : (stryCov_9fa48("2328", "2329", "2330"), (stryMutAct_9fa48("2331") ? raw : (stryCov_9fa48("2331"), !raw)) || (stryMutAct_9fa48("2333") ? typeof raw === 'object' : stryMutAct_9fa48("2332") ? false : (stryCov_9fa48("2332", "2333"), typeof raw !== (stryMutAct_9fa48("2334") ? "" : (stryCov_9fa48("2334"), 'object')))))) return undefined;
    const o = raw as Record<string, unknown>;
    if (stryMutAct_9fa48("2337") ? (typeof o.saltB64 !== 'string' || typeof o.verifierIvB64 !== 'string') && typeof o.verifierCipherB64 !== 'string' : stryMutAct_9fa48("2336") ? false : stryMutAct_9fa48("2335") ? true : (stryCov_9fa48("2335", "2336", "2337"), (stryMutAct_9fa48("2339") ? typeof o.saltB64 !== 'string' && typeof o.verifierIvB64 !== 'string' : stryMutAct_9fa48("2338") ? false : (stryCov_9fa48("2338", "2339"), (stryMutAct_9fa48("2341") ? typeof o.saltB64 === 'string' : stryMutAct_9fa48("2340") ? false : (stryCov_9fa48("2340", "2341"), typeof o.saltB64 !== (stryMutAct_9fa48("2342") ? "" : (stryCov_9fa48("2342"), 'string')))) || (stryMutAct_9fa48("2344") ? typeof o.verifierIvB64 === 'string' : stryMutAct_9fa48("2343") ? false : (stryCov_9fa48("2343", "2344"), typeof o.verifierIvB64 !== (stryMutAct_9fa48("2345") ? "" : (stryCov_9fa48("2345"), 'string')))))) || (stryMutAct_9fa48("2347") ? typeof o.verifierCipherB64 === 'string' : stryMutAct_9fa48("2346") ? false : (stryCov_9fa48("2346", "2347"), typeof o.verifierCipherB64 !== (stryMutAct_9fa48("2348") ? "" : (stryCov_9fa48("2348"), 'string')))))) {
      if (stryMutAct_9fa48("2349")) {
        {}
      } else {
        stryCov_9fa48("2349");
        return undefined;
      }
    }
    let recovery: NotesLock['recovery'] | undefined;
    if (stryMutAct_9fa48("2352") ? o.recovery || typeof o.recovery === 'object' : stryMutAct_9fa48("2351") ? false : stryMutAct_9fa48("2350") ? true : (stryCov_9fa48("2350", "2351", "2352"), o.recovery && (stryMutAct_9fa48("2354") ? typeof o.recovery !== 'object' : stryMutAct_9fa48("2353") ? true : (stryCov_9fa48("2353", "2354"), typeof o.recovery === (stryMutAct_9fa48("2355") ? "" : (stryCov_9fa48("2355"), 'object')))))) {
      if (stryMutAct_9fa48("2356")) {
        {}
      } else {
        stryCov_9fa48("2356");
        const r = o.recovery as Record<string, unknown>;
        if (stryMutAct_9fa48("2359") ? typeof r.saltB64 === 'string' && typeof r.ivB64 === 'string' || typeof r.cipherB64 === 'string' : stryMutAct_9fa48("2358") ? false : stryMutAct_9fa48("2357") ? true : (stryCov_9fa48("2357", "2358", "2359"), (stryMutAct_9fa48("2361") ? typeof r.saltB64 === 'string' || typeof r.ivB64 === 'string' : stryMutAct_9fa48("2360") ? true : (stryCov_9fa48("2360", "2361"), (stryMutAct_9fa48("2363") ? typeof r.saltB64 !== 'string' : stryMutAct_9fa48("2362") ? true : (stryCov_9fa48("2362", "2363"), typeof r.saltB64 === (stryMutAct_9fa48("2364") ? "" : (stryCov_9fa48("2364"), 'string')))) && (stryMutAct_9fa48("2366") ? typeof r.ivB64 !== 'string' : stryMutAct_9fa48("2365") ? true : (stryCov_9fa48("2365", "2366"), typeof r.ivB64 === (stryMutAct_9fa48("2367") ? "" : (stryCov_9fa48("2367"), 'string')))))) && (stryMutAct_9fa48("2369") ? typeof r.cipherB64 !== 'string' : stryMutAct_9fa48("2368") ? true : (stryCov_9fa48("2368", "2369"), typeof r.cipherB64 === (stryMutAct_9fa48("2370") ? "" : (stryCov_9fa48("2370"), 'string')))))) {
          if (stryMutAct_9fa48("2371")) {
            {}
          } else {
            stryCov_9fa48("2371");
            recovery = stryMutAct_9fa48("2372") ? {} : (stryCov_9fa48("2372"), {
              saltB64: r.saltB64,
              ivB64: r.ivB64,
              cipherB64: r.cipherB64
            });
          }
        }
      }
    }
    return stryMutAct_9fa48("2373") ? {} : (stryCov_9fa48("2373"), {
      saltB64: o.saltB64,
      verifierIvB64: o.verifierIvB64,
      verifierCipherB64: o.verifierCipherB64,
      ...(recovery ? stryMutAct_9fa48("2374") ? {} : (stryCov_9fa48("2374"), {
        recovery
      }) : {})
    });
  }
}

/**
 * Parse the workspace `profile` object from on-disk JSON.
 *
 * This MUST run inside `normalizeData` — without it, every launch would
 * call `ensureProfile` on an object that never copied `o.profile` off the
 * wire, so `displayName` (and avatar, job title, etc.) would silently
 * reset to the scaffold defaults even though the file on disk still
 * contained the user's edits. That was the "Profile'da kaydettim, restart
 * sonrası Me'ye döndü / sağ üst eski isim" bug.
 */
function parseProfile(raw: unknown): UserProfile | undefined {
  if (stryMutAct_9fa48("2375")) {
    {}
  } else {
    stryCov_9fa48("2375");
    if (stryMutAct_9fa48("2378") ? !raw && typeof raw !== 'object' : stryMutAct_9fa48("2377") ? false : stryMutAct_9fa48("2376") ? true : (stryCov_9fa48("2376", "2377", "2378"), (stryMutAct_9fa48("2379") ? raw : (stryCov_9fa48("2379"), !raw)) || (stryMutAct_9fa48("2381") ? typeof raw === 'object' : stryMutAct_9fa48("2380") ? false : (stryCov_9fa48("2380", "2381"), typeof raw !== (stryMutAct_9fa48("2382") ? "" : (stryCov_9fa48("2382"), 'object')))))) return undefined;
    const o = raw as Record<string, unknown>;
    const fav = Array.isArray(o.favoriteTeamIds) ? stryMutAct_9fa48("2383") ? o.favoriteTeamIds : (stryCov_9fa48("2383"), o.favoriteTeamIds.filter(stryMutAct_9fa48("2384") ? () => undefined : (stryCov_9fa48("2384"), (x): x is string => stryMutAct_9fa48("2387") ? typeof x !== 'string' : stryMutAct_9fa48("2386") ? false : stryMutAct_9fa48("2385") ? true : (stryCov_9fa48("2385", "2386", "2387"), typeof x === (stryMutAct_9fa48("2388") ? "" : (stryCov_9fa48("2388"), 'string')))))) : stryMutAct_9fa48("2389") ? ["Stryker was here"] : (stryCov_9fa48("2389"), []);
    const avatar = (stryMutAct_9fa48("2392") ? typeof o.avatarDataUrl === 'string' || o.avatarDataUrl.startsWith('data:') : stryMutAct_9fa48("2391") ? false : stryMutAct_9fa48("2390") ? true : (stryCov_9fa48("2390", "2391", "2392"), (stryMutAct_9fa48("2394") ? typeof o.avatarDataUrl !== 'string' : stryMutAct_9fa48("2393") ? true : (stryCov_9fa48("2393", "2394"), typeof o.avatarDataUrl === (stryMutAct_9fa48("2395") ? "" : (stryCov_9fa48("2395"), 'string')))) && (stryMutAct_9fa48("2396") ? o.avatarDataUrl.endsWith('data:') : (stryCov_9fa48("2396"), o.avatarDataUrl.startsWith(stryMutAct_9fa48("2397") ? "" : (stryCov_9fa48("2397"), 'data:')))))) ? o.avatarDataUrl : undefined;
    return stryMutAct_9fa48("2398") ? {} : (stryCov_9fa48("2398"), {
      displayName: (stryMutAct_9fa48("2401") ? typeof o.displayName === 'string' || o.displayName.trim() : stryMutAct_9fa48("2400") ? false : stryMutAct_9fa48("2399") ? true : (stryCov_9fa48("2399", "2400", "2401"), (stryMutAct_9fa48("2403") ? typeof o.displayName !== 'string' : stryMutAct_9fa48("2402") ? true : (stryCov_9fa48("2402", "2403"), typeof o.displayName === (stryMutAct_9fa48("2404") ? "" : (stryCov_9fa48("2404"), 'string')))) && (stryMutAct_9fa48("2405") ? o.displayName : (stryCov_9fa48("2405"), o.displayName.trim())))) ? stryMutAct_9fa48("2406") ? o.displayName : (stryCov_9fa48("2406"), o.displayName.trim()) : stryMutAct_9fa48("2407") ? "" : (stryCov_9fa48("2407"), 'Me'),
      favoriteTeamIds: fav,
      jobTitle: (stryMutAct_9fa48("2410") ? typeof o.jobTitle === 'string' || o.jobTitle.trim() : stryMutAct_9fa48("2409") ? false : stryMutAct_9fa48("2408") ? true : (stryCov_9fa48("2408", "2409", "2410"), (stryMutAct_9fa48("2412") ? typeof o.jobTitle !== 'string' : stryMutAct_9fa48("2411") ? true : (stryCov_9fa48("2411", "2412"), typeof o.jobTitle === (stryMutAct_9fa48("2413") ? "" : (stryCov_9fa48("2413"), 'string')))) && (stryMutAct_9fa48("2414") ? o.jobTitle : (stryCov_9fa48("2414"), o.jobTitle.trim())))) ? stryMutAct_9fa48("2415") ? o.jobTitle : (stryCov_9fa48("2415"), o.jobTitle.trim()) : undefined,
      department: (stryMutAct_9fa48("2418") ? typeof o.department === 'string' || o.department.trim() : stryMutAct_9fa48("2417") ? false : stryMutAct_9fa48("2416") ? true : (stryCov_9fa48("2416", "2417", "2418"), (stryMutAct_9fa48("2420") ? typeof o.department !== 'string' : stryMutAct_9fa48("2419") ? true : (stryCov_9fa48("2419", "2420"), typeof o.department === (stryMutAct_9fa48("2421") ? "" : (stryCov_9fa48("2421"), 'string')))) && (stryMutAct_9fa48("2422") ? o.department : (stryCov_9fa48("2422"), o.department.trim())))) ? stryMutAct_9fa48("2423") ? o.department : (stryCov_9fa48("2423"), o.department.trim()) : undefined,
      phone: (stryMutAct_9fa48("2426") ? typeof o.phone === 'string' || o.phone.trim() : stryMutAct_9fa48("2425") ? false : stryMutAct_9fa48("2424") ? true : (stryCov_9fa48("2424", "2425", "2426"), (stryMutAct_9fa48("2428") ? typeof o.phone !== 'string' : stryMutAct_9fa48("2427") ? true : (stryCov_9fa48("2427", "2428"), typeof o.phone === (stryMutAct_9fa48("2429") ? "" : (stryCov_9fa48("2429"), 'string')))) && (stryMutAct_9fa48("2430") ? o.phone : (stryCov_9fa48("2430"), o.phone.trim())))) ? stryMutAct_9fa48("2431") ? o.phone : (stryCov_9fa48("2431"), o.phone.trim()) : undefined,
      bio: (stryMutAct_9fa48("2434") ? typeof o.bio === 'string' || o.bio.trim() : stryMutAct_9fa48("2433") ? false : stryMutAct_9fa48("2432") ? true : (stryCov_9fa48("2432", "2433", "2434"), (stryMutAct_9fa48("2436") ? typeof o.bio !== 'string' : stryMutAct_9fa48("2435") ? true : (stryCov_9fa48("2435", "2436"), typeof o.bio === (stryMutAct_9fa48("2437") ? "" : (stryCov_9fa48("2437"), 'string')))) && (stryMutAct_9fa48("2438") ? o.bio : (stryCov_9fa48("2438"), o.bio.trim())))) ? stryMutAct_9fa48("2439") ? o.bio : (stryCov_9fa48("2439"), o.bio.trim()) : undefined,
      avatarDataUrl: avatar
    });
  }
}
function ensureProfile(data: AppData): AppData {
  if (stryMutAct_9fa48("2440")) {
    {}
  } else {
    stryCov_9fa48("2440");
    const raw = stryMutAct_9fa48("2441") ? data.profile && {
      displayName: 'Me',
      favoriteTeamIds: []
    } : (stryCov_9fa48("2441"), data.profile ?? (stryMutAct_9fa48("2442") ? {} : (stryCov_9fa48("2442"), {
      displayName: stryMutAct_9fa48("2443") ? "" : (stryCov_9fa48("2443"), 'Me'),
      favoriteTeamIds: stryMutAct_9fa48("2444") ? ["Stryker was here"] : (stryCov_9fa48("2444"), [])
    })));
    const fav = stryMutAct_9fa48("2445") ? raw.favoriteTeamIds ?? [] : (stryCov_9fa48("2445"), (stryMutAct_9fa48("2446") ? raw.favoriteTeamIds && [] : (stryCov_9fa48("2446"), raw.favoriteTeamIds ?? (stryMutAct_9fa48("2447") ? ["Stryker was here"] : (stryCov_9fa48("2447"), [])))).filter(stryMutAct_9fa48("2448") ? () => undefined : (stryCov_9fa48("2448"), id => stryMutAct_9fa48("2449") ? data.teams.every(t => t.id === id) : (stryCov_9fa48("2449"), data.teams.some(stryMutAct_9fa48("2450") ? () => undefined : (stryCov_9fa48("2450"), t => stryMutAct_9fa48("2453") ? t.id !== id : stryMutAct_9fa48("2452") ? false : stryMutAct_9fa48("2451") ? true : (stryCov_9fa48("2451", "2452", "2453"), t.id === id)))))));
    const teams = data.teams.map(stryMutAct_9fa48("2454") ? () => undefined : (stryCov_9fa48("2454"), t => stryMutAct_9fa48("2455") ? {} : (stryCov_9fa48("2455"), {
      ...t,
      status: (stryMutAct_9fa48("2458") ? t.status || ['active', 'paused', 'archived'].includes(t.status) : stryMutAct_9fa48("2457") ? false : stryMutAct_9fa48("2456") ? true : (stryCov_9fa48("2456", "2457", "2458"), t.status && (stryMutAct_9fa48("2459") ? [] : (stryCov_9fa48("2459"), [stryMutAct_9fa48("2460") ? "" : (stryCov_9fa48("2460"), 'active'), stryMutAct_9fa48("2461") ? "" : (stryCov_9fa48("2461"), 'paused'), stryMutAct_9fa48("2462") ? "" : (stryCov_9fa48("2462"), 'archived')])).includes(t.status))) ? t.status : stryMutAct_9fa48("2463") ? "" : (stryCov_9fa48("2463"), 'active')
    })));
    const avatar = (stryMutAct_9fa48("2466") ? typeof raw.avatarDataUrl === 'string' || raw.avatarDataUrl.startsWith('data:') : stryMutAct_9fa48("2465") ? false : stryMutAct_9fa48("2464") ? true : (stryCov_9fa48("2464", "2465", "2466"), (stryMutAct_9fa48("2468") ? typeof raw.avatarDataUrl !== 'string' : stryMutAct_9fa48("2467") ? true : (stryCov_9fa48("2467", "2468"), typeof raw.avatarDataUrl === (stryMutAct_9fa48("2469") ? "" : (stryCov_9fa48("2469"), 'string')))) && (stryMutAct_9fa48("2470") ? raw.avatarDataUrl.endsWith('data:') : (stryCov_9fa48("2470"), raw.avatarDataUrl.startsWith(stryMutAct_9fa48("2471") ? "" : (stryCov_9fa48("2471"), 'data:')))))) ? raw.avatarDataUrl : undefined;
    const profile: UserProfile = stryMutAct_9fa48("2472") ? {} : (stryCov_9fa48("2472"), {
      displayName: (stryMutAct_9fa48("2474") ? raw.displayName.trim() : stryMutAct_9fa48("2473") ? raw.displayName : (stryCov_9fa48("2473", "2474"), raw.displayName?.trim())) ? stryMutAct_9fa48("2475") ? raw.displayName : (stryCov_9fa48("2475"), raw.displayName.trim()) : stryMutAct_9fa48("2476") ? "" : (stryCov_9fa48("2476"), 'Me'),
      favoriteTeamIds: fav,
      jobTitle: stryMutAct_9fa48("2479") ? raw.jobTitle?.trim() && undefined : stryMutAct_9fa48("2478") ? false : stryMutAct_9fa48("2477") ? true : (stryCov_9fa48("2477", "2478", "2479"), (stryMutAct_9fa48("2481") ? raw.jobTitle.trim() : stryMutAct_9fa48("2480") ? raw.jobTitle : (stryCov_9fa48("2480", "2481"), raw.jobTitle?.trim())) || undefined),
      department: stryMutAct_9fa48("2484") ? raw.department?.trim() && undefined : stryMutAct_9fa48("2483") ? false : stryMutAct_9fa48("2482") ? true : (stryCov_9fa48("2482", "2483", "2484"), (stryMutAct_9fa48("2486") ? raw.department.trim() : stryMutAct_9fa48("2485") ? raw.department : (stryCov_9fa48("2485", "2486"), raw.department?.trim())) || undefined),
      phone: stryMutAct_9fa48("2489") ? raw.phone?.trim() && undefined : stryMutAct_9fa48("2488") ? false : stryMutAct_9fa48("2487") ? true : (stryCov_9fa48("2487", "2488", "2489"), (stryMutAct_9fa48("2491") ? raw.phone.trim() : stryMutAct_9fa48("2490") ? raw.phone : (stryCov_9fa48("2490", "2491"), raw.phone?.trim())) || undefined),
      bio: stryMutAct_9fa48("2494") ? raw.bio?.trim() && undefined : stryMutAct_9fa48("2493") ? false : stryMutAct_9fa48("2492") ? true : (stryCov_9fa48("2492", "2493", "2494"), (stryMutAct_9fa48("2496") ? raw.bio.trim() : stryMutAct_9fa48("2495") ? raw.bio : (stryCov_9fa48("2495", "2496"), raw.bio?.trim())) || undefined),
      avatarDataUrl: avatar
    });
    return stryMutAct_9fa48("2497") ? {} : (stryCov_9fa48("2497"), {
      ...data,
      profile,
      teams
    });
  }
}