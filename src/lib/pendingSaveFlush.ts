/**
 * Global hook so AccountContext (outside AppDataProvider tree edge) can flush
 * debounced saves before tearing the session down.
 */

let flushFn: (() => Promise<void>) | null = null;

/**
 * Hook phases run in a fixed order so producers commit before consumers:
 *   1. `editor` — drain WYSIWYG debounce buffers into AppData (e.g. the
 *      RichTextEditor's pending onChange). Must run FIRST so that…
 *   2. `default` — module-local commit hooks (e.g. encrypting a locked note's
 *      latest body) see the freshest content the editor just flushed.
 * Within a phase, hooks run in registration order.
 */
type FlushHook = () => void | Promise<void>;
const editorFlushHooks = new Set<FlushHook>();
const beforeFlushHooks = new Set<FlushHook>();

export function registerFlushPendingSave(fn: () => Promise<void>): void {
  flushFn = fn;
}

export function unregisterFlushPendingSave(): void {
  flushFn = null;
}

/** Module-local editors (e.g. locked notes) register async commit hooks here. */
export function registerBeforeFlushHook(
  fn: FlushHook,
  phase: 'editor' | 'default' = 'default',
): () => void {
  const set = phase === 'editor' ? editorFlushHooks : beforeFlushHooks;
  set.add(fn);
  return () => {
    set.delete(fn);
  };
}

export async function runBeforeFlushHooks(): Promise<void> {
  // Isolate each hook: a single failing producer (e.g. a locked-note encrypt
  // that throws) must NOT abort the remaining hooks or the downstream AppData
  // flush. Otherwise one error on quit/sync would block every pending save.
  for (const fn of editorFlushHooks) {
    try {
      await fn();
    } catch (err) {
      console.error('[cadence] before-flush (editor) hook failed', err);
    }
  }
  for (const fn of beforeFlushHooks) {
    try {
      await fn();
    } catch (err) {
      console.error('[cadence] before-flush hook failed', err);
    }
  }
}

export async function flushPendingSaveGlobal(): Promise<void> {
  await runBeforeFlushHooks();
  if (flushFn) await flushFn();
}
