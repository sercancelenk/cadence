import { describe, expect, it, vi } from 'vitest';
import type { Person, Team } from '../../model';
import { addTaskForPerson, delegateOptions } from './delegates';

const AT = '2026-10-25T09:00:00.000Z';
const person = (id: string, name: string, teamId = 't1', over: Partial<Person> = {}): Person => ({ id, teamId, name, createdAt: AT, ...over });
const teams = [{ id: 't1', name: 'Platform' }, { id: 't2', name: 'Data' }] as Team[];

describe('delegateOptions', () => {
  it('lists team members by name with their team, without Me, My leader or Skip-level', () => {
    const people = [
      person('p2', 'Bo', 't2'),
      person('p1', 'Ana'),
      person('me', 'Me', 't1', { isSelf: true }),
      person('__leader__t1', 'Boss'),
      person('__skiplevel__t1', 'Big boss'),
    ];
    expect(delegateOptions(people, teams)).toEqual([
      { id: 'p1', name: 'Ana', teamName: 'Platform' },
      { id: 'p2', name: 'Bo', teamName: 'Data' },
    ]);
  });

  it('keeps a person whose team is unknown, and is empty without people', () => {
    expect(delegateOptions([person('p1', 'Ana', 'gone')], teams)).toEqual([{ id: 'p1', name: 'Ana' }]);
    expect(delegateOptions([], teams)).toEqual([]);
  });
});

describe('archived teams', () => {
  it('leaves out people of an archived team', () => {
    const t = [{ id: 't1', name: 'Platform' }, { id: 't2', name: 'Old', status: 'archived' }] as Team[];
    expect(delegateOptions([person('p1', 'Ana', 't1'), person('p2', 'Bo', 't2')], t)).toEqual([
      { id: 'p1', name: 'Ana', teamName: 'Platform' },
    ]);
  });
});

describe('addTaskForPerson', () => {
  it('adds a task with only the title when the person still exists', () => {
    const addItem = vi.fn(() => true);
    expect(addTaskForPerson({ people: [person('p1', 'Ana')] }, addItem, 'p1', 'Send the brief')).toBe(true);
    expect(addItem).toHaveBeenCalledWith('p1', 'task', { title: 'Send the brief' });
  });

  it('reports false and adds nothing when the person is gone, or the snapshot is missing', () => {
    const addItem = vi.fn(() => true);
    expect(addTaskForPerson({ people: [person('p1', 'Ana')] }, addItem, 'p9', 'x')).toBe(false);
    expect(addTaskForPerson(null, addItem, 'p1', 'x')).toBe(false);
    expect(addItem).not.toHaveBeenCalled();
  });

  it('passes on a refused save', () => {
    expect(addTaskForPerson({ people: [person('p1', 'Ana')] }, () => false, 'p1', 'x')).toBe(false);
  });
});
