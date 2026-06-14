/**
 * Global hook so AccountContext (outside AppDataProvider tree edge) can flush
 * debounced saves before tearing the session down.
 */

let flushFn: (() => Promise<void>) | null = null;
const beforeFlushHooks = new Set<() => void | Promise<void>>();

export function registerFlushPendingSave(fn: () => Promise<void>): void {
  flushFn = fn;
}

export function unregisterFlushPendingSave(): void {
  flushFn = null;
}

/** Module-local editors (e.g. locked notes) register async commit hooks here. */
export function registerBeforeFlushHook(fn: () => void | Promise<void>): () => void {
  beforeFlushHooks.add(fn);
  return () => {
    beforeFlushHooks.delete(fn);
  };
}

export async function runBeforeFlushHooks(): Promise<void> {
  for (const fn of beforeFlushHooks) {
    await fn();
  }
}

export async function flushPendingSaveGlobal(): Promise<void> {
  await runBeforeFlushHooks();
  if (flushFn) await flushFn();
}
