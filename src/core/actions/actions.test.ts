import { describe, expect, it } from 'vitest';
import { emptyData, type AppData } from '../model';
import {
  addItem,
  addNote,
  addPerson,
  addTodoItem,
  moveNoteToGroup,
  patchNote,
  patchNoteLockState,
  removeItem,
  removePerson,
  removeTodoItem,
  setTodoStatus,
  updateItem,
  updateTodoItem,
} from './index';
import { reminderNotifyKey } from '../../lib/reminderNotify';

function seedWithTodo(): AppData {
  const d = emptyData();
  const groupId = d.todoGroups[0]?.id;
  if (!groupId) throw new Error('expected default group');
  const withTodo = addTodoItem(d, groupId, 'Task A');
  const id = withTodo.todoItems[0]!.id;
  return updateTodoItem(withTodo, id, { remindAt: '2026-06-01T10:00:00.000Z' });
}

describe('core actions — data safety', () => {
  it('removeTodoItem clears notifiedReminderIds for that item', () => {
    const withTodo = seedWithTodo();
    const todoId = withTodo.todoItems[0]!.id;
    const key = reminderNotifyKey(todoId, '2026-06-01T10:00:00.000Z');
    const withNotify: AppData = { ...withTodo, notifiedReminderIds: [key] };
    const next = removeTodoItem(withNotify, todoId);
    expect(next.todoItems.some((t) => t.id === todoId)).toBe(false);
    expect(next.notifiedReminderIds).not.toContain(key);
  });

  it('setTodoStatus to done sets doneAt', () => {
    const withTodo = seedWithTodo();
    const id = withTodo.todoItems[0]!.id;
    const next = setTodoStatus(withTodo, id, 'done');
    const t = next.todoItems.find((x) => x.id === id);
    expect(t?.status).toBe('done');
    expect(t?.doneAt).toBeTruthy();
  });

  it('removePerson removes items and reminder keys for that person', () => {
    const base = emptyData();
    const teamId = base.teams[0]!.id;
    let d = addPerson(base, teamId, 'Jane Doe', 'PM');
    const person = d.people.find((p) => p.name === 'Jane Doe');
    if (!person) throw new Error('expected added person');
    const itemId = 'item-test-1';
    d = {
      ...d,
      items: [
        ...d.items,
        {
          id: itemId,
          personId: person.id,
          kind: 'task',
          title: 'Follow up',
          body: '',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          remindAt: '2026-06-02T10:00:00.000Z',
        },
      ],
      notifiedReminderIds: [reminderNotifyKey(itemId, '2026-06-02T10:00:00.000Z')],
    };
    const next = removePerson(d, person.id);
    expect(next.people.some((p) => p.id === person.id)).toBe(false);
    expect(next.items.some((i) => i.personId === person.id)).toBe(false);
    expect(next.notifiedReminderIds).toHaveLength(0);
  });

  it('removeItem clears item from workspace', () => {
    const itemId = 'i1';
    let d = emptyData();
    const personId = d.people[0]!.id;
    d = {
      ...d,
      items: [
        {
          id: itemId,
          personId,
          kind: 'task',
          title: 'x',
          body: '',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    const next = removeItem(d, itemId);
    expect(next.items).toHaveLength(0);
  });

  it('updateTodoItem preserves id and group', () => {
    const d = seedWithTodo();
    const t = d.todoItems[0]!;
    const next = updateTodoItem(d, t.id, { title: 'Renamed' });
    const u = next.todoItems.find((x) => x.id === t.id);
    expect(u?.title).toBe('Renamed');
    expect(u?.groupId).toBe(t.groupId);
  });

  it('updateTodoItem clears planning axes when explicitly set to undefined', () => {
    const d = seedWithTodo();
    const id = d.todoItems[0]!.id;
    const classified = updateTodoItem(d, id, { planImportant: true, planUrgent: true, planInHub: true });
    const unsorted = updateTodoItem(classified, id, { planImportant: undefined, planUrgent: undefined });
    const row = unsorted.todoItems.find((x) => x.id === id);
    expect(row?.planImportant).toBeUndefined();
    expect(row?.planUrgent).toBeUndefined();
    expect(row?.planInHub).toBe(true);
  });

  it('changing dueAt alone does not clear notified reminder slots', () => {
    const d = seedWithTodo();
    const id = d.todoItems[0]!.id;
    const key = reminderNotifyKey(id, '2026-06-01T10:00:00.000Z');
    const withNotify: AppData = { ...d, notifiedReminderIds: [key] };
    const next = updateTodoItem(withNotify, id, { dueAt: '2026-06-15T12:00:00.000Z' });
    expect(next.notifiedReminderIds).toContain(key);
  });

  it('changing team item dueAt alone does not clear notified reminder slots', () => {
    const personId = emptyData().people[0]!.id;
    const itemId = 'team-task-1';
    const remindAt = '2026-06-01T10:00:00.000Z';
    const key = reminderNotifyKey(itemId, remindAt);
    const d: AppData = {
      ...emptyData(),
      items: [
        {
          id: itemId,
          personId,
          kind: 'task',
          title: 'Follow up',
          body: '',
          done: false,
          remindAt,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      notifiedReminderIds: [key],
    };
    const next = updateItem(d, itemId, { dueAt: '2026-06-15T12:00:00.000Z' });
    expect(next.items.find((i) => i.id === itemId)?.dueAt).toBe('2026-06-15T12:00:00.000Z');
    expect(next.items.find((i) => i.id === itemId)?.remindAt).toBe(remindAt);
    expect(next.notifiedReminderIds).toContain(key);
  });
});

describe('patchNoteLockState — locked-note encrypt commit', () => {
  const cipher = { ivB64: 'aXY=', cipherB64: 'Y2lwaGVy' };

  function seedNote(): { data: AppData; id: string } {
    const data = addNote(emptyData(), 'note-lock-1');
    return { data, id: data.notes[0]!.id };
  }

  it('clears plaintext and writes the cipher/lock fields', () => {
    const { data, id } = seedNote();
    const withBody = patchNote(data, id, { body: 'secret plan', bodyFormat: 'markdown' });
    const next = patchNoteLockState(withBody, id, {
      cipher,
      bodyFormat: 'prosemirror',
      attachmentRefs: ['att-1'],
      lockedBodySignature: 'sig-abc',
    });
    const note = next.notes.find((n) => n.id === id)!;
    expect(note.locked).toBe(true);
    expect(note.body).toBe('');
    expect(note.bodyPlainText).toBeUndefined();
    expect(note.cipher).toEqual(cipher);
    expect(note.bodyFormat).toBe('prosemirror');
    expect(note.attachmentRefs).toEqual(['att-1']);
    expect(note.lockedBodySignature).toBe('sig-abc');
  });

  it('preserves a concurrent title/pin edit made during the encrypt window (BLOCKER #1)', () => {
    const { data, id } = seedNote();
    // Snapshot captured at keystroke time (what the async encrypt closure holds).
    const stale = data.notes[0]!;
    expect(stale.title).toBe('');
    // While the body encrypts, the user retitles and pins the note.
    const liveData = patchNote(data, id, { title: 'Renamed while locking', pinned: true });
    // The encrypt result is committed by merging onto the LIVE note, not the
    // stale snapshot — so the rename/pin must survive.
    const next = patchNoteLockState(liveData, id, {
      cipher,
      bodyFormat: 'prosemirror',
      attachmentRefs: [],
      lockedBodySignature: 'sig-1',
    });
    const note = next.notes.find((n) => n.id === id)!;
    expect(note.title).toBe('Renamed while locking');
    expect(note.pinned).toBe(true);
    expect(note.locked).toBe(true);
    expect(note.cipher).toEqual(cipher);
  });

  it('no-ops when the note was deleted during the encrypt window', () => {
    const { data, id } = seedNote();
    const deleted: AppData = { ...data, notes: [] };
    const next = patchNoteLockState(deleted, id, {
      cipher,
      attachmentRefs: [],
      lockedBodySignature: 'sig-1',
    });
    expect(next.notes).toHaveLength(0);
  });
});

describe('moveNoteToGroup — manual order safety', () => {
  function withNote(data: AppData, patch: Partial<import('../model').Note>): AppData {
    const id = `n-${data.notes.length + 1}`;
    const t = '2026-01-01T00:00:00.000Z';
    return {
      ...data,
      notes: [
        ...data.notes,
        { id, title: id, body: '', locked: false, createdAt: t, updatedAt: t, ...patch },
      ],
    };
  }

  it('appends to the destination tier with a non-colliding sortOrder', () => {
    let data = emptyData();
    data = { ...data, noteGroups: [{ id: 'g1', name: 'G1', sortOrder: 0, createdAt: 'x' }] };
    // Two notes already in g1 with manual order 0,1; one ungrouped note to move.
    data = withNote(data, { groupId: 'g1', sortOrder: 0 });
    data = withNote(data, { groupId: 'g1', sortOrder: 1 });
    data = withNote(data, { groupId: undefined, sortOrder: 0 });
    const movingId = data.notes[2]!.id;
    const next = moveNoteToGroup(data, movingId, 'g1');
    const moved = next.notes.find((n) => n.id === movingId)!;
    expect(moved.groupId).toBe('g1');
    expect(moved.sortOrder).toBe(2);
    // No two notes in g1 share a sortOrder now.
    const orders = next.notes.filter((n) => n.groupId === 'g1').map((n) => n.sortOrder);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('ignores an unknown destination group (falls back to ungrouped)', () => {
    let data = emptyData();
    data = withNote(data, { groupId: 'g1', sortOrder: 0 });
    const id = data.notes[0]!.id;
    const next = moveNoteToGroup(data, id, 'does-not-exist');
    expect(next.notes[0]!.groupId).toBeUndefined();
  });

  it('no-ops when the note is already in the target group', () => {
    let data = emptyData();
    data = { ...data, noteGroups: [{ id: 'g1', name: 'G1', sortOrder: 0, createdAt: 'x' }] };
    data = withNote(data, { groupId: 'g1', sortOrder: 5 });
    const id = data.notes[0]!.id;
    const next = moveNoteToGroup(data, id, 'g1');
    expect(next).toBe(data);
  });

  it('no-ops when the note does not exist', () => {
    const data = emptyData();
    expect(moveNoteToGroup(data, 'missing', 'g1')).toBe(data);
  });
});

describe('due vs reminder — invariants', () => {
  const dueOnly = '2030-06-15T16:00:00.000Z';
  const remindOnly = '2030-06-15T14:00:00.000Z';

  it('addItem with dueAt only does not set remindAt', () => {
    const base = emptyData();
    const personId = base.people[0]!.id;
    const next = addItem(base, personId, 'task', { title: 'Deadline', dueAt: dueOnly });
    const item = next.items.find((i) => i.title === 'Deadline');
    expect(item?.dueAt).toBe(dueOnly);
    expect(item?.remindAt).toBeUndefined();
  });

  it('updateItem with dueAt only does not set remindAt', () => {
    const base = emptyData();
    const personId = base.people[0]!.id;
    const seeded = addItem(base, personId, 'task', { title: 'Task' });
    const id = seeded.items.find((i) => i.title === 'Task')!.id;
    const next = updateItem(seeded, id, { dueAt: dueOnly });
    const item = next.items.find((i) => i.id === id);
    expect(item?.dueAt).toBe(dueOnly);
    expect(item?.remindAt).toBeUndefined();
  });

  it('updateItem with remindAt only does not set dueAt', () => {
    const base = emptyData();
    const personId = base.people[0]!.id;
    const seeded = addItem(base, personId, 'task', { title: 'Task' });
    const id = seeded.items.find((i) => i.title === 'Task')!.id;
    const next = updateItem(seeded, id, { remindAt: remindOnly });
    const item = next.items.find((i) => i.id === id);
    expect(item?.remindAt).toBe(remindOnly);
    expect(item?.dueAt).toBeUndefined();
  });

  it('updateTodoItem with dueAt only does not set remindAt', () => {
    const d = emptyData();
    const groupId = d.todoGroups[0]!.id;
    const withTodo = addTodoItem(d, groupId, 'Todo');
    const id = withTodo.todoItems[0]!.id;
    const next = updateTodoItem(withTodo, id, { dueAt: dueOnly });
    const todo = next.todoItems.find((t) => t.id === id);
    expect(todo?.dueAt).toBe(dueOnly);
    expect(todo?.remindAt).toBeUndefined();
  });

  it('changing remindAt clears notified keys so the new slot can fire', () => {
    const personId = emptyData().people[0]!.id;
    const itemId = 'team-task-remind-change';
    const oldRemind = '2026-06-01T10:00:00.000Z';
    const newRemind = '2026-06-01T11:00:00.000Z';
    const oldKey = reminderNotifyKey(itemId, oldRemind);
    const d: AppData = {
      ...emptyData(),
      items: [
        {
          id: itemId,
          personId,
          kind: 'task',
          title: 'Follow up',
          body: '',
          done: false,
          remindAt: oldRemind,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      notifiedReminderIds: [oldKey],
    };
    const next = updateItem(d, itemId, { remindAt: newRemind });
    expect(next.notifiedReminderIds).not.toContain(oldKey);
    expect(next.items.find((i) => i.id === itemId)?.remindAt).toBe(newRemind);
  });
});
