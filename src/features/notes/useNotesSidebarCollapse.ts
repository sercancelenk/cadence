import { useCallback, useEffect, useState } from 'react';
import { noteSidebarCollapsedKey } from './notePreferences';

const NOTES_MOBILE_BREAKPOINT = 800;

function detectNotesMobile(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(`(max-width: ${NOTES_MOBILE_BREAKPOINT}px)`).matches;
}

function readCollapsedPreference(userId: string): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(noteSidebarCollapsedKey(userId)) === '1';
  } catch {
    return false;
  }
}

/** Desktop notes list panel — hidden on mobile (list/detail drill-down handles that). */
export function useNotesSidebarCollapse(userId: string) {
  const [collapsed, setCollapsed] = useState(() => readCollapsedPreference(userId));
  const [isMobile, setIsMobile] = useState(detectNotesMobile);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${NOTES_MOBILE_BREAKPOINT}px)`);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setCollapsed(readCollapsedPreference(userId));
  }, [userId]);

  useEffect(() => {
    if (!userId || isMobile) return;
    try {
      localStorage.setItem(noteSidebarCollapsedKey(userId), collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed, userId, isMobile]);

  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  const expand = useCallback(() => setCollapsed(false), []);
  const collapse = useCallback(() => setCollapsed(true), []);

  return {
    /** True only on desktop when the user collapsed the list panel. */
    sidebarCollapsed: !isMobile && collapsed,
    isMobile,
    toggleSidebar: toggle,
    expandSidebar: expand,
    collapseSidebar: collapse,
  };
}
