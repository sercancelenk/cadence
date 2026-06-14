import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerBeforeFlushHook } from './pendingSaveFlush';
import { SYNC_BEFORE_APPLY, prepareForRemoteApply } from './syncApplyGuard';

describe('syncApplyGuard', () => {
  let disposeHook: (() => void) | undefined;

  beforeEach(() => {
    vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    disposeHook?.();
    disposeHook = undefined;
    vi.restoreAllMocks();
  });

  it('exports the before-apply event name', () => {
    expect(SYNC_BEFORE_APPLY).toBe('cadence:before-sync-apply');
  });

  it('runs pending-save hooks before dispatching SYNC_BEFORE_APPLY', async () => {
    const hook = vi.fn();
    disposeHook = registerBeforeFlushHook(hook);
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    await prepareForRemoteApply();

    expect(hook).toHaveBeenCalledTimes(1);
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: SYNC_BEFORE_APPLY }));
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('dispatches SYNC_BEFORE_APPLY and waits two animation frames', async () => {
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      });

    await prepareForRemoteApply();

    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: SYNC_BEFORE_APPLY }));
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('no-ops when window is undefined (SSR-safe)', async () => {
    const win = globalThis.window;
    vi.stubGlobal('window', undefined);
    await expect(prepareForRemoteApply()).resolves.toBeUndefined();
    vi.stubGlobal('window', win);
  });
});
