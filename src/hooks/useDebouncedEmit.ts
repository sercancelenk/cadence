import { useCallback, useEffect, useRef } from 'react';

/**
 * Debounced callback emitter with echo tracking — used by structured text editors
 * to avoid spamming parent onChange while typing.
 */
export function useDebouncedEmit(debounceMs: number, onEmit?: (value: string) => void) {
  const onEmitRef = useRef(onEmit);
  onEmitRef.current = onEmit;
  const debounceRef = useRef(debounceMs);
  debounceRef.current = debounceMs;
  const lastEmitted = useRef<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback((value: string) => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    onEmitRef.current?.(value);
  }, []);

  const schedule = useCallback(
    (value: string) => {
      const ms = debounceRef.current;
      if (ms <= 0) {
        flush(value);
        return;
      }
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        pending.current = null;
        flush(value);
      }, ms);
    },
    [flush],
  );

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  return { lastEmitted, flush, schedule };
}
