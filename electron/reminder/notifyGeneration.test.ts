import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { initReminderSync, syncRemindersFromAppData, stopReminderSync } = require('./index.cjs');

const PAST = '2020-01-01T00:00:00.000Z';

function workspaceWithPastDueTodo() {
  return {
    notifiedReminderIds: [],
    teams: [],
    people: [],
    todoGroups: [{ id: 'grp-1', name: 'Inbox', createdAt: PAST }],
    items: [],
    todoItems: [
      {
        id: 't1',
        groupId: 'grp-1',
        title: 'Late task',
        status: 'todo',
        remindAt: PAST,
        createdAt: PAST,
        updatedAt: PAST,
      },
    ],
  };
}

describe('reminder notifyRenderer write generation', () => {
  afterEach(() => {
    stopReminderSync();
  });

  it('forwards the new on-disk write generation when a reminder fires', async () => {
    const events: Array<{ type: string; writeGeneration?: number }> = [];
    const stored = workspaceWithPastDueTodo();

    initReminderSync({
      readUserData: () => stored,
      // commitUserData bumps and returns the new generation; emulate that here.
      writeUserData: () => ({ ok: true, writeGeneration: 42 }),
      getSessionUserId: () => 'user-1',
      notifyRenderer: (payload: { type: string; writeGeneration?: number }) => events.push(payload),
      // Avoid the real Electron Notification API in unit tests.
      showNotification: () => true,
    });

    await syncRemindersFromAppData(stored, 'user-1');

    const fired = events.find((e) => e.type === 'fired');
    expect(fired).toBeDefined();
    // Without this the renderer keeps a stale generation and the user's next
    // edit dead-locks behind a phantom write-conflict until app restart.
    expect(fired?.writeGeneration).toBe(42);
  });

  it('does not push a fired event to the renderer when the disk write fails', async () => {
    const events: Array<{ type: string; writeGeneration?: number }> = [];
    const stored = workspaceWithPastDueTodo();

    initReminderSync({
      readUserData: () => stored,
      // Emulate a failed commit (e.g. write-conflict): no generation handed back.
      writeUserData: () => ({ ok: false, reason: 'write-conflict' }),
      getSessionUserId: () => 'user-1',
      notifyRenderer: (payload: { type: string; writeGeneration?: number }) => events.push(payload),
      showNotification: () => true,
    });

    await syncRemindersFromAppData(stored, 'user-1');

    // Pushing the unpersisted snapshot would leak main-only state into the
    // renderer and hand back no generation, re-opening the save dead-lock.
    expect(events.some((e) => e.type === 'fired' || e.type === 'delivered-sync')).toBe(false);
  });
});
