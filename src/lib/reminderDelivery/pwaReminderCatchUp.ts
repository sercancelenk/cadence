const TAG_PREFIX = 'cadence:';

/** Parse SW notification tag back to item id + remindAt. */
export function parseReminderNotificationTag(tag: string): { itemId: string; remindAt: string } | null {
  if (!tag.startsWith(TAG_PREFIX)) return null;
  const rest = tag.slice(TAG_PREFIX.length);
  const sep = rest.indexOf('|');
  if (sep === -1) return null;
  const itemId = rest.slice(0, sep);
  const remindAt = rest.slice(sep + 1);
  if (!itemId || !remindAt) return null;
  return { itemId, remindAt };
}

/**
 * Mark reminder slots as notified when the SW already showed them (tab was closed).
 * Returns slot keys to merge into `notifiedReminderIds`.
 */
export async function collectPwaDeliveredSlotKeys(nowMs = Date.now()): Promise<string[]> {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return [];
  if (Notification.permission !== 'granted') return [];
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (!reg) return [];

  const notifications = await reg.getNotifications();
  const keys: string[] = [];
  for (const n of notifications) {
    if (!n.tag) continue;
    const parsed = parseReminderNotificationTag(n.tag);
    if (!parsed) continue;
    const t = Date.parse(parsed.remindAt);
    if (Number.isNaN(t) || t > nowMs) continue;
    keys.push(`${parsed.itemId}\u0001${parsed.remindAt}`);
  }
  return keys;
}
