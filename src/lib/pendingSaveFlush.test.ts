import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  flushPendingSaveGlobal,
  registerBeforeFlushHook,
  registerFlushPendingSave,
  runBeforeFlushHooks,
  unregisterFlushPendingSave,
} from './pendingSaveFlush';

describe('pendingSaveFlush', () => {
  afterEach(() => {
    unregisterFlushPendingSave();
  });

  it('runs registered before-flush hooks in order', async () => {
    const order: number[] = [];
    const disposeA = registerBeforeFlushHook(async () => {
      order.push(1);
    });
    registerBeforeFlushHook(() => {
      order.push(2);
    });
    await runBeforeFlushHooks();
    expect(order).toEqual([1, 2]);
    disposeA();
    await runBeforeFlushHooks();
    expect(order).toEqual([1, 2, 2]);
  });

  it('awaits the global flush after hooks', async () => {
    const flush = vi.fn().mockResolvedValue(undefined);
    registerFlushPendingSave(flush);
    const hook = vi.fn();
    registerBeforeFlushHook(hook);
    await flushPendingSaveGlobal();
    expect(hook).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it('no-ops when no global flush is registered', async () => {
    unregisterFlushPendingSave();
    await expect(flushPendingSaveGlobal()).resolves.toBeUndefined();
  });
});
