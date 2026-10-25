import { useCallback, useEffect, useState } from 'react';

const LS_COLLAPSED_GROUPS = 'cadence.sidebar.collapsedGroups.v1';

export function sidebarGroupsKey(userId: string) {
  return `${LS_COLLAPSED_GROUPS}:${userId}`;
}

/** Folded until the user opens them; the day-to-day groups start open. */
const DEFAULT_COLLAPSED = ['people', 'account'];

/** Reads the saved list; nothing saved, or anything unreadable or malformed, means the defaults. */
function readCollapsed(userId: string): Set<string> {
  if (!userId) return new Set(DEFAULT_COLLAPSED);
  try {
    const raw = localStorage.getItem(sidebarGroupsKey(userId));
    if (raw === null) return new Set(DEFAULT_COLLAPSED);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(DEFAULT_COLLAPSED);
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set(DEFAULT_COLLAPSED);
  }
}

/**
 * Which sidebar groups the user folded away. It is a per-viewer convenience only: nothing here
 * touches workspace data, and a failed read or write just means the defaults apply.
 */
export function useSidebarGroups(userId: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(userId));

  useEffect(() => {
    setCollapsed(readCollapsed(userId));
  }, [userId]);

  const toggle = useCallback(
    (id: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        if (userId) {
          try {
            localStorage.setItem(sidebarGroupsKey(userId), JSON.stringify([...next]));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [userId],
  );

  return { collapsed, toggle };
}
