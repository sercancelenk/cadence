import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const supportsPwaOsSchedule = vi.fn();
const postReminderCancelItem = vi.fn();

vi.mock('./capabilities', () => ({
  supportsPwaOsSchedule: () => supportsPwaOsSchedule(),
}));

vi.mock('./pwaReminderSync', () => ({
  postReminderCancelItem: (id: string) => postReminderCancelItem(id),
}));

import { cancelPendingReminderSlots } from './cancelReminderSlots';

describe('cancelPendingReminderSlots', () => {
  const cancelReminderSlots = vi.fn().mockResolvedValue({ ok: true });

  beforeEach(() => {
    vi.clearAllMocks();
    supportsPwaOsSchedule.mockReturnValue(false);
    window.cadence = { cancelReminderSlots } as unknown as typeof window.cadence;
  });

  afterEach(() => {
    delete window.cadence;
  });

  it('no-ops without item id', () => {
    cancelPendingReminderSlots(undefined);
    expect(cancelReminderSlots).not.toHaveBeenCalled();
    expect(postReminderCancelItem).not.toHaveBeenCalled();
  });

  it('calls window.cadence.cancelReminderSlots when present', () => {
    cancelPendingReminderSlots('item-1');
    expect(cancelReminderSlots).toHaveBeenCalledWith('item-1');
  });

  it('posts SW cancel when PWA OS schedule is supported', () => {
    supportsPwaOsSchedule.mockReturnValue(true);
    cancelPendingReminderSlots('item-2');
    expect(postReminderCancelItem).toHaveBeenCalledWith('item-2');
  });

  it('skips SW cancel when PWA OS schedule is unsupported', () => {
    supportsPwaOsSchedule.mockReturnValue(false);
    cancelPendingReminderSlots('item-3');
    expect(postReminderCancelItem).not.toHaveBeenCalled();
  });

  it('still posts SW cancel when cadence bridge is absent', () => {
    delete window.cadence;
    supportsPwaOsSchedule.mockReturnValue(true);
    cancelPendingReminderSlots('item-4');
    expect(postReminderCancelItem).toHaveBeenCalledWith('item-4');
  });

  it('does not throw when cadence exists without cancelReminderSlots', () => {
    window.cadence = {} as unknown as typeof window.cadence;
    supportsPwaOsSchedule.mockReturnValue(false);
    expect(() => cancelPendingReminderSlots('item-5')).not.toThrow();
    expect(postReminderCancelItem).not.toHaveBeenCalled();
  });
});
