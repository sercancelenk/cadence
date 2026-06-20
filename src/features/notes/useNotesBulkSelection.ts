import { useCallback, useRef, useState } from 'react';
import {
  contextMenuNoteIds,
  rangeNoteIds,
  shouldUpdateRangeAnchor,
  toggleBulkId,
} from './notesBulkSelectionUtils';

export function useNotesBulkSelection(orderedNoteIds: readonly string[]) {
  const [bulkIds, setBulkIds] = useState<Set<string>>(() => new Set());
  const rangeAnchorIdRef = useRef<string | null>(null);

  const clearBulk = useCallback(() => {
    setBulkIds(new Set());
    rangeAnchorIdRef.current = null;
  }, []);

  const handleNoteClick = useCallback(
    (
      id: string,
      opts: { shiftKey: boolean; metaKey: boolean },
      selectedId: string | null,
      onPrimarySelect: (id: string) => void,
    ) => {
      if (opts.shiftKey) {
        const anchor = rangeAnchorIdRef.current;
        if (anchor) {
          setBulkIds(new Set(rangeNoteIds(orderedNoteIds, anchor, id)));
          onPrimarySelect(id);
          return;
        }
        // Never infer a range from auto-selected selectedId — only this row.
        rangeAnchorIdRef.current = id;
        setBulkIds(new Set([id]));
        onPrimarySelect(id);
        return;
      }

      if (opts.metaKey) {
        const next = toggleBulkId(bulkIds, id);
        rangeAnchorIdRef.current = id;
        setBulkIds(next.size > 0 ? next : new Set([id]));
        onPrimarySelect(id);
        return;
      }

      if (shouldUpdateRangeAnchor(id, selectedId, bulkIds)) {
        rangeAnchorIdRef.current = id;
      } else {
        rangeAnchorIdRef.current = null;
      }
      setBulkIds(new Set([id]));
      onPrimarySelect(id);
    },
    [bulkIds, orderedNoteIds],
  );

  const prepareContextMenu = useCallback(
    (clickedId: string): string[] => {
      const { ids, nextBulk } = contextMenuNoteIds(clickedId, bulkIds);
      rangeAnchorIdRef.current = clickedId;
      setBulkIds(nextBulk);
      return ids;
    },
    [bulkIds],
  );

  return {
    bulkIds,
    clearBulk,
    handleNoteClick,
    prepareContextMenu,
  };
}
