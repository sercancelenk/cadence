import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';

export type VirtualWindow = {
  start: number;
  end: number;
  totalHeight: number;
  items: Array<{ index: number; top: number; height: number }>;
};

type UseVariableVirtualListOptions = {
  itemHeights: number[];
  overscan?: number;
};

function findStartIndex(tops: number[], scrollTop: number): number {
  let low = 0;
  let high = tops.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (tops[mid]! <= scrollTop) low = mid;
    else high = mid - 1;
  }
  return low;
}

/** Variable-height windowing for summary sections (headers + rows). */
export function useVariableVirtualList(
  containerRef: RefObject<HTMLElement | null>,
  { itemHeights, overscan = 4 }: UseVariableVirtualListOptions,
): VirtualWindow {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const layout = useMemo(() => {
    const tops: number[] = [];
    let total = 0;
    for (const height of itemHeights) {
      tops.push(total);
      total += height;
    }
    return { tops, total };
  }, [itemHeights]);

  const sync = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    setScrollTop(node.scrollTop);
    setViewportHeight(node.clientHeight);
  }, [containerRef]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || itemHeights.length === 0) return;
    if (typeof ResizeObserver === 'undefined') {
      sync();
      return;
    }

    sync();
    node.addEventListener('scroll', sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);

    return () => {
      node.removeEventListener('scroll', sync);
      observer.disconnect();
    };
  }, [containerRef, sync, itemHeights.length]);

  if (itemHeights.length === 0) {
    return { start: 0, end: 0, totalHeight: 0, items: [] };
  }

  const start = Math.max(0, findStartIndex(layout.tops, scrollTop) - overscan);
  let end = start;
  const bottom = scrollTop + viewportHeight;
  while (end < itemHeights.length && layout.tops[end]! < bottom) {
    end++;
  }
  end = Math.min(itemHeights.length, end + overscan);

  const items = [];
  for (let index = start; index < end; index++) {
    items.push({
      index,
      top: layout.tops[index]!,
      height: itemHeights[index]!,
    });
  }

  return {
    start,
    end,
    totalHeight: layout.total,
    items,
  };
}
