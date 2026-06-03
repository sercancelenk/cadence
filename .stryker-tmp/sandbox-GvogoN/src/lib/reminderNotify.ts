// @ts-nocheck
const SEP = '\u0001';

/** One notified reminder slot (task id + exact remindAt ISO). */
export function reminderNotifyKey(id: string, remindAt: string): string {
  return `${id}${SEP}${remindAt}`;
}

export function reminderNotifyEntryId(entry: string): string {
  const i = entry.indexOf(SEP);
  return i === -1 ? entry : entry.slice(0, i);
}

export function isReminderSlotNotified(
  notifiedReminderIds: string[],
  id: string,
  remindAt: string,
): boolean {
  if (notifiedReminderIds.includes(reminderNotifyKey(id, remindAt))) return true;
  // Legacy entries stored only the item id — treat as "already pinged" for past slots.
  if (notifiedReminderIds.includes(id)) {
    const t = Date.parse(remindAt);
    if (!Number.isNaN(t) && t <= Date.now()) return true;
  }
  return false;
}

export function clearReminderNotifyKeys(
  notifiedReminderIds: string[],
  id: string,
): string[] {
  return notifiedReminderIds.filter(
    (entry) => entry !== id && reminderNotifyEntryId(entry) !== id,
  );
}
