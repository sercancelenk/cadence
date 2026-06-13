import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORAGE_PREFIX } from '../../lib/appBranding';
import type { NoteGroup } from '../../model';

const storageKey = (userId: string) => `${STORAGE_PREFIX}-notes-group-${userId}`;

function readStored(userId: string): string | null {
  try {
    const v = localStorage.getItem(storageKey(userId));
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function writeStored(userId: string, groupId: string) {
  try {
    localStorage.setItem(storageKey(userId), groupId);
  } catch {
    /* ignore */
  }
}

/** Active note list selection — persisted per user like view mode. */
export function useNoteGroupSelection(groups: NoteGroup[], userId: string) {
  const sorted = useMemo(
    () => [...groups].sort((a, b) => a.sortOrder - b.sortOrder),
    [groups],
  );

  const [selectedGroupId, setSelectedGroupIdState] = useState<string | null>(() => {
    if (!userId || sorted.length === 0) return null;
    const stored = readStored(userId);
    if (stored && sorted.some((g) => g.id === stored)) return stored;
    return sorted[0]?.id ?? null;
  });

  useEffect(() => {
    if (!userId || sorted.length === 0) {
      setSelectedGroupIdState(null);
      return;
    }
    setSelectedGroupIdState((prev) => {
      if (prev && sorted.some((g) => g.id === prev)) return prev;
      const stored = readStored(userId);
      if (stored && sorted.some((g) => g.id === stored)) return stored;
      return sorted[0]?.id ?? null;
    });
  }, [userId, sorted]);

  const setSelectedGroupId = useCallback(
    (id: string) => {
      setSelectedGroupIdState(id);
      if (userId) writeStored(userId, id);
    },
    [userId],
  );

  const selectedGroup = sorted.find((g) => g.id === selectedGroupId) ?? sorted[0];

  return {
    groups: sorted,
    selectedGroupId: selectedGroup?.id ?? null,
    selectedGroup,
    setSelectedGroupId,
  };
}
