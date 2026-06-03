import { useCallback, useRef, useState } from 'react';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './notePreferences';
import { clamp } from './notesUiUtils';

export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const resizeStateRef = useRef<{ startX: number; startW: number } | null>(null);

  const beginSidebarResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      resizeStateRef.current = { startX: e.clientX, startW: sidebarWidth };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarWidth],
  );

  const onSidebarResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const s = resizeStateRef.current;
    if (!s) return;
    const next = clamp(s.startW + (e.clientX - s.startX), SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH);
    setSidebarWidth(next);
  }, []);

  const endSidebarResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStateRef.current) return;
    resizeStateRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // Pointer already released — safe to ignore.
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return {
    sidebarWidth,
    beginSidebarResize,
    onSidebarResizeMove,
    endSidebarResize,
  };
}
