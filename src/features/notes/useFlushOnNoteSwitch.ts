import { useEffect, useRef } from 'react';

/**
 * Lands typing on disk when the user moves to another note or leaves the notes
 * view. Typing is written on a slow interval; this is the "does not wait"
 * half of that contract. The outgoing editor has already handed its buffer to
 * AppData by the time this effect runs (it flushes on unmount), and the flush
 * only writes when an edit is actually pending.
 */
export function useFlushOnNoteSwitch(
  selectedId: string | null | undefined,
  flushIfPending: () => Promise<void>,
): void {
  const flushRef = useRef(flushIfPending);
  flushRef.current = flushIfPending;

  const run = () => {
    void flushRef.current().catch((err: unknown) => {
      console.error('[cadence] flush on note switch failed', err);
    });
  };

  const previousId = useRef(selectedId);
  useEffect(() => {
    if (previousId.current === selectedId) return;
    previousId.current = selectedId;
    run();
  }, [selectedId]);

  useEffect(() => run, []);
}
