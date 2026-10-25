import { describe, expect, it } from 'vitest';
import type { AppData } from '../../core/model';
import { collectPersonContext, describePersonContext } from './personContext';

const NOW = new Date('2026-10-25T12:00:00');
const ago = (days: number) => new Date(2026, 9, 25 - days, 10).toISOString();
const item = (id: string, over: Record<string, unknown> = {}) => ({
  id, personId: 'p1', kind: 'task', title: id, body: '', done: false, createdAt: ago(100), updatedAt: ago(100), ...over,
});
const data = (items: unknown[], people: unknown[] = [{ id: 'p1', name: 'Ayşe Yılmaz' }, { id: 'p2', name: 'Other' }]) =>
  ({ items, people, notes: [], todoItems: [] }) as unknown as AppData;

describe('collectPersonContext', () => {
  it('keeps open tasks and goals however old, and recent items inside the window', () => {
    const d = data([
      item('open-old-task', { kind: 'task' }),
      item('open-old-goal', { kind: 'goal', goalStatus: 'active' }),
      item('done-old', { done: true, updatedAt: ago(100) }),
      item('done-recent', { done: true, updatedAt: ago(10) }),
      item('goal-completed-old', { kind: 'goal', goalStatus: 'completed' }),
      item('feedback-recent', { kind: 'feedback', updatedAt: ago(20), feedbackKind: 'positive' }),
      item('feedback-old', { kind: 'feedback', updatedAt: ago(90) }),
    ]);
    const c = collectPersonContext(d, 'p1', { now: NOW, weeks: 8 });
    expect(c.entries.map((e) => e.title).sort()).toEqual(['done-recent', 'feedback-recent', 'open-old-goal', 'open-old-task']);
    expect(c.weeks).toBe(8);
  });

  it('uses only this person and never their name', () => {
    const d = data([item('mine'), item('theirs', { personId: 'p2' })]);
    const c = collectPersonContext(d, 'p1', { now: NOW, weeks: 8 });
    expect(c.entries.map((e) => e.title)).toEqual(['mine']);
    expect(JSON.stringify(c)).not.toContain('Ayşe');
    expect(describePersonContext(c)).not.toContain('Ayşe');
  });

  it('leaves documents out and clips the text of the rest', () => {
    const d = data([
      item('doc', { kind: 'document', updatedAt: ago(1), bodyPlainText: 'DOC TEXT' }),
      item('long', { kind: 'note', updatedAt: ago(1), bodyPlainText: 'x'.repeat(2000) }),
    ]);
    const c = collectPersonContext(d, 'p1', { now: NOW, weeks: 8 });
    expect(c.entries.map((e) => e.title)).toEqual(['long']);
    expect(Array.from(c.entries[0].text ?? '').length).toBeLessThanOrEqual(300);
    expect(JSON.stringify(c)).not.toContain('DOC TEXT');
  });

  it('puts open work first, caps the list at 40 and says how many there were', () => {
    const many = Array.from({ length: 80 }, (_, i) => item(`t${i}`, { updatedAt: ago(1) }));
    const c = collectPersonContext(data(many), 'p1', { now: NOW, weeks: 8 });
    expect(c.entries).toHaveLength(40);
    expect(c.total).toBe(80);
  });

  it('survives dates that are not dates and titles of invisible characters', () => {
    const d = data([item('bad', { updatedAt: 'nope', createdAt: 'nope' }), item('​', { updatedAt: ago(1) })]);
    const c = collectPersonContext(d, 'p1', { now: NOW, weeks: 8 });
    expect(c.entries.map((e) => e.title)).toEqual(['bad']);
  });

  it('is empty for an unknown person', () => {
    expect(collectPersonContext(data([item('a')]), 'nobody', { now: NOW, weeks: 8 }).entries).toEqual([]);
  });
});

describe('describePersonContext', () => {
  it('writes one line per entry with kind, status and due date', () => {
    const d = data([item('Fix deploy', { kind: 'task', dueAt: ago(2), updatedAt: ago(1) })]);
    const text = describePersonContext(collectPersonContext(d, 'p1', { now: NOW, weeks: 4 }));
    expect(text).toContain('Last 4 weeks');
    expect(text).toMatch(/task, open, due 2026-10-23: Fix deploy/);
  });
});
