/**
 * Global hook so AccountContext (outside AppDataProvider tree edge) can flush
 * debounced saves before tearing the session down.
 */

let flushFn: (() => Promise<void>) | null = null;

export function registerFlushPendingSave(fn: () => Promise<void>): void {
  flushFn = fn;
}

export function unregisterFlushPendingSave(): void {
  flushFn = null;
}

export async function flushPendingSaveGlobal(): Promise<void> {
  if (flushFn) await flushFn();
}
