import { describe, expect, it } from 'vitest';
import type { AppData } from '../../core/model';
import { collectActivity, describeActivity } from './digest';

const NOW = new Date('2026-10-25T12:00:00');
const day = (n: number, h = 10) => new Date(2026, 9, 25 - n, h).toISOString();

const todo = (id: string, over: Record<string, unknown> = {}) => ({
  id, groupId: 'g', title: id, status: 'todo', done: false, createdAt: day(30), updatedAt: day(30), ...over,
});
const note = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, body: '', locked: false, createdAt: day(30), updatedAt: day(30), ...over,
});
const data = (over: Record<string, unknown> = {}) =>
  ({ todoItems: [], notes: [], items: [], people: [], ...over }) as unknown as AppData;

describe('collectActivity', () => {
  it('counts a window of local days, including today', () => {
    const d = data({
      todoItems: [
        todo('inside', { status: 'done', done: true, doneAt: day(6, 0) }),
        todo('outside', { status: 'done', done: true, doneAt: day(7, 23) }),
        todo('today', { status: 'done', done: true, doneAt: day(0, 9) }),
      ],
    });
    const a = collectActivity(d, { now: NOW, days: 7 });
    expect(a.done.map((t) => t.title).sort()).toEqual(['inside', 'today']);
    expect(a.days).toBe(7);
  });

  it('lists created, in progress and overdue tasks, leaving archived and cancelled ones out', () => {
    const d = data({
      todoItems: [
        todo('new', { createdAt: day(1) }),
        todo('doing', { status: 'in_progress' }),
        todo('late', { dueAt: day(2) }),
        todo('future', { dueAt: day(-3) }),
        todo('late-done', { dueAt: day(2), status: 'done', done: true, doneAt: day(30) }),
        todo('late-cancelled', { dueAt: day(2), status: 'cancelled' }),
        todo('late-archived', { dueAt: day(2), archived: true }),
      ],
    });
    const a = collectActivity(d, { now: NOW, days: 7 });
    expect(a.created.map((t) => t.title)).toEqual(['new']);
    expect(a.inProgress.map((t) => t.title)).toEqual(['doing']);
    expect(a.overdue.map((t) => t.title)).toEqual(['late']);
  });

  it('lists titles of notes edited in the window, never locked, archived or the body', () => {
    const d = data({
      notes: [
        note('edited', { updatedAt: day(1), body: 'SECRET BODY', bodyPlainText: 'SECRET BODY' }),
        note('old', { updatedAt: day(20) }),
        note('locked', { updatedAt: day(1), locked: true, title: 'Locked title' }),
        note('archived', { updatedAt: day(1), archived: true }),
      ],
    });
    const a = collectActivity(d, { now: NOW, days: 7 });
    expect(a.notes.map((n) => n.title)).toEqual(['edited']);
    expect(JSON.stringify(a)).not.toContain('SECRET BODY');
    expect(JSON.stringify(a)).not.toContain('Locked title');
  });

  it('never reads people records', () => {
    const d = data({
      items: [{ id: 'i', personId: 'p', kind: 'feedback', title: 'Private feedback', body: 'x', createdAt: day(1), updatedAt: day(1) }],
      people: [{ id: 'p', name: 'Ayşe' }],
    });
    const text = JSON.stringify(collectActivity(d, { now: NOW, days: 7 }));
    expect(text).not.toContain('Private feedback');
    expect(text).not.toContain('Ayşe');
  });

  it('caps each list and keeps the newest', () => {
    const d = data({
      todoItems: Array.from({ length: 200 }, (_, i) => todo(`t${i}`, { status: 'done', done: true, doneAt: day(1, 1) })),
    });
    const a = collectActivity(d, { now: NOW, days: 7 });
    expect(a.done).toHaveLength(60);
    expect(a.counts.done).toBe(200);
  });

  it('clips a long title and drops one that is only invisible characters', () => {
    const d = data({ todoItems: [todo('a', { title: 'x'.repeat(500), createdAt: day(1) }), todo('b', { title: '​', createdAt: day(1) })] });
    const a = collectActivity(d, { now: NOW, days: 7 });
    expect(a.created).toHaveLength(1);
    expect(Array.from(a.created[0].title).length).toBeLessThanOrEqual(120);
  });

  it('ignores a task whose dates are not real dates', () => {
    const d = data({ todoItems: [todo('bad', { status: 'done', done: true, doneAt: 'not a date', dueAt: 'nope' })] });
    const a = collectActivity(d, { now: NOW, days: 7 });
    expect(a.done).toEqual([]);
    expect(a.overdue).toEqual([]);
  });
});

describe('describeActivity', () => {
  it('writes counts and titles only', () => {
    const d = data({ todoItems: [todo('Ship it', { status: 'done', done: true, doneAt: day(1) })], notes: [note('Plan', { updatedAt: day(1) })] });
    const text = describeActivity(collectActivity(d, { now: NOW, days: 7 }));
    expect(text).toContain('Last 7 days');
    expect(text).toContain('Done (1)');
    expect(text).toContain('- Ship it');
    expect(text).toContain('Notes edited (1)');
    expect(text).toContain('- Plan');
  });
});
