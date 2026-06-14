import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './notePreferences';
import { clamp } from './notesUiUtils';

export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState<number>(SIDEBAR_DEFAULT_WIDTH);
  const resizeStateRef = useRef<{
    startX: number;
    startW: number;
    pointerId: number;
    handle: HTMLElement;
  } | null>(null);

  const resetBodyStyles = useCallback(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const finishResize = useCallback(() => {
    const s = resizeStateRef.current;
    if (!s) return;
    resizeStateRef.current = null;
    try {
      s.handle.releasePointerCapture(s.pointerId);
    } catch {
      // Pointer already released or handle detached — safe to ignore.
    }
    resetBodyStyles();
  }, [resetBodyStyles]);

  const beginSidebarResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const handle = e.currentTarget;
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // Capture is best-effort; window listeners still end the drag.
      }
      resizeStateRef.current = {
        startX: e.clientX,
        startW: sidebarWidth,
        pointerId: e.pointerId,
        handle,
      };
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

  const endSidebarResize = useCallback(() => {
    finishResize();
  }, [finishResize]);

  // Safety net: end the drag (and restore the cursor / text selection) even if
  // the handle element unmounts mid-drag — e.g. the user collapses the sidebar
  // while dragging, so its onPointerUp can never fire. Also reset on unmount.
  useEffect(() => {
    const onUp = () => finishResize();
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      resetBodyStyles();
    };
  }, [finishResize, resetBodyStyles]);

  return {
    sidebarWidth,
    beginSidebarResize,
    onSidebarResizeMove,
    endSidebarResize,
  };
}
