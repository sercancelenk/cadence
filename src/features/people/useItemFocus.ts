import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import type { Item } from '../../core/model';

function stripFocusParam(
  locationSearch: string,
  locationPathname: string,
  navigate: NavigateFunction,
) {
  const params = new URLSearchParams(locationSearch);
  params.delete('focus');
  const next = params.toString();
  navigate({ pathname: locationPathname, search: next ? `?${next}` : '' }, { replace: true });
}

/** Deep-link handler for `/teams/:teamId/people/:personId?focus=<itemId>`. */
export function useItemFocus(
  locationSearch: string,
  locationPathname: string,
  navigate: NavigateFunction,
  items: Item[],
  setOpenId: (id: string | null) => void,
  setTab: (tab: 'workspace' | 'timeline' | 'meeting') => void,
) {
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(locationSearch);
    const focusId = params.get('focus');
    if (!focusId) return;

    const target = items.find((i) => i.id === focusId);
    if (target) {
      setOpenId(focusId);
      setTab('workspace');
      setFocusedItemId(focusId);
      stripFocusParam(locationSearch, locationPathname, navigate);
      return;
    }

    // Wait until workspace items are loaded before dropping an unknown focus id.
    if (items.length > 0) {
      stripFocusParam(locationSearch, locationPathname, navigate);
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
