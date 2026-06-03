/** @typedef {import('./types.cjs').ReminderSlot} ReminderSlot */

const SEP = '\u0001';
const OS_ID_PREFIX = 'cadence:';

function reminderNotifyKey(id, remindAt) {
  return `${id}${SEP}${remindAt}`;
}

function reminderNotifyEntryId(entry) {
  const i = entry.indexOf(SEP);
  return i === -1 ? entry : entry.slice(0, i);
}

function isReminderSlotNotified(notifiedReminderIds, id, remindAt) {
  if (notifiedReminderIds.includes(reminderNotifyKey(id, remindAt))) return true;
  if (notifiedReminderIds.includes(id)) {
    const t = Date.parse(remindAt);
    if (!Number.isNaN(t) && t <= Date.now()) return true;
  }
  return false;
}

function clearReminderNotifyKeys(notifiedReminderIds, id) {
  return notifiedReminderIds.filter(
    (entry) => entry !== id && reminderNotifyEntryId(entry) !== id,
  );
}

function osNotificationId(slotKey) {
  return `${OS_ID_PREFIX}${slotKey}`;
}

function slotKeyFromOsNotificationId(osId) {
  if (!osId.startsWith(OS_ID_PREFIX)) return null;
  return osId.slice(OS_ID_PREFIX.length);
}

module.exports = {
  SEP,
  OS_ID_PREFIX,
  reminderNotifyKey,
  reminderNotifyEntryId,
  isReminderSlotNotified,
  clearReminderNotifyKeys,
  osNotificationId,
  slotKeyFromOsNotificationId,
};
