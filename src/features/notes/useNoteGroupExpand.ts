import { useCallback, useEffect, useState } from 'react';
import { STORAGE_PREFIX } from '../../lib/appBranding';

const storageKey = (userId: string) => `${STORAGE_PREFIX}-notes-group-expand-${userId}`;

function readStored(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function writeStored(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

/** Which note-list holders are expanded in the sidebar. */
export function useNoteGroupExpand(userId: string) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    userId ? readStored(userId) : new Set(),
  );

  useEffect(() => {
    if (!userId) {
      setExpanded(new Set());
      return;
    }
    setExpanded(readStored(userId));
  }, [userId]);

  const persist = useCallback(
    (next: Set<string>) => {
      setExpanded(next);
      if (userId) writeStored(userId, next);
    },
    [userId],
  );

  const isExpanded = useCallback((groupId: string) => expanded.has(groupId), [expanded]);

  const toggleExpanded = useCallback(
    (groupId: string) => {
      const next = new Set(expanded);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      persist(next);
    },
    [expanded, persist],
  );

  const expandGroup = useCallback(
    (groupId: string) => {
      if (expanded.has(groupId)) return;
      persist(new Set([...expanded, groupId]));
    },
    [expanded, persist],
  );

  return { isExpanded, toggleExpanded, expandGroup };
}
