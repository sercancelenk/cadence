import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Item } from '../../core/model';

export type WorkspaceTab = 'workspace' | 'timeline' | 'meeting';

function stripDeepLinkParams(
  locationSearch: string,
  locationPathname: string,
  navigate: NavigateFunction,
) {
  const params = new URLSearchParams(locationSearch);
  params.delete('focus');
  params.delete('tab');
  const next = params.toString();
  navigate({ pathname: locationPathname, search: next ? `?${next}` : '' }, { replace: true });
}

function parseWorkspaceTab(raw: string | null): WorkspaceTab | null {
  if (raw === 'workspace' || raw === 'timeline' || raw === 'meeting') return raw;
  return null;
}

/**
 * Deep-link handler for person workspaces:
 *   `?focus=<itemId>` → expand item on Workspace tab
 *   `?tab=meeting|timeline|workspace` → open that tab (used by dashboard shortcuts)
 */
export function useItemFocus(
  locationSearch: string,
  locationPathname: string,
  navigate: NavigateFunction,
  items: Item[],
  setOpenId: (id: string | null) => void,
  setTab: (tab: WorkspaceTab) => void,
) {
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch);
    const focusId = params.get('focus');
    const tabParam = parseWorkspaceTab(params.get('tab'));

    if (!focusId && !tabParam) return;

    if (focusId) {
      const target = items.find((i) => i.id === focusId);
      if (target) {
        setOpenId(focusId);
        setTab(tabParam ?? 'workspace');
        setFocusedItemId(focusId);
        stripDeepLinkParams(locationSearch, locationPathname, navigate);
        return;
      }
      // Wait until workspace items are loaded before dropping an unknown focus id.
      if (items.length > 0) {
        if (tabParam) setTab(tabParam);
        stripDeepLinkParams(locationSearch, locationPathname, navigate);
      }
      return;
    }

    if (tabParam) {
      setTab(tabParam);
      stripDeepLinkParams(locationSearch, locationPathname, navigate);
    }
  }, [locationSearch, locationPathname, navigate, items, setOpenId, setTab]);

  useEffect(() => {
    if (!focusedItemId) return;
    let cancelled = false;
    let scrollTimer = 0;
    const tryScroll = (attempt = 0) => {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-item-id="${focusedItemId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (attempt < 8) {
        scrollTimer = window.setTimeout(() => tryScroll(attempt + 1), 50 * (attempt + 1));
      }
    };
    const frame = window.requestAnimationFrame(() => tryScroll());
    const clear = window.setTimeout(() => setFocusedItemId(null), 1800);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
      window.clearTimeout(scrollTimer);
    };
  }, [focusedItemId]);
}
