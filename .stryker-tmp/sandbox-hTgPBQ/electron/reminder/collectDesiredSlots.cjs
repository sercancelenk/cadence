// @ts-nocheck
const { reminderNotifyKey, isReminderSlotNotified } = require('./reminderNotify.cjs');

/** @typedef {import('./types.cjs').ReminderSlot} ReminderSlot */

function isTodoOpen(status) {
  return status !== 'done' && status !== 'cancelled';
}

/**
 * Build pending reminder slots from workspace data.
 *
 * @param {Record<string, unknown>} appData
 * @param {number} [nowMs]
 * @param {{ includePastDue?: boolean }} [opts]
 * @returns {ReminderSlot[]}
 */
function collectDesiredSlots(appData, nowMs = Date.now(), opts = {}) {
  const includePastDue = opts.includePastDue === true;
  const notified = Array.isArray(appData.notifiedReminderIds) ? appData.notifiedReminderIds : [];
  const people = Array.isArray(appData.people) ? appData.people : [];
  const teams = Array.isArray(appData.teams) ? appData.teams : [];
  const todoGroups = Array.isArray(appData.todoGroups) ? appData.todoGroups : [];
  const peopleById = new Map(people.map((p) => [p.id, p]));
  const teamsById = new Map(teams.map((t) => [t.id, t]));
  const todoGroupsById = new Map(todoGroups.map((g) => [g.id, g]));
  /** @type {ReminderSlot[]} */
  const out = [];

  const consider = (
    itemId,
    source,
    remindAt,
    skip,
    title,
    body,
    repeat,
  ) => {
    if (skip || typeof remindAt !== 'string' || !remindAt) return;
    const t = Date.parse(remindAt);
    if (Number.isNaN(t)) return;
    if (!includePastDue && t <= nowMs) return;
    if (includePastDue && t > nowMs) return;
    if (isReminderSlotNotified(notified, itemId, remindAt)) return;
    out.push({
      slotKey: reminderNotifyKey(itemId, remindAt),
      itemId,
      source,
      remindAt,
      title,
      body,
      repeat,
    });
  };

  for (const t of Array.isArray(appData.todoItems) ? appData.todoItems : []) {
    if (!t || typeof t.id !== 'string') continue;
    const group = todoGroupsById.get(t.groupId);
    const label = (group && group.name) || 'Todo';
    consider(
      t.id,
      'todo',
      t.remindAt,
      !isTodoOpen(t.status),
      'Todo reminder',
      `${label}: ${(typeof t.title === 'string' && t.title.trim()) || '(untitled)'}`,
      t.remindRepeat,
    );
  }

  for (const it of Array.isArray(appData.items) ? appData.items : []) {
    if (!it || typeof it.id !== 'string') continue;
    const person = peopleById.get(it.personId);
    const team = person ? teamsById.get(person.teamId) : undefined;
    const label = [team?.name, person?.name].filter(Boolean).join(' · ') || 'Item';
    const kindTitle = it.kind === 'task' ? 'Task reminder' : 'Reminder';
    consider(
      it.id,
      'team-item',
      it.remindAt,
      it.done === true,
      kindTitle,
      `${label}: ${(typeof it.title === 'string' && it.title.trim()) || '(untitled)'}`,
      it.remindRepeat,
    );
  }

  out.sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt));
  return out;
}

/**
 * Future-only slots for OS / in-process scheduling.
 * @param {Record<string, unknown>} appData
 * @param {number} [nowMs]
 */
function collectFutureSlots(appData, nowMs = Date.now()) {
  const notified = Array.isArray(appData.notifiedReminderIds) ? appData.notifiedReminderIds : [];
  const all = collectDesiredSlots(appData, nowMs, { includePastDue: false });
  // collectDesiredSlots already filters past; re-export for clarity
  return all.filter((s) => !isReminderSlotNotified(notified, s.itemId, s.remindAt));
}

/**
 * Past-due slots not yet notified (launch catch-up).
 * @param {Record<string, unknown>} appData
 * @param {number} [nowMs]
 */
function collectPastDueSlots(appData, nowMs = Date.now()) {
  return collectDesiredSlots(appData, nowMs, { includePastDue: true });
}

module.exports = {
  isTodoOpen,
  collectDesiredSlots,
  collectFutureSlots,
  collectPastDueSlots,
};
