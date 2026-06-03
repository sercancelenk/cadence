import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { reconcileOsReminderSlots } = require('./reconcileOsSlots.cjs');

describe('reconcileOsReminderSlots', () => {
  it('cancels stale OS ids and reschedules every desired slot', async () => {
    const schedule = vi.fn(async () => ({ ok: true }));
    const cancelByOsId = vi.fn(async () => ({ ok: true }));
    const listPendingIds = vi.fn(async () => ['cadence:old\u00012025-01-01T00:00:00.000Z', 'cadence:keep\u00012025-02-01T00:00:00.000Z']);

    const desired = [
      {
        slotKey: 'keep\u00012025-02-01T00:00:00.000Z',
        itemId: 'keep',
        source: 'todo',
        remindAt: '2025-02-01T10:00:00.000Z',
        title: 'Updated title',
        body: 'Updated body',
      },
    ];

    const result = await reconcileOsReminderSlots(desired, {
      listPendingIds,
      schedule,
      cancelByOsId,
    });

    expect(result.ok).toBe(true);
    expect(cancelByOsId).toHaveBeenCalledWith('cadence:old\u00012025-01-01T00:00:00.000Z');
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(desired[0]);
  });
});
