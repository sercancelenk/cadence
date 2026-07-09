import { describe, expect, it, vi } from 'vitest';
import * as uuidModule from '../../lib/uuid';
import {
  emptyData,
  getSelfPerson,
  isLeaderPerson,
  isSelfPerson,
  isSkipLevelPerson,
  leaderPersonIdForTeam,
  selfPersonIdForTeam,
  skipLevelPersonIdForTeam,
  type AppData,
  type AISettings,
  type ItemKind,
  type Note,
  type NotesLock,
} from '../model';
import {
  addItem,
  addNote,
  addNoteGroup,
  addPerson,
  addTeam,
  addTodoGroup,
  addTodoItem,
  clearCompletedInGroup,
  markAllCompleteInGroup,
  moveTodoGroup,
  patchNote,
  patchUtilityDocument,
  patchUtilityStructuredText,
  removeItem,
  removeNote,
  removePerson,
  removeTeam,
  removeTodoGroup,
  reorderTodoGroup,
  reorderTodoItem,
  replaceNote,
  setLastTeamId,
  setNotesLock,
  setTodoStatus,
  toggleFavoriteTeam,
  toggleItemDone,
  toggleTodoItem,
  updateAISettings,
  updateItem,
  updatePerson,
  updateTeam,
  updateTodoGroup,
  updateTodoGroupPriority,
  updateTodoItem,
  updateUserProfile,
} from './index';
import { reminderNotifyKey } from '../../lib/reminderNotify';

function firstTeamId(d: AppData): string {
  const id = d.teams[0]?.id;
  if (!id) throw new Error('expected team');
  return id;
}

function firstGroupId(d: AppData): string {
  const id = d.todoGroups[0]?.id;
  if (!id) throw new Error('expected todo group');
  return id;
}

function selfId(d: AppData, teamId?: string): string {
  const tid = teamId ?? firstTeamId(d);
  const p = getSelfPerson(d, tid);
  if (!p) throw new Error('expected self person');
  return p.id;
}

describe('teams', () => {
  it('addTeam creates team, self, leader, skip-level, and selects it', () => {
    const base = emptyData();
    const next = addTeam(base, '  Sales  ');
    expect(next.teams).toHaveLength(2);
    const team = next.teams.find((t) => t.name === 'Sales');
    expect(team).toBeTruthy();
    expect(next.lastTeamId).toBe(team!.id);
    const self = next.people.find((p) => p.teamId === team!.id && isSelfPerson(p));
    const leader = next.people.find((p) => p.teamId === team!.id && isLeaderPerson(p));
    const skipLevel = next.people.find((p) => p.teamId === team!.id && isSkipLevelPerson(p));
    expect(self?.name).toBe('Me');
    expect(leader?.name).toBe('My leader');
    expect(skipLevel?.name).toBe('Skip-level leader');
    expect(self?.id).toBe(selfPersonIdForTeam(team!.id));
    expect(leader?.id).toBe(leaderPersonIdForTeam(team!.id));
    expect(skipLevel?.id).toBe(skipLevelPersonIdForTeam(team!.id));
  });

  it('addTeam uses default name when blank', () => {
    const base = emptyData();
    const next = addTeam(base, '   ');
    const added = next.teams.find((t) => t.id !== firstTeamId(base));
    expect(added?.name).toBe('New team');
  });

  it('updateTeam trims name and updates status', () => {
    const base = emptyData();
    const teamId = firstTeamId(base);
    const next = updateTeam(base, teamId, { name: '  Renamed  ', status: 'paused' });
    const team = next.teams.find((t) => t.id === teamId);
    expect(team?.name).toBe('Renamed');
    expect(team?.status).toBe('paused');
  });

  it('updateTeam keeps name when patch is whitespace only', () => {
    const base = emptyData();
    const teamId = firstTeamId(base);
    const original = base.teams.find((t) => t.id === teamId)!.name;
    const next = updateTeam(base, teamId, { name: '   ' });
    expect(next.teams.find((t) => t.id === teamId)?.name).toBe(original);
  });

  it('removeTeam cascades people, items, favorites, and lastTeamId', () => {
    const base = emptyData();
    const firstId = firstTeamId(base);
    let d = addTeam(base, 'Second');
    const secondId = d.lastTeamId!;
    const secondSelf = selfId(d, secondId);
    d = addItem(d, secondSelf, 'task', { title: 'On second team' });
    d = {
      ...d,
      profile: { displayName: 'Me', favoriteTeamIds: [secondId, firstId] },
      lastTeamId: secondId,
    };
    const itemOnSecond = d.items.find((i) => i.personId === secondSelf)!;
    const notifyKey = reminderNotifyKey(itemOnSecond.id, '2030-01-01T00:00:00.000Z');
    d = { ...d, notifiedReminderIds: [notifyKey] };

    const next = removeTeam(d, secondId);
    expect(next.teams.some((t) => t.id === secondId)).toBe(false);
    expect(next.people.every((p) => p.teamId !== secondId)).toBe(true);
    expect(next.items.every((i) => i.personId !== secondSelf)).toBe(true);
    expect(next.lastTeamId).toBe(firstId);
    expect(next.profile?.favoriteTeamIds).not.toContain(secondId);
    expect(next.notifiedReminderIds).not.toContain(notifyKey);
  });
});

describe('people', () => {
  it('addPerson no-ops for unknown team', () => {
    const base = emptyData();
    const next = addPerson(base, 'missing-team', 'Jane');
    expect(next.people).toHaveLength(base.people.length);
  });

  it('addPerson trims name and stores title', () => {
    const base = emptyData();
    const teamId = firstTeamId(base);
    const next = addPerson(base, teamId, '  Alex  ', '  PM  ');
    const added = next.people.find((p) => p.name === 'Alex');
    expect(added?.title).toBe('PM');
    expect(added?.teamId).toBe(teamId);
  });

  it('addPerson uses Unnamed for blank name', () => {
    const base = emptyData();
    const next = addPerson(base, firstTeamId(base), '  ');
    expect(next.people.some((p) => p.name === 'Unnamed')).toBe(true);
  });

  it('updatePerson preserves self name when patch is empty', () => {
    const base = emptyData();
    const id = selfId(base);
    const next = updatePerson(base, id, { name: '   ' });
    expect(next.people.find((p) => p.id === id)?.name).toBe('Me');
  });

  it('updatePerson allows renaming regular member', () => {
    const base = emptyData();
    let d = addPerson(base, firstTeamId(base), 'Pat');
    const pat = d.people.find((p) => p.name === 'Pat')!;
    d = updatePerson(d, pat.id, { name: '  Patrice  ', scratchpad: 'notes' });
    const updated = d.people.find((p) => p.id === pat.id);
    expect(updated?.name).toBe('Patrice');
    expect(updated?.scratchpad).toBe('notes');
  });

  it('removePerson refuses self, leader, and skip-level', () => {
    const base = emptyData();
    const teamId = firstTeamId(base);
    expect(removePerson(base, selfPersonIdForTeam(teamId))).toBe(base);
    expect(removePerson(base, leaderPersonIdForTeam(teamId))).toBe(base);
    expect(removePerson(base, skipLevelPersonIdForTeam(teamId))).toBe(base);
  });

  it('setLastTeamId no-ops for unknown team', () => {
    const base = emptyData();
    expect(setLastTeamId(base, 'nope')).toBe(base);
  });

  it('setLastTeamId updates and clears selection', () => {
    const base = emptyData();
    let d = addTeam(base, 'Other');
    const otherId = d.lastTeamId!;
    d = setLastTeamId(d, undefined);
    expect(d.lastTeamId).toBeUndefined();
    d = setLastTeamId(d, otherId);
    expect(d.lastTeamId).toBe(otherId);
  });
});

describe('workspace items', () => {
  const kinds = ['task', 'note', 'goal', 'document', 'feedback'] as const;

  it.each(kinds)('addItem creates %s with kind-specific defaults', (kind) => {
    const base = emptyData();
    const personId = selfId(base);
    const next = addItem(base, personId, kind, { title: `My ${kind}` });
    const item = next.items.find((i) => i.title === `My ${kind}`);
    expect(item?.kind).toBe(kind);
    expect(item?.personId).toBe(personId);
    if (kind === 'goal') {
      expect(item?.goalStatus).toBe('planned');
      expect(item?.done).toBe(false);
    }
    if (kind === 'feedback') {
      expect(item?.feedbackKind).toBe('coaching');
    }
    if (kind === 'document') {
      expect(item?.url).toBeUndefined();
    }
  });

  it('addItem no-ops for unknown person', () => {
    const base = emptyData();
    const next = addItem(base, 'ghost', 'task', { title: 'X' });
    expect(next.items).toHaveLength(0);
  });

  it('addItem uses default title when title omitted', () => {
    const base = emptyData();
    const personId = selfId(base);
    const next = addItem(base, personId, 'note', {});
    expect(next.items[0]?.title).toBe('New note');
  });

  it('addItem uses kind default titles when title is blank', () => {
    const base = emptyData();
    const personId = selfId(base);
    const titles: Record<(typeof kinds)[number], string> = {
      task: 'New task',
      note: 'New note',
      goal: 'New goal',
      document: 'New document',
      feedback: 'New feedback',
    };
    for (const kind of kinds) {
      const next = addItem(base, personId, kind, { title: '   ' });
      expect(next.items[0]?.title).toBe(titles[kind]);
    }
  });

  it('addItem uses generic default title for an unknown kind', () => {
    const base = emptyData();
    const personId = selfId(base);
    const next = addItem(base, personId, 'bogus' as ItemKind, {});
    expect(next.items[0]?.title).toBe('New item');
  });

  it('addItem drops stale notify ids that equal the new item id', () => {
    const base = emptyData();
    const personId = selfId(base);
    vi.spyOn(uuidModule, 'uuid').mockReturnValue('new-item-id');
    const d = addItem(
      { ...base, notifiedReminderIds: ['new-item-id', 'keep-me'] },
      personId,
      'task',
      { title: 'Fresh' },
    );
    expect(d.notifiedReminderIds).toEqual(['keep-me']);
    vi.restoreAllMocks();
  });

  it('addItem applies goal status, feedback kind, remind repeat, document url', () => {
    const base = emptyData();
    const personId = selfId(base);
    let d = addItem(base, personId, 'goal', {
      title: 'G',
      goalStatus: 'active',
      startAt: '2030-01-01T00:00:00.000Z',
    });
    const goal = d.items.find((i) => i.title === 'G');
    expect(goal?.goalStatus).toBe('active');
    expect(goal?.startAt).toBe('2030-01-01T00:00:00.000Z');

    d = addItem(d, personId, 'feedback', { feedbackKind: 'praise' });
    expect(d.items.find((i) => i.feedbackKind === 'praise')).toBeTruthy();

    d = addItem(d, personId, 'task', {
      remindAt: '2030-06-01T10:00:00.000Z',
      remindRepeat: 'weekly',
    });
    const task = d.items.find((i) => i.remindRepeat === 'weekly');
    expect(task?.remindAt).toBe('2030-06-01T10:00:00.000Z');

    d = addItem(d, personId, 'document', { url: '  https://x.test  ' });
    expect(d.items.find((i) => i.kind === 'document')?.url).toBe('https://x.test');
  });

  it('addItem rejects invalid goal and feedback enums', () => {
    const base = emptyData();
    const personId = selfId(base);
    const g = addItem(base, personId, 'goal', { goalStatus: 'bogus' as 'planned' });
    expect(g.items[0]?.goalStatus).toBe('planned');
    const f = addItem(base, personId, 'feedback', { feedbackKind: 'bogus' as 'praise' });
    expect(f.items[0]?.feedbackKind).toBe('coaching');
  });

  it('updateItem syncs goal status with done and stamps doneAt', () => {
    const base = emptyData();
    const personId = selfId(base);
    let d = addItem(base, personId, 'goal', { title: 'Ship' });
    const id = d.items[0]!.id;
    d = updateItem(d, id, { goalStatus: 'completed' });
    let item = d.items.find((i) => i.id === id);
    expect(item?.done).toBe(true);
    expect(item?.doneAt).toBeTruthy();

    d = updateItem(d, id, { done: false });
    item = d.items.find((i) => i.id === id);
    expect(item?.goalStatus).toBe('active');
    expect(item?.doneAt).toBeUndefined();
  });

  it('updateItem marks non-goal task done with doneAt', () => {
    const base = emptyData();
    let d = addItem(base, selfId(base), 'task', { title: 'T' });
    const id = d.items[0]!.id;
    d = updateItem(d, id, { done: true });
    const item = d.items.find((i) => i.id === id);
    expect(item?.done).toBe(true);
    expect(item?.doneAt).toBeTruthy();
  });

  it('toggleItemDone toggles task and goal only', () => {
    const base = emptyData();
    const personId = selfId(base);
    let d = addItem(base, personId, 'task', { title: 'Task' });
    const taskId = d.items.find((i) => i.kind === 'task')!.id;
    d = toggleItemDone(d, taskId);
    expect(d.items.find((i) => i.id === taskId)?.done).toBe(true);
    d = toggleItemDone(d, taskId);
    expect(d.items.find((i) => i.id === taskId)?.done).toBe(false);

    d = addItem(d, personId, 'goal', { title: 'Goal' });
    const goalId = d.items.find((i) => i.kind === 'goal')!.id;
    d = toggleItemDone(d, goalId);
    expect(d.items.find((i) => i.id === goalId)?.goalStatus).toBe('completed');

    d = addItem(d, personId, 'note', { title: 'Note' });
    const noteId = d.items.find((i) => i.kind === 'note')!.id;
    expect(toggleItemDone(d, noteId)).toBe(d);
  });

  it('removeItem clears reminder notify keys', () => {
    const base = emptyData();
    let d = addItem(base, selfId(base), 'task', {
      title: 'R',
      remindAt: '2030-06-01T10:00:00.000Z',
    });
    const id = d.items[0]!.id;
    const key = reminderNotifyKey(id, '2030-06-01T10:00:00.000Z');
    d = { ...d, notifiedReminderIds: [key] };
    const next = removeItem(d, id);
    expect(next.items).toHaveLength(0);
    expect(next.notifiedReminderIds).not.toContain(key);
  });
});

describe('profile and AI settings', () => {
  it('updateUserProfile trims fields and validates avatar', () => {
    const base = emptyData();
    let d = updateUserProfile(base, {
      displayName: '  Sam  ',
      jobTitle: '  Lead  ',
      bio: '  About  ',
      avatarDataUrl: 'not-data',
    });
    expect(d.profile?.displayName).toBe('Sam');
    expect(d.profile?.jobTitle).toBe('Lead');
    expect(d.profile?.bio).toBe('About');
    expect(d.profile?.avatarDataUrl).toBeUndefined();

    d = updateUserProfile(d, { avatarDataUrl: 'data:image/png;base64,abc' });
    expect(d.profile?.avatarDataUrl).toBe('data:image/png;base64,abc');
  });

  it('updateUserProfile keeps displayName when patch is blank', () => {
    const base = emptyData();
    const next = updateUserProfile(base, { displayName: '   ' });
    expect(next.profile?.displayName).toBe('Me');
  });

  it('updateAISettings stores values and clears when empty', () => {
    const base = emptyData();
    let d = updateAISettings(base, {
      provider: 'openai',
      apiKey: '  key  ',
      model: '  gpt-4  ',
      systemPrompt: '  Be helpful  ',
    });
    expect(d.aiSettings?.provider).toBe('openai');
    expect(d.aiSettings?.apiKey).toBe('key');

    d = updateAISettings(d, {
      provider: '' as never,
      apiKey: '',
      model: '',
      systemPrompt: '',
    } satisfies Partial<AISettings>);
    expect(d.aiSettings).toBeUndefined();
  });

  it('updateAISettings preserves extractionGuidance when saving other fields', () => {
    let d = updateAISettings(emptyData(), { extractionGuidance: 'Only action items' });
    expect(d.aiSettings?.extractionGuidance).toBe('Only action items');
    // Saving provider/apiKey from the Settings page must NOT wipe the guidance.
    d = updateAISettings(d, { provider: 'openai', apiKey: 'key' });
    expect(d.aiSettings?.extractionGuidance).toBe('Only action items');
    expect(d.aiSettings?.provider).toBe('openai');
    // Passing an empty string explicitly clears the guidance.
    d = updateAISettings(d, { extractionGuidance: '' });
    expect(d.aiSettings?.extractionGuidance).toBeUndefined();
    expect(d.aiSettings?.provider).toBe('openai');
  });

  it('updateAISettings preserves unknown forward-compat fields', () => {
    const base = {
      ...emptyData(),
      aiSettings: { provider: 'openai', futureField: 'keep-me' } as unknown as AISettings,
    };
    const d = updateAISettings(base, { apiKey: 'key' });
    expect((d.aiSettings as Record<string, unknown>).futureField).toBe('keep-me');
  });

  it('toggleFavoriteTeam adds, removes, and prunes stale ids', () => {
    const base = emptyData();
    const teamId = firstTeamId(base);
    let d = toggleFavoriteTeam(base, teamId);
    expect(d.profile?.favoriteTeamIds).toEqual([teamId]);
    d = toggleFavoriteTeam(d, teamId);
    expect(d.profile?.favoriteTeamIds).toEqual([]);

    d = {
      ...base,
      profile: { displayName: 'Me', favoriteTeamIds: [teamId, 'stale-id'] },
    };
    d = toggleFavoriteTeam(d, teamId);
    expect(d.profile?.favoriteTeamIds).toEqual([]);
    expect(d.profile?.favoriteTeamIds).not.toContain('stale-id');
  });

  it('toggleFavoriteTeam no-ops for missing team', () => {
    const base = emptyData();
    expect(toggleFavoriteTeam(base, 'missing')).toBe(base);
  });
});

describe('todo groups', () => {
  it('addTodoGroup assigns sortOrder and accepts custom id', () => {
    const base = emptyData();
    const next = addTodoGroup(base, '  Work  ', 'custom-group');
    const g = next.todoGroups.find((x) => x.id === 'custom-group');
    expect(g?.name).toBe('Work');
    expect(g!.sortOrder).toBeGreaterThan(base.todoGroups[0]!.sortOrder);
  });

  it('updateTodoGroup handles pinned and archived flags', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = updateTodoGroup(base, gid, { pinned: true, archived: true });
    let g = d.todoGroups.find((x) => x.id === gid);
    expect(g?.pinned).toBe(true);
    expect(g?.archived).toBe(true);
    d = updateTodoGroup(d, gid, { pinned: false, archived: false });
    g = d.todoGroups.find((x) => x.id === gid);
    expect(g?.pinned).toBeUndefined();
    expect(g?.archived).toBeUndefined();
  });

  it('removeTodoGroup moves items to fallback and refuses last group', () => {
    const base = emptyData();
    const fallbackId = firstGroupId(base);
    let d = addTodoGroup(base, 'Extra');
    const extraId = d.todoGroups.find((g) => g.name === 'Extra')!.id;
    d = addTodoItem(d, extraId, 'In extra');
    const itemId = d.todoItems[0]!.id;
    d = removeTodoGroup(d, extraId);
    expect(d.todoGroups.some((g) => g.id === extraId)).toBe(false);
    expect(d.todoItems.find((t) => t.id === itemId)?.groupId).toBe(fallbackId);

    expect(removeTodoGroup(d, fallbackId)).toBe(d);
  });

  it('reorderTodoGroup moves unpinned group before another', () => {
    const base = emptyData();
    let d = addTodoGroup(base, 'A');
    d = addTodoGroup(d, 'B');
    const a = d.todoGroups.find((g) => g.name === 'A')!;
    const b = d.todoGroups.find((g) => g.name === 'B')!;
    d = reorderTodoGroup(d, b.id, a.id);
    const orders = d.todoGroups
      .filter((g) => g.id === a.id || g.id === b.id)
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((g) => g.id);
    expect(orders[0]).toBe(b.id);
    expect(orders[1]).toBe(a.id);
  });

  it('moveTodoGroup swaps sortOrder within pinned peers', () => {
    const base = emptyData();
    let d = addTodoGroup(base, 'P1');
    let p1 = d.todoGroups.find((g) => g.name === 'P1')!;
    d = updateTodoGroup(d, p1.id, { pinned: true });
    d = addTodoGroup(d, 'P2');
    const p2 = d.todoGroups.find((g) => g.name === 'P2')!;
    d = updateTodoGroup(d, p2.id, { pinned: true });
    const before = d.todoGroups.find((g) => g.id === p2.id)!.sortOrder;
    d = moveTodoGroup(d, p2.id, 'up');
    const after = d.todoGroups.find((g) => g.id === p2.id)!.sortOrder;
    expect(after).not.toBe(before);
  });

  it('clearCompletedInGroup removes done and cancelled only in target list', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Open');
    d = addTodoItem(d, gid, 'Done one');
    const doneId = d.todoItems.find((t) => t.title === 'Done one')!.id;
    d = setTodoStatus(d, doneId, 'done');
    d = addTodoItem(d, gid, 'Cancelled');
    const cancelId = d.todoItems.find((t) => t.title === 'Cancelled')!.id;
    d = setTodoStatus(d, cancelId, 'cancelled');
    d = addTodoGroup(d, 'Other');
    const otherGid = d.todoGroups.find((g) => g.name === 'Other')!.id;
    d = addTodoItem(d, otherGid, 'Done elsewhere');
    const otherDoneId = d.todoItems.find((t) => t.title === 'Done elsewhere')!.id;
    d = setTodoStatus(d, otherDoneId, 'done');

    const next = clearCompletedInGroup(d, gid);
    expect(next.todoItems.some((t) => t.title === 'Open')).toBe(true);
    expect(next.todoItems.some((t) => t.title === 'Done one')).toBe(false);
    expect(next.todoItems.some((t) => t.title === 'Cancelled')).toBe(false);
    expect(next.todoItems.some((t) => t.title === 'Done elsewhere')).toBe(true);
  });

  it('markAllCompleteInGroup completes open rows and skips cancelled', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Todo');
    d = addTodoItem(d, gid, 'WIP');
    const wipId = d.todoItems.find((t) => t.title === 'WIP')!.id;
    d = setTodoStatus(d, wipId, 'in_progress');
    d = addTodoItem(d, gid, 'Dropped');
    const droppedId = d.todoItems.find((t) => t.title === 'Dropped')!.id;
    d = setTodoStatus(d, droppedId, 'cancelled');

    const next = markAllCompleteInGroup(d, gid);
    expect(next.todoItems.find((t) => t.title === 'Todo')?.status).toBe('done');
    expect(next.todoItems.find((t) => t.title === 'WIP')?.status).toBe('done');
    expect(next.todoItems.find((t) => t.title === 'Dropped')?.status).toBe('cancelled');
  });
});

describe('todo items', () => {
  it('addTodoItem falls back to first group and links valid source note', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addNote(base, 'note-1');
    d = addTodoItem(d, 'bad-group', 'From note', { sourceNoteId: 'note-1', priority: 'high' });
    const item = d.todoItems.find((t) => t.title === 'From note');
    expect(item?.groupId).toBe(gid);
    expect(item?.sourceNoteId).toBe('note-1');
    expect(item?.priority).toBe('high');
  });

  it('addTodoItem drops stale sourceNoteId and empty body', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    const next = addTodoItem(base, gid, '  ', { body: '   ', sourceNoteId: 'missing' });
    const item = next.todoItems[0];
    expect(item?.title).toBe('Untitled task');
    expect(item?.body).toBeUndefined();
    expect(item?.sourceNoteId).toBeUndefined();
  });

  it('updateTodoItem clears remind fields when status is done', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Remind me');
    const id = d.todoItems[0]!.id;
    d = updateTodoItem(d, id, {
      remindAt: '2030-06-01T10:00:00.000Z',
      remindRepeat: 'daily',
    });
    d = setTodoStatus(d, id, 'done');
    const t = d.todoItems.find((x) => x.id === id);
    expect(t?.remindAt).toBeUndefined();
    expect(t?.remindRepeat).toBeUndefined();
  });

  it('updateTodoItem clears body format when body is cleared', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Rich', {
      body: '# Hi',
      bodyFormat: 'markdown',
      bodyPlainText: 'Hi',
    });
    const id = d.todoItems[0]!.id;
    d = updateTodoItem(d, id, { body: '   ' });
    const t = d.todoItems.find((x) => x.id === id);
    expect(t?.body).toBeUndefined();
    expect(t?.bodyFormat).toBeUndefined();
    expect(t?.bodyPlainText).toBeUndefined();
  });

  it('reorderTodoItem moves item across groups', () => {
    const base = emptyData();
    const g1 = firstGroupId(base);
    let d = addTodoGroup(base, 'Target');
    const g2 = d.todoGroups.find((g) => g.name === 'Target')!.id;
    d = addTodoItem(d, g1, 'Move me');
    const itemId = d.todoItems.find((t) => t.title === 'Move me')!.id;
    d = addTodoItem(d, g2, 'Anchor');
    const anchorId = d.todoItems.find((t) => t.title === 'Anchor')!.id;
    d = reorderTodoItem(d, itemId, g2, anchorId);
    const moved = d.todoItems.find((t) => t.id === itemId);
    expect(moved?.groupId).toBe(g2);
  });

  it('reorderTodoItem appends to end when beforeItemId is null', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'First');
    d = addTodoItem(d, gid, 'Last');
    const firstId = d.todoItems.find((t) => t.title === 'First')!.id;
    const lastId = d.todoItems.find((t) => t.title === 'Last')!.id;
    d = reorderTodoItem(d, firstId, gid, null);
    const orders = d.todoItems
      .filter((t) => t.groupId === gid)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((t) => t.id);
    expect(orders[orders.length - 1]).toBe(firstId);
    expect(orders).toContain(lastId);
  });

  it('updateTodoGroupPriority sets list priority', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    const next = updateTodoGroupPriority(base, gid, 'urgent');
    expect(next.todoGroups.find((g) => g.id === gid)?.priority).toBe('urgent');
  });

  it('toggleTodoItem flips done via legacy path', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Toggle');
    const id = d.todoItems[0]!.id;
    d = toggleTodoItem(d, id);
    expect(d.todoItems.find((t) => t.id === id)?.status).toBe('done');
    d = toggleTodoItem(d, id);
    expect(d.todoItems.find((t) => t.id === id)?.status).toBe('todo');
  });

  it('removeTodoItem is covered in actions.test; reorder no-op when same before id', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Solo');
    const id = d.todoItems[0]!.id;
    expect(reorderTodoItem(d, id, gid, id)).toBe(d);
  });

  it('reorderTodoItem is a no-op for missing item or unknown target group', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'Solo');
    const id = d.todoItems[0]!.id;
    expect(reorderTodoItem(d, 'missing-item', gid, null)).toBe(d);
    expect(reorderTodoItem(d, id, 'missing-group', null)).toBe(d);
  });

  it('setTodoStatus maps lifecycle without touching unrelated items', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'One');
    const id = d.todoItems[0]!.id;
    d = setTodoStatus(d, id, 'in_progress');
    expect(d.todoItems.find((t) => t.id === id)).toEqual(
      expect.objectContaining({ status: 'in_progress', done: false }),
    );
    d = setTodoStatus(d, id, 'done');
    expect(d.todoItems.find((t) => t.id === id)).toEqual(
      expect.objectContaining({ status: 'done', done: true }),
    );
  });

  it('reorderTodoItem prepends when beforeItemId is unknown in the target group', () => {
    const base = emptyData();
    const gid = firstGroupId(base);
    let d = addTodoItem(base, gid, 'First');
    d = addTodoItem(d, gid, 'Second');
    const secondId = d.todoItems.find((t) => t.title === 'Second')!.id;
    d = reorderTodoItem(d, secondId, gid, 'missing-anchor');
    const order = d.todoItems
      .filter((t) => t.groupId === gid)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((t) => t.title);
    expect(order[0]).toBe('Second');
  });
});

describe('notes and utilities', () => {
  it('addNote prepends blank note with caller id and no default list', () => {
    const base = emptyData();
    const next = addNote(base, 'n-1');
    const note = next.notes.find((n) => n.id === 'n-1');
    expect(note?.title).toBe('');
    expect(note?.locked).toBe(false);
    expect(note?.groupId).toBeUndefined();
    expect(next.noteGroups).toHaveLength(0);
    expect(next.notes[0]?.id).toBe('n-1');
  });

  it('replaceNote applies note fields; patchNote updates content flags', () => {
    const base = emptyData();
    let d = addNote(base, 'n-2');
    const created = d.notes.find((n) => n.id === 'n-2')!;
    const replaced: Note = { ...created, title: 'Title', body: 'Body' };
    d = replaceNote(d, replaced);
    const afterReplace = d.notes.find((n) => n.id === 'n-2')!;
    expect(afterReplace.title).toBe('Title');
    expect(afterReplace.body).toBe('Body');
    expect(afterReplace.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    d = patchNote(d, 'n-2', { title: 'Patched' });
    expect(d.notes.find((n) => n.id === 'n-2')?.title).toBe('Patched');
    d = patchNote(d, 'n-2', { pinned: true });
    expect(d.notes.find((n) => n.id === 'n-2')?.pinned).toBe(true);
  });

  it('patchNote assigns and clears note list membership', () => {
    let d = addNote(emptyData(), 'n-3');
    d = addNoteGroup(d, 'Inbox', 'list-1');
    d = patchNote(d, 'n-3', { groupId: 'list-1' });
    expect(d.notes.find((n) => n.id === 'n-3')?.groupId).toBe('list-1');
    d = patchNote(d, 'n-3', { groupId: 'missing-list' });
    expect(d.notes.find((n) => n.id === 'n-3')?.groupId).toBeUndefined();
    d = patchNote(d, 'n-3', { groupId: undefined });
    expect(d.notes.find((n) => n.id === 'n-3')?.groupId).toBeUndefined();
  });

  it('addNoteGroup creates a list with stable ordering', () => {
    const base = emptyData();
    const next = addNoteGroup(base, '  Ideas  ', 'list-a');
    expect(next.noteGroups).toHaveLength(1);
    expect(next.noteGroups[0]).toEqual(
      expect.objectContaining({ id: 'list-a', name: 'Ideas', sortOrder: expect.any(Number) }),
    );
  });

  it('removeNote drops note from list', () => {
    const base = emptyData();
    const d = addNote(base, 'gone');
    const next = removeNote(d, 'gone');
    expect(next.notes).toHaveLength(0);
  });

  it('setNotesLock sets and clears lock envelope', () => {
    const base = emptyData();
    const lock: NotesLock = {
      saltB64: 's',
      verifierIvB64: 'iv',
      verifierCipherB64: 'c',
    };
    let d = setNotesLock(base, lock);
    expect(d.notesLock).toEqual(lock);
    d = setNotesLock(d, undefined);
    expect('notesLock' in d).toBe(false);
  });

  it('patchUtilityDocument creates and updates scratch doc', () => {
    const base = emptyData();
    let d = patchUtilityDocument(base, { body: 'Hello', bodyFormat: 'markdown' });
    expect(d.utilityDocument?.body).toBe('Hello');
    expect(d.utilityDocument?.bodyFormat).toBe('markdown');
    d = patchUtilityDocument(d, { bodyPlainText: 'Hello' });
    expect(d.utilityDocument?.bodyPlainText).toBe('Hello');
    expect(d.utilityDocument?.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('patchUtilityStructuredText normalizes language', () => {
    const base = emptyData();
    let d = patchUtilityStructuredText(base, { content: '{ }', language: 'yaml' });
    expect(d.utilityStructuredText?.language).toBe('yaml');
    d = patchUtilityStructuredText(d, { language: 'bogus' as 'json' });
    expect(d.utilityStructuredText?.language).toBe('yaml');
    d = patchUtilityStructuredText(d, { diffContent: '[]', language: 'json' });
    expect(d.utilityStructuredText?.diffContent).toBe('[]');
    expect(d.utilityStructuredText?.language).toBe('json');
    d = patchUtilityStructuredText(d, { diffContentLeft: '{"left":true}\n' });
    expect(d.utilityStructuredText?.diffContentLeft).toBe('{"left":true}\n');
  });

  it('patchUtilityStructuredText seeds default content when first write is diff-only', () => {
    const base = emptyData();
    const d = patchUtilityStructuredText(base, { diffContent: '{"a":1}\n' });
    expect(d.utilityStructuredText?.content).toBe('{\n}\n');
    expect(d.utilityStructuredText?.diffContent).toBe('{"a":1}\n');
  });
});
