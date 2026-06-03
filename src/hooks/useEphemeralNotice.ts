import { useCallback, useEffect, useRef, useState } from 'react';

/** Short-lived status banner (e.g. “Copied to clipboard”) with safe unmount cleanup. */
export function useEphemeralNotice(durationMs = 2000) {
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const showNotice = useCallback(
    (message: string, ms = durationMs) => {
      setNotice(message);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        setNotice(null);
      }, ms);
    },
    [durationMs],
  );

  const clearNotice = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setNotice(null);
  }, []);

  return { notice, showNotice, clearNotice, setNotice };
}
