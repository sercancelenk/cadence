import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const setActiveBackendId = vi.fn();
const disconnectGDrive = vi.fn();

vi.mock('./syncBackends', () => ({
  setActiveBackendId: (...args: unknown[]) => setActiveBackendId(...args),
  disconnectGDrive: (...args: unknown[]) => disconnectGDrive(...args),
}));

describe('retireCloudSyncState', () => {
  beforeEach(() => {
    localStorage.clear();
    setActiveBackendId.mockClear();
    disconnectGDrive.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('clears backend + Drive once and marks complete', async () => {
    const { retireCloudSyncState } = await import('./retireCloudSyncState');
    retireCloudSyncState();
    expect(setActiveBackendId).toHaveBeenCalledWith(null);
    expect(disconnectGDrive).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('cadence.sync.retired.v1')).toBe('1');

    setActiveBackendId.mockClear();
    disconnectGDrive.mockClear();
    retireCloudSyncState();
    expect(setActiveBackendId).not.toHaveBeenCalled();
    expect(disconnectGDrive).not.toHaveBeenCalled();
  });
});
