import { useCallback, useRef, useState, type RefObject } from 'react';

const SPLITTER_HEIGHT = 8;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export type UseVerticalSplitResizeOptions = {
  containerRef: RefObject<HTMLElement | null>;
  defaultSize: number;
  minTop: number;
  minBottom: number;
};

export function useVerticalSplitResize({
  containerRef,
  defaultSize,
  minTop,
  minBottom,
}: UseVerticalSplitResizeOptions) {
  const [topSize, setTopSize] = useState(defaultSize);
  const dragRef = useRef<{ startY: number; startSize: number } | null>(null);

  const begin = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      dragRef.current = { startY: e.clientY, startSize: topSize };
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [topSize],
  );

  const move = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || !container) return;
      const maxTop =
        container.getBoundingClientRect().height - minBottom - SPLITTER_HEIGHT;
      const next = clamp(drag.startSize + (e.clientY - drag.startY), minTop, maxTop);
      setTopSize(next);
    },
    [containerRef, minBottom, minTop],
  );

  const end = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return { topSize, begin, move, end, isDragging: dragRef.current !== null };
}
