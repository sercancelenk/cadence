import { useCallback, useEffect, useRef, useState } from 'react';

/** Writes text to the clipboard. `true` only when it really got there (no clipboard, or a refusal, is `false`). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export type CopyStatus = 'idle' | 'copied' | 'failed';

/** Copy with visible feedback for a short while, per key (so one hook serves several buttons). */
export function useCopy(resetMs = 2000) {
  const [state, setState] = useState<{ key: string; status: CopyStatus } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(
    async (key: string, text: string): Promise<boolean> => {
      const ok = await copyText(text);
      setState({ key, status: ok ? 'copied' : 'failed' });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setState(null), resetMs);
      return ok;
    },
    [resetMs],
  );

  const statusOf = useCallback((key: string): CopyStatus => (state?.key === key ? state.status : 'idle'), [state]);
  return { copy, statusOf };
}
