// @ts-nocheck
import type { AppData } from '../../core/model';
import { isReminderSlotNotified, reminderNotifyKey } from '../reminderNotify';
import type { ReminderSlot } from './types';

function isTodoOpen(status: string | undefined): boolean {
  return status !== 'done' && status !== 'cancelled';
}

/** Future reminder slots for OS / service-worker scheduling. */
export function collectFutureReminderSlots(appData: AppData, nowMs = Date.now()): ReminderSlot[] {
  const notified = appData.notifiedReminderIds;
  const peopleById = new Map(appData.people.map((p) => [p.id, p]));
  const teamsById = new Map(appData.teams.map((t) => [t.id, t]));
  const todoGroupsById = new Map(appData.todoGroups.map((g) => [g.id, g]));
  const out: ReminderSlot[] = [];

  for (const t of appData.todoItems) {
    if (!t.remindAt || !isTodoOpen(t.status)) continue;
    const ts = Date.parse(t.remindAt);
    if (Number.isNaN(ts) || ts <= nowMs) continue;
    if (isReminderSlotNotified(notified, t.id, t.remindAt)) continue;
    const group = todoGroupsById.get(t.groupId);
    const label = group?.name || 'Todo';
    out.push({
      slotKey: reminderNotifyKey(t.id, t.remindAt),
      itemId: t.id,
      source: 'todo',
      remindAt: t.remindAt,
      title: 'Todo reminder',
      body: `${label}: ${t.title?.trim() || '(untitled)'}`,
      repeat: t.remindRepeat,
      deepLinkPath: `/todos?focus=${encodeURIComponent(t.id)}`,
    });
  }

  for (const it of appData.items) {
    if (!it.remindAt || it.done) continue;
    const ts = Date.parse(it.remindAt);
    if (Number.isNaN(ts) || ts <= nowMs) continue;
    if (isReminderSlotNotified(notified, it.id, it.remindAt)) continue;
    const person = peopleById.get(it.personId);
    const team = person ? teamsById.get(person.teamId) : undefined;
    const label = [team?.name, person?.name].filter(Boolean).join(' · ') || 'Item';
    const kindTitle = it.kind === 'task' ? 'Task reminder' : 'Reminder';
    const deepLinkPath =
      person && person.teamId
        ? `/teams/${person.teamId}/people/${person.id}?focus=${encodeURIComponent(it.id)}`
        : null;
    out.push({
      slotKey: reminderNotifyKey(it.id, it.remindAt),
      itemId: it.id,
      source: 'team-item',
      remindAt: it.remindAt,
      title: kindTitle,
      body: `${label}: ${it.title?.trim() || '(untitled)'}`,
      repeat: it.remindRepeat,
      deepLinkPath,
    });
  }

  out.sort((a, b) => Date.parse(a.remindAt) - Date.parse(b.remindAt));
  return out;
}
