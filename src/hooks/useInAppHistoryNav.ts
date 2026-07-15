import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

export type InAppHistoryNav = {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
};

const MAX_STACK = 100;

function locationKey(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

/**
 * Session-scoped back/forward for the TopBar (Spotify-style).
 * Tracks an in-app stack keyed by React Router navigation type
 * (PUSH / REPLACE / POP) so revisiting a prior URL via Link does not
 * look like browser Back. Does not touch AppData — callers should
 * await flushPendingSave before navigating if they care about the
 * 400ms debounce window.
 */
export function useInAppHistoryNav(): InAppHistoryNav {
  const location = useLocation();
  const navigate = useNavigate();
  const navType = useNavigationType();
  const stackRef = useRef<string[]>([]);
  const indexRef = useRef(-1);
  const [tick, setTick] = useState(0);

  const key = locationKey(location.pathname, location.search, location.hash);

  useEffect(() => {
    const stack = stackRef.current;
    const idx = indexRef.current;

    if (idx < 0) {
      stackRef.current = [key];
      indexRef.current = 0;
      setTick((n) => n + 1);
      return;
    }

    if (stack[idx] === key) {
      return;
    }

    if (navType === 'POP') {
      if (idx > 0 && stack[idx - 1] === key) {
        indexRef.current = idx - 1;
      } else if (idx < stack.length - 1 && stack[idx + 1] === key) {
        indexRef.current = idx + 1;
      } else {
        const found = stack.lastIndexOf(key);
        if (found >= 0) {
          indexRef.current = found;
        } else {
          const next = stack.slice(0, idx + 1);
          next.push(key);
          stackRef.current = next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
          indexRef.current = stackRef.current.length - 1;
        }
      }
      setTick((n) => n + 1);
      return;
    }

    if (navType === 'REPLACE') {
      const next = stack.slice();
      next[idx] = key;
      stackRef.current = next;
      setTick((n) => n + 1);
      return;
    }

    // PUSH — truncate any forward entries, then append
    const next = stack.slice(0, Math.max(0, idx + 1));
    next.push(key);
    stackRef.current = next.length > MAX_STACK ? next.slice(next.length - MAX_STACK) : next;
    indexRef.current = stackRef.current.length - 1;
    setTick((n) => n + 1);
  }, [key, navType]);

  void tick;

  const canGoBack = indexRef.current > 0;
  const canGoForward =
    indexRef.current >= 0 && indexRef.current < stackRef.current.length - 1;

  return {
    canGoBack,
    canGoForward,
    goBack: () => {
      if (indexRef.current > 0) navigate(-1);
    },
    goForward: () => {
      if (indexRef.current >= 0 && indexRef.current < stackRef.current.length - 1) {
        navigate(1);
      }
    },
  };
}
