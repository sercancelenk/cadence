import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYNC_BEFORE_APPLY, prepareForRemoteApply } from './syncApplyGuard';

describe('syncApplyGuard', () => {
  beforeEach(() => {
    vi.spyOn(window, 'dispatchEvent');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exports the before-apply event name', () => {
    expect(SYNC_BEFORE_APPLY).toBe('cadence:before-sync-apply');
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
