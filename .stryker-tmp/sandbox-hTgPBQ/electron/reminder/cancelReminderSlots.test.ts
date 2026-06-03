// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createInProcessScheduler } = require('./inProcessScheduler.cjs');

describe('cancelItemPrefix', () => {
  it('removes in-process future slots for one item id', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const scheduler = createInProcessScheduler({
      onFireSlot: async () => true,
    });
    scheduler.setFutureSlots([
      {
        slotKey: `a\u0001${future}`,
        itemId: 'a',
        source: 'todo',
        remindAt: future,
        title: 'A',
        body: 'A',
      },
      {
        slotKey: `b\u0001${future}`,
        itemId: 'b',
        source: 'todo',
        remindAt: future,
        title: 'B',
        body: 'B',
      },
    ]);
    expect(scheduler.getPendingCount()).toBe(2);
    scheduler.cancelItemPrefix('a');
    expect(scheduler.getPendingCount()).toBe(1);
  });
});
