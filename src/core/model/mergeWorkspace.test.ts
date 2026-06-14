import { describe, it, expect } from 'vitest';
import { emptyData, nowIso, type AppData, type Note, type TodoItem } from './index';
import { describeMergeSummary, mergeAppendWorkspace } from './mergeWorkspace';

// A FIXED scaffold so `local` and `remote` share identical teams/people ids;
// otherwise `emptyData()`'s random uuids would make every merge append the
// peer's team + self/leader people and pollute the counts under test.
const T = '2024-01-01T00:00:00.000Z';
const TEAM_ID = 'team-fixed';

function baseData(): AppData {
  return {
    version: emptyData().version,
    teams: [{ id: TEAM_ID, name: 'Team', createdAt: T, status: 'active' }],
    people: [
      { id: `__self__${TEAM_ID}`, teamId: TEAM_ID, name: 'Me', isSelf: true, scratchpad: '', createdAt: T },
      { id: `__leader__${TEAM_ID}`, teamId: TEAM_ID, name: 'My leader', scratchpad: '', createdAt: T },
    ],
    items: [],
    notifiedReminderIds: [],
    lastTeamId: TEAM_ID,
    profile: { displayName: 'Me', favoriteTeamIds: [] },
    todoGroups: [],
    todoItems: [],
    notes: [],
    noteGroups: [],
  };
}

function note(id: string, over: Partial<Note> = {}): Note {
  const t = nowIso();
  return {
    id,
    title: `Note ${id}`,
    body: `body ${id}`,
    bodyPlainText: `body ${id}`,
    locked: false,
    pinned: false,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

function todo(id: string, over: Partial<TodoItem> = {}): TodoItem {
  const t = nowIso();
  return {
    id,
    groupId: 'g1',
    title: `Todo ${id}`,
    status: 'todo',
    done: false,
    createdAt: t,
    updatedAt: t,
    ...over,
  };
}

describe('mergeAppendWorkspace', () => {
  it('appends remote-only notes and reports a summary', () => {
    const local = { ...baseData(), notes: [note('a')] };
    const remote = { ...baseData(), notes: [note('a'), note('b')] };

    const { data, summary } = mergeAppendWorkspace(local, remote);

    expect(data.notes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(summary.notes).toBe(1);
    expect(summary.total).toBe(1);
  });

  it('never overwrites a local entity that shares an id (no replace)', () => {
    const local = { ...baseData(), notes: [note('a', { title: 'LOCAL', body: 'local' })] };
    const remote = { ...baseData(), notes: [note('a', { title: 'REMOTE', body: 'remote' })] };

    const { data, summary } = mergeAppendWorkspace(local, remote);

    expect(data.notes).toHaveLength(1);
    expect(data.notes[0]!.title).toBe('LOCAL');
    expect(summary.total).toBe(0);
  });

  it('is idempotent — merging the result again adds nothing', () => {
    const local = { ...baseData(), notes: [note('a')] };
    const remote = { ...baseData(), notes: [note('b'), note('c')] };

    const first = mergeAppendWorkspace(local, remote);
    const second = mergeAppendWorkspace(first.data, remote);

    expect(first.data.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(second.summary.total).toBe(0);
    expect(second.data.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('dedupes by content signature even when ids differ', () => {
    const local = { ...baseData(), notes: [note('local-1', { title: 'Same', body: 'x', bodyPlainText: 'x' })] };
    const remote = { ...baseData(), notes: [note('remote-1', { title: 'Same', body: 'x', bodyPlainText: 'x' })] };

    const { data, summary } = mergeAppendWorkspace(local, remote);

    expect(data.notes).toHaveLength(1);
    expect(summary.notes).toBe(0);
  });

  it('does not delete local items missing from remote (additive only)', () => {
    const local = { ...baseData(), notes: [note('a'), note('b')] };
    const remote = { ...baseData(), notes: [note('a')] };

    const { data } = mergeAppendWorkspace(local, remote);

    expect(data.notes.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('appends todos with their planning flags intact', () => {
    const local = { ...baseData(), todoGroups: [], todoItems: [] };
    const remote = {
      ...baseData(),
      todoItems: [todo('t1', { planInHub: true, planImportant: true, planFocusToday: true })],
    };

    const { data, summary } = mergeAppendWorkspace(local, remote);

    expect(summary.todoItems).toBe(1);
    expect(data.todoItems[0]!.planInHub).toBe(true);
    expect(data.todoItems[0]!.planImportant).toBe(true);
    expect(data.todoItems[0]!.planFocusToday).toBe(true);
  });

  it('preserves locked-note ciphers and attachment refs on import', () => {
    const lockedRemote = note('locked-1', {
      locked: true,
      body: '',
      bodyPlainText: undefined,
      cipher: { ivB64: 'iv', cipherB64: 'cipher' },
      lockedBodySignature: 'sig',
      attachmentRefs: ['att-1', 'att-2'],
    });
    const local = baseData();
    const remote = { ...baseData(), notes: [lockedRemote] };

    const { data } = mergeAppendWorkspace(local, remote);

    expect(data.notes[0]!.locked).toBe(true);
    expect(data.notes[0]!.cipher).toEqual({ ivB64: 'iv', cipherB64: 'cipher' });
    expect(data.notes[0]!.attachmentRefs).toEqual(['att-1', 'att-2']);
  });

  it('keeps local singletons (profile / lastTeamId) and ignores remote ones', () => {
    const local = { ...baseData(), lastTeamId: 'local-team', profile: { displayName: 'Local Me', favoriteTeamIds: [] } };
    const remote = {
      ...baseData(),
      lastTeamId: 'remote-team',
      profile: { displayName: 'Remote Me', favoriteTeamIds: [] },
    };

    const { data } = mergeAppendWorkspace(local, remote);

    expect(data.lastTeamId).toBe('local-team');
    expect(data.profile?.displayName).toBe('Local Me');
  });

  it('unions notifiedReminderIds without duplicates', () => {
    const local = { ...baseData(), notifiedReminderIds: ['r1', 'r2'] };
    const remote = { ...baseData(), notifiedReminderIds: ['r2', 'r3'] };

    const { data, summary } = mergeAppendWorkspace(local, remote);

    expect(data.notifiedReminderIds).toEqual(['r1', 'r2', 'r3']);
    expect(summary.notifiedReminderIds).toBe(1);
  });

  it('does not mutate the input workspaces', () => {
    const local = { ...baseData(), notes: [note('a')] };
    const remote = { ...baseData(), notes: [note('b')] };
    const localNotesRef = local.notes;

    mergeAppendWorkspace(local, remote);

    expect(local.notes).toBe(localNotesRef);
    expect(local.notes).toHaveLength(1);
  });

  it('describes an empty merge and a populated one', () => {
    expect(describeMergeSummary({
      notes: 0, noteGroups: 0, todoItems: 0, todoGroups: 0, items: 0, people: 0, teams: 0,
      notifiedReminderIds: 0, total: 0,
    })).toMatch(/up to date/i);

    expect(describeMergeSummary({
      notes: 2, noteGroups: 0, todoItems: 1, todoGroups: 0, items: 0, people: 0, teams: 0,
      notifiedReminderIds: 0, total: 3,
    })).toBe('Imported 2 notes, 1 to-do.');
  });
});
