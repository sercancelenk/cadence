// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as uuidModule from '../../lib/uuid';
import * as modelModule from '../model';
import {
  emptyData,
  getSelfPerson,
  isLeaderPerson,
  isSelfPerson,
  leaderPersonIdForTeam,
  selfPersonIdForTeam,
  type AppData,
  type Item,
  type ItemKind,
  type Note,
  type NotesLock,
  type TodoItem,
} from '../model';
import {
  addItem,
  addNote,
  addPerson,
  addTeam,
  addTodoGroup,
  addTodoItem,
  moveTodoGroup,
  patchNote,
  patchUtilityDocument,
  patchUtilityStructuredText,
  removeItem,
  removeNote,
  removePerson,
  removeTeam,
  removeTodoGroup,
  removeTodoItem,
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
  updateTodoItem,
  updateUserProfile,
} from './index';
import { reminderNotifyKey } from '../../lib/reminderNotify';

const FIXED_NOW = '2026-06-03T12:00:00.000Z';

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

function itemById(d: AppData, id: string): Item {
  const it = d.items.find((i) => i.id === id);
  if (!it) throw new Error(`missing item ${id}`);
  return it;
}

function todoById(d: AppData, id: string): TodoItem {
  const t = d.todoItems.find((x) => x.id === id);
  if (!t) throw new Error(`missing todo ${id}`);
  return t;
}

function latestItem(d: AppData): Item {
  const it = d.items[0];
  if (!it) throw new Error('expected item');
  return it;
}

function latestTodo(d: AppData): TodoItem {
  const t = d.todoItems[0];
  if (!t) throw new Error('expected todo');
  return t;
}

function freshData(): AppData {
  return emptyData();
}

describe('actions mutation — deterministic reducers', () => {
  let uuidSeq = 0;

  beforeEach(() => {
    uuidSeq = 0;
    vi.spyOn(uuidModule, 'uuid').mockImplementation(() => `mut-id-${++uuidSeq}`);
    vi.spyOn(modelModule, 'nowIso').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('addItem', () => {
    const kinds: ItemKind[] = ['task', 'note', 'goal', 'document', 'feedback'];
    const defaultTitles: Record<ItemKind, string> = {
      task: 'New task',
      note: 'New note',
      goal: 'New goal',
      document: 'New document',
      feedback: 'New feedback',
    };

    it.each(kinds)('creates %s with exact defaults', (kind) => {
      const base = emptyData();
      const personId = selfId(base);
      const next = addItem(base, personId, kind, { title: '   ' });
      expect(next.items).toHaveLength(1);
      expect(next.items[0]).toEqual({
        id: 'mut-id-1',
        personId,
        kind,
        title: defaultTitles[kind],
        body: '',
        category: undefined,
        dueAt: undefined,
        startAt: undefined,
        goalStatus: kind === 'goal' ? 'planned' : undefined,
        feedbackKind: kind === 'feedback' ? 'coaching' : undefined,
        remindAt: undefined,
        remindRepeat: undefined,
        url: undefined,
        done: false,
        doneAt: undefined,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });

    it('no-ops when person is missing', () => {
      const base = emptyData();
      expect(addItem(base, 'missing-person', 'task', { title: 'X' })).toEqual(base);
    });

    it('applies goal, feedback, remind repeat, and document url exactly', () => {
      const base = emptyData();
      const personId = selfId(base);
      let d = addItem(base, personId, 'goal', {
        goalStatus: 'active',
        startAt: '2030-01-01T00:00:00.000Z',
        title: '  Goal  ',
      });
      expect(itemById(d, 'mut-id-1')).toEqual({
        id: 'mut-id-1',
        personId,
        kind: 'goal',
        title: 'Goal',
        body: '',
        category: undefined,
        dueAt: undefined,
        startAt: '2030-01-01T00:00:00.000Z',
        goalStatus: 'active',
        feedbackKind: undefined,
        remindAt: undefined,
        remindRepeat: undefined,
        url: undefined,
        done: false,
        doneAt: undefined,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });

      d = addItem(d, personId, 'feedback', { feedbackKind: 'praise', title: 'Fb' });
      expect(itemById(d, 'mut-id-2').feedbackKind).toBe('praise');

      d = addItem(d, personId, 'task', {
        remindAt: '2030-06-01T10:00:00.000Z',
        remindRepeat: 'weekly',
      });
      expect(itemById(d, 'mut-id-3')).toMatchObject({
        remindAt: '2030-06-01T10:00:00.000Z',
        remindRepeat: 'weekly',
      });

      d = addItem(d, personId, 'document', { url: '  https://doc.test  ' });
      expect(itemById(d, 'mut-id-4').url).toBe('https://doc.test');

      const invalidGoal = addItem(base, personId, 'goal', { goalStatus: 'bogus' as 'planned' });
      expect(itemById(invalidGoal, 'mut-id-1').goalStatus).toBe('planned');

      const invalidFb = addItem(base, personId, 'feedback', { feedbackKind: 'bogus' as 'praise' });
      expect(itemById(invalidFb, 'mut-id-1').feedbackKind).toBe('coaching');

      const noRepeat = addItem(base, personId, 'task', { remindRepeat: 'weekly' });
      expect(itemById(noRepeat, 'mut-id-1').remindRepeat).toBeUndefined();
    });

    it('filters notifiedReminderIds that equal the new item id', () => {
      const base = emptyData();
      const personId = selfId(base);
      const next = addItem(
        { ...base, notifiedReminderIds: ['mut-id-1', 'keep'] },
        personId,
        'task',
        { title: 'T' },
      );
      expect(next.notifiedReminderIds).toEqual(['keep']);
    });
  });

  describe('updateItem', () => {
    it.each([
      { patch: { goalStatus: 'completed' as const }, done: true, goalStatus: 'completed' as const, doneAt: FIXED_NOW },
      { patch: { goalStatus: 'active' as const }, done: false, goalStatus: 'active' as const, doneAt: undefined },
      { patch: { done: true }, done: true, goalStatus: 'completed' as const, doneAt: FIXED_NOW },
      { patch: { done: false }, done: false, goalStatus: 'active' as const, doneAt: undefined },
    ])('goal transition %# preserves done sync', ({ patch, done, goalStatus, doneAt }) => {
      const base = emptyData();
      let d = addItem(base, selfId(base), 'goal', { title: 'G' });
      const id = 'mut-id-1';
      if (patch.done === false || patch.goalStatus === 'active') {
        d = updateItem(d, id, { goalStatus: 'completed' });
      }
      d = updateItem(d, id, patch);
      expect(itemById(d, id)).toMatchObject({ done, goalStatus, doneAt });
    });

    it('task done transition sets and clears doneAt', () => {
      const base = emptyData();
      let d = addItem(base, selfId(base), 'task', { title: 'T' });
      const id = 'mut-id-1';
      d = updateItem(d, id, { done: true });
      expect(itemById(d, id).doneAt).toBe(FIXED_NOW);
      d = updateItem(d, id, { done: false });
      expect(itemById(d, id)).toMatchObject({ done: false, doneAt: undefined });
    });

    it('clears remindRepeat when remindAt is cleared', () => {
      const base = emptyData();
      let d = addItem(base, selfId(base), 'task', {
        remindAt: '2030-06-01T10:00:00.000Z',
        remindRepeat: 'daily',
      });
      const id = 'mut-id-1';
      d = updateItem(d, id, { remindAt: '' });
      expect(itemById(d, id)).toMatchObject({ remindAt: undefined, remindRepeat: undefined });
    });

    it('keeps feedbackKind default on feedback items', () => {
      const base = emptyData();
      let d = addItem(base, selfId(base), 'feedback', {});
      const id = 'mut-id-1';
      d = updateItem(d, id, {});
      expect(itemById(d, id).feedbackKind).toBe('coaching');
    });

    it.each([
      {
        label: 'remindAt change',
        patch: { remindAt: '2030-06-02T10:00:00.000Z' },
        expectCleared: true,
      },
      {
        label: 'dueAt change only',
        patch: { dueAt: '2030-06-15T12:00:00.000Z' },
        expectCleared: false,
      },
    ])('notify keys: $label', ({ patch, expectCleared }) => {
      const base = emptyData();
      const personId = selfId(base);
      const itemId = 'item-fixed';
      const remindAt = '2030-06-01T10:00:00.000Z';
      const key = reminderNotifyKey(itemId, remindAt);
      const d: AppData = {
        ...addItem(base, personId, 'task', { title: 'T' }),
        items: [
          {
            id: itemId,
            personId,
            kind: 'task',
            title: 'T',
            body: '',
            done: false,
            remindAt,
            createdAt: FIXED_NOW,
            updatedAt: FIXED_NOW,
          },
        ],
        notifiedReminderIds: [key],
      };
      const next = updateItem(d, itemId, patch);
      if (expectCleared) {
        expect(next.notifiedReminderIds).toEqual([]);
      } else {
        expect(next.notifiedReminderIds).toEqual([key]);
      }
    });

    it('clears notify when remindRepeat changes', () => {
      const base = emptyData();
      const personId = selfId(base);
      const itemId = 'item-fixed';
      const remindAt = '2030-06-01T10:00:00.000Z';
      const key = reminderNotifyKey(itemId, remindAt);
      let d = addItem(base, personId, 'task', { remindAt, remindRepeat: 'daily' });
      d = {
        ...d,
        items: d.items.map((i) => (i.id === 'mut-id-1' ? { ...i, id: itemId } : i)),
        notifiedReminderIds: [key],
      };
      const next = updateItem(d, itemId, { remindRepeat: 'weekly' });
      expect(next.notifiedReminderIds).toEqual([]);
    });

    it('removes legacy notify id when marking task done', () => {
      const base = emptyData();
      const personId = selfId(base);
      const itemId = 'item-fixed';
      let d = addItem(base, personId, 'task', { title: 'T' });
      d = {
        ...d,
        items: d.items.map((i) => (i.id === 'mut-id-1' ? { ...i, id: itemId } : i)),
        notifiedReminderIds: [itemId],
      };
      const next = updateItem(d, itemId, { done: true });
      expect(next.notifiedReminderIds).toEqual([]);
    });
  });

  describe('removeTeam', () => {
    it('cascades people, items, favorites, lastTeamId, and notify keys', () => {
      const base = emptyData();
      const firstId = firstTeamId(base);
      let d = addTeam(base, 'Second');
      const secondId = d.lastTeamId!;
      const secondSelf = selfId(d, secondId);
      d = addItem(d, secondSelf, 'task', { title: 'On second' });
      const item = itemById(d, 'mut-id-1');
      const notifyKey = reminderNotifyKey(item.id, '2030-01-01T00:00:00.000Z');
      d = {
        ...d,
        profile: { displayName: 'Me', favoriteTeamIds: [secondId, firstId] },
        lastTeamId: secondId,
        notifiedReminderIds: [notifyKey],
      };

      const next = removeTeam(d, secondId);
      expect(next.teams.map((t) => t.id)).toEqual([firstId]);
      expect(next.people.every((p) => p.teamId !== secondId)).toBe(true);
      expect(next.items).toEqual([]);
      expect(next.lastTeamId).toBe(firstId);
      expect(next.profile).toEqual({ displayName: 'Me', favoriteTeamIds: [firstId] });
      expect(next.notifiedReminderIds).toEqual([]);
    });
  });

  describe('updateTodoItem / setTodoStatus', () => {
    it.each([
      { patch: { status: 'done' as const }, status: 'done', done: true },
      { patch: { status: 'in_progress' as const }, status: 'in_progress', done: false },
      { patch: { done: true }, status: 'done', done: true },
      { patch: { done: false }, status: 'todo', done: false },
    ])('status/done sync %#', ({ patch, status, done }) => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'Row');
      const id = 'mut-id-1';
      d = updateTodoItem(d, id, patch);
      expect(todoById(d, id)).toMatchObject({ status, done, doneAt: done ? FIXED_NOW : undefined });
    });

    it('status wins over done when both are passed', () => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'Row');
      const id = 'mut-id-1';
      d = updateTodoItem(d, id, { status: 'in_progress', done: true });
      expect(todoById(d, id)).toMatchObject({ status: 'in_progress', done: false, doneAt: undefined });
    });

    it('preserves doneAt when already done', () => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'Row');
      const id = 'mut-id-1';
      d = updateTodoItem(d, id, { status: 'done' });
      const firstDoneAt = todoById(d, id).doneAt;
      vi.spyOn(modelModule, 'nowIso').mockReturnValue('2030-01-02T00:00:00.000Z');
      d = updateTodoItem(d, id, { title: 'Still done' });
      expect(todoById(d, id).doneAt).toBe(firstDoneAt);
    });

    it('clears body format fields when body is whitespace', () => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'Rich', {
        body: '# Hi',
        bodyFormat: 'markdown',
        bodyPlainText: 'Hi',
      });
      const id = 'mut-id-1';
      d = updateTodoItem(d, id, { body: '   ' });
      expect(todoById(d, id)).toMatchObject({
        body: undefined,
        bodyFormat: undefined,
        bodyPlainText: undefined,
      });
    });

    it.each([
      {
        label: 'remindAt',
        patch: { remindAt: '2030-06-02T10:00:00.000Z' },
        expectCleared: true,
      },
      {
        label: 'dueAt only',
        patch: { dueAt: '2030-06-20T10:00:00.000Z' },
        expectCleared: false,
      },
    ])('todo notify: $label', ({ patch, expectCleared }) => {
      const base = emptyData();
      const gid = firstGroupId(base);
      let d = addTodoItem(base, gid, 'Row');
      const id = 'mut-id-1';
      const remindAt = '2030-06-01T10:00:00.000Z';
      d = updateTodoItem(d, id, { remindAt });
      const key = reminderNotifyKey(id, remindAt);
      d = { ...d, notifiedReminderIds: [key] };
      const next = updateTodoItem(d, id, patch);
      expect(next.notifiedReminderIds).toEqual(expectCleared ? [] : [key]);
    });
  });

  describe('reorderTodoGroup / reorderTodoItem', () => {
    it('no-ops when group drags onto itself', () => {
      const base = emptyData();
      const gid = firstGroupId(base);
      expect(reorderTodoGroup(base, gid, gid)).toEqual(base);
    });

    it('no-ops when item drags onto itself', () => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'Solo');
      const id = 'mut-id-1';
      const gid = firstGroupId(d);
      expect(reorderTodoItem(d, id, gid, id)).toEqual(d);
    });

    it('no-ops when target group is missing', () => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'Solo');
      const id = 'mut-id-1';
      expect(reorderTodoItem(d, id, 'missing-group', null)).toEqual(d);
    });

    it('moves group to end when beforeGroupId is null', () => {
      const base = emptyData();
      let d = addTodoGroup(base, 'A');
      d = addTodoGroup(d, 'B');
      const a = d.todoGroups.find((g) => g.name === 'A')!;
      const b = d.todoGroups.find((g) => g.name === 'B')!;
      d = reorderTodoGroup(d, b.id, null);
      const sorted = [...d.todoGroups].sort((x, y) => x.sortOrder - y.sortOrder);
      expect(sorted[sorted.length - 1]?.id).toBe(b.id);
      expect(sorted[0]?.id).toBe(a.id);
    });

    it('moves item across groups before anchor', () => {
      const base = emptyData();
      const g1 = firstGroupId(base);
      let d = addTodoGroup(base, 'Target');
      const g2 = d.todoGroups.find((g) => g.name === 'Target')!.id;
      d = addTodoItem(d, g1, 'Move me');
      const itemId = 'mut-id-1';
      d = addTodoItem(d, g2, 'Anchor');
      const anchorId = 'mut-id-2';
      d = reorderTodoItem(d, itemId, g2, anchorId);
      expect(todoById(d, itemId)).toMatchObject({ groupId: g2, sortOrder: 0 });
      expect(todoById(d, anchorId).sortOrder).toBe(10);
    });
  });

  describe('patchNote', () => {
    it('clears body exactly and bumps updatedAt on content change', () => {
      const base = emptyData();
      let d = addNote(base, 'note-1');
      d = patchNote(d, 'note-1', { body: '' });
      expect(d.notes[0]).toEqual({
        id: 'note-1',
        title: '',
        body: '',
        locked: false,
        pinned: false,
        createdAt: FIXED_NOW,
        updatedAt: FIXED_NOW,
      });
    });

    it('does not bump updatedAt for sortOrder-only patch', () => {
      const base = emptyData();
      let d = addNote(base, 'note-2');
      const stamped = d.notes[0]!.updatedAt;
      d = patchNote(d, 'note-2', { sortOrder: 3 });
      expect(d.notes[0]).toEqual({
        id: 'note-2',
        title: '',
        body: '',
        locked: false,
        pinned: false,
        createdAt: FIXED_NOW,
        updatedAt: stamped,
        sortOrder: 3,
      });
    });
  });

  describe('toggleItemDone / toggleTodoItem', () => {
    it('toggles goal through completed/active', () => {
      const base = emptyData();
      let d = addItem(base, selfId(base), 'goal', { title: 'G' });
      const id = 'mut-id-1';
      d = toggleItemDone(d, id);
      expect(itemById(d, id)).toMatchObject({ done: true, goalStatus: 'completed' });
      d = toggleItemDone(d, id);
      expect(itemById(d, id)).toMatchObject({ done: false, goalStatus: 'active' });
    });

    it('toggleTodoItem maps done boolean to status', () => {
      const base = emptyData();
      let d = addTodoItem(base, firstGroupId(base), 'T');
      const id = 'mut-id-1';
      d = toggleTodoItem(d, id);
      expect(todoById(d, id)).toMatchObject({ status: 'done', done: true });
      d = toggleTodoItem(d, id);
      expect(todoById(d, id)).toMatchObject({ status: 'todo', done: false });
    });
  });

  describe('updatePerson', () => {
    it('self keeps name when patch is blank but regular member falls back', () => {
      const base = emptyData();
      const teamId = firstTeamId(base);
      let d = addPerson(base, teamId, 'Pat');
      const patId = 'mut-id-1';
      d = updatePerson(d, selfId(d), { name: '   ' });
      expect(d.people.find((p) => isSelfPerson(p))?.name).toBe('Me');
      d = updatePerson(d, patId, { name: '   ' });
      expect(d.people.find((p) => p.id === patId)?.name).toBe('Pat');
    });
  });

  describe('updateTeam / setLastTeamId / favorites', () => {
    it('updateTeam keeps prior name on whitespace patch', () => {
      const base = emptyData();
      const teamId = firstTeamId(base);
      const next = updateTeam(base, teamId, { name: '   ' });
      expect(next.teams[0]).toEqual(base.teams[0]);
    });

    it('setLastTeamId rejects unknown team', () => {
      const base = emptyData();
      expect(setLastTeamId(base, 'unknown')).toEqual(base);
    });

    it('toggleFavoriteTeam toggles exact favorite list', () => {
      const base = emptyData();
      const teamId = firstTeamId(base);
      let d = toggleFavoriteTeam(base, teamId);
      expect(d.profile).toEqual({ displayName: 'Me', favoriteTeamIds: [teamId] });
      d = toggleFavoriteTeam(d, teamId);
      expect(d.profile).toEqual({ displayName: 'Me', favoriteTeamIds: [] });
    });
  });

  describe('utility and AI patches', () => {
    it('updateAISettings clears to undefined when empty', () => {
      const base = emptyData();
      let d = updateAISettings(base, { provider: 'openai', apiKey: 'k' });
      expect(d.aiSettings).toEqual({ provider: 'openai', apiKey: 'k', model: undefined, systemPrompt: undefined });
      d = updateAISettings(d, { provider: '', apiKey: '' });
      expect(d.aiSettings).toBeUndefined();
    });

    it('patchUtilityStructuredText coerces language', () => {
      const base = emptyData();
      let d = patchUtilityStructuredText(base, { content: '{}', language: 'yaml' });
      expect(d.utilityStructuredText?.language).toBe('yaml');
      d = patchUtilityStructuredText(d, { language: 'bogus' as 'json' });
      expect(d.utilityStructuredText?.language).toBe('yaml');
      d = patchUtilityStructuredText(d, { language: 'json' });
      expect(d.utilityStructuredText?.language).toBe('json');
    });
  });
});
