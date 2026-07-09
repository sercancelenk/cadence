import { describe, expect, it } from 'vitest';
import type { AppData, Item, Person } from '../model';
import { leaderPersonIdForTeam, selfPersonIdForTeam, skipLevelPersonIdForTeam } from '../model';
import {
  arrangeMemberSummaries,
  summarizeTeamMembers,
  type TeamMemberSummary,
} from './teamMemberSummary';

const TEAM = 'team-1';
const NOW = Date.parse('2024-01-10T00:00:00.000Z');

function minimalData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 1,
    teams: [],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [],
    todoItems: [],
    notes: [],
    ...overrides,
  } as AppData;
}

function person(id: string, name: string, extra: Partial<Person> = {}): Person {
  return { id, teamId: TEAM, name, createdAt: '2020-01-01T00:00:00.000Z', ...extra };
}

function selfPerson(): Person {
  return person(selfPersonIdForTeam(TEAM), 'Me', { isSelf: true });
}

function leaderPerson(): Person {
  return person(leaderPersonIdForTeam(TEAM), 'My leader');
}

function skipLevelPerson(): Person {
  return person(skipLevelPersonIdForTeam(TEAM), 'Skip-level leader');
}

function item(id: string, personId: string, extra: Partial<Item> = {}): Item {
  return {
    id,
    personId,
    kind: 'task',
    title: id,
    body: '',
    done: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('summarizeTeamMembers', () => {
  it('orders Me, leader, skip-level, then members alphabetically', () => {
    const data = minimalData({
      people: [
        person('p2', 'Zoe'),
        leaderPerson(),
        skipLevelPerson(),
        person('p1', 'Adam'),
        selfPerson(),
      ],
    });
    expect(summarizeTeamMembers(data, TEAM, NOW).map((s) => s.role + ':' + s.person.name)).toEqual([
      'self:Me',
      'leader:My leader',
      'skipLevel:Skip-level leader',
      'member:Adam',
      'member:Zoe',
    ]);
  });

  it('counts overdue tasks as a subset of open tasks', () => {
    const overdue = new Date(NOW - 1000).toISOString();
    const future = new Date(NOW + 1000).toISOString();
    const data = minimalData({
      people: [person('p1', 'Adam')],
      items: [
        item('t1', 'p1', { kind: 'task', dueAt: overdue }),
        item('t2', 'p1', { kind: 'task', dueAt: future }),
        item('t3', 'p1', { kind: 'task', dueAt: overdue, done: true }),
        item('t4', 'p1', { kind: 'task' }),
      ],
    });
    const [adam] = summarizeTeamMembers(data, TEAM, NOW);
    expect(adam.openTasks).toBe(3);
    expect(adam.overdueTasks).toBe(1);
  });

  it('counts open tasks and active goals, ignoring done items', () => {
    const data = minimalData({
      people: [person('p1', 'Adam')],
      items: [
        item('t1', 'p1', { kind: 'task', done: false }),
        item('t2', 'p1', { kind: 'task', done: true }),
        item('g1', 'p1', { kind: 'goal', done: false }),
        item('g2', 'p1', { kind: 'goal', done: true }),
        item('n1', 'p1', { kind: 'note' }),
      ],
    });
    const [adam] = summarizeTeamMembers(data, TEAM, NOW);
    expect(adam.openTasks).toBe(1);
    expect(adam.openGoals).toBe(1);
  });

  it('counts reminders only within the next 7 days and not done', () => {
    const inWindow = new Date(NOW + 2 * 24 * 60 * 60 * 1000).toISOString();
    const past = new Date(NOW - 1000).toISOString();
    const tooFar = new Date(NOW + 8 * 24 * 60 * 60 * 1000).toISOString();
    const data = minimalData({
      people: [person('p1', 'Adam')],
      items: [
        item('r1', 'p1', { remindAt: inWindow }),
        item('r2', 'p1', { remindAt: past }),
        item('r3', 'p1', { remindAt: tooFar }),
        item('r4', 'p1', { remindAt: inWindow, done: true }),
      ],
    });
    expect(summarizeTeamMembers(data, TEAM, NOW)[0].upcomingReminders).toBe(1);
  });

  it('tracks the most recent activity timestamp', () => {
    const data = minimalData({
      people: [person('p1', 'Adam')],
      items: [
        item('a', 'p1', { updatedAt: '2024-01-05T00:00:00.000Z' }),
        item('b', 'p1', { updatedAt: '2024-01-08T00:00:00.000Z' }),
      ],
    });
    expect(summarizeTeamMembers(data, TEAM, NOW)[0].lastActivityAt).toBe('2024-01-08T00:00:00.000Z');
  });

  it('returns zeroed stats and no activity for members without items', () => {
    const data = minimalData({ people: [person('p1', 'Adam')] });
    const [adam] = summarizeTeamMembers(data, TEAM, NOW);
    expect(adam).toMatchObject({ openTasks: 0, openGoals: 0, upcomingReminders: 0, lastActivityAt: undefined });
  });

  it('ignores items belonging to people on other teams', () => {
    const data = minimalData({
      people: [person('p1', 'Adam')],
      items: [item('x', 'other-person', { kind: 'task' })],
    });
    expect(summarizeTeamMembers(data, TEAM, NOW)[0].openTasks).toBe(0);
  });
});

function summary(role: TeamMemberSummary['role'], name: string, extra: Partial<TeamMemberSummary> = {}): TeamMemberSummary {
  return {
    person: person(`${role}-${name}`, name),
    role,
    openTasks: 0,
    overdueTasks: 0,
    openGoals: 0,
    upcomingReminders: 0,
    lastActivityAt: undefined,
    ...extra,
  };
}

describe('arrangeMemberSummaries', () => {
  it('keeps Me, leader, and skip-level pinned regardless of sort', () => {
    const list = [
      summary('member', 'Zoe', { openTasks: 9 }),
      summary('skipLevel', 'VP', { openTasks: 2 }),
      summary('leader', 'Boss', { openTasks: 1 }),
      summary('member', 'Adam', { openTasks: 5 }),
      summary('self', 'Me', { openTasks: 0 }),
    ];
    expect(arrangeMemberSummaries(list, { sort: 'tasks' }).map((s) => s.person.name)).toEqual([
      'Me',
      'Boss',
      'VP',
      'Zoe',
      'Adam',
    ]);
  });

  it('sorts members alphabetically by default', () => {
    const list = [summary('member', 'Zoe'), summary('member', 'Adam')];
    expect(arrangeMemberSummaries(list).map((s) => s.person.name)).toEqual(['Adam', 'Zoe']);
  });

  it('sorts members by recent activity', () => {
    const list = [
      summary('member', 'Old', { lastActivityAt: '2024-01-01T00:00:00.000Z' }),
      summary('member', 'New', { lastActivityAt: '2024-06-01T00:00:00.000Z' }),
      summary('member', 'Never'),
    ];
    expect(arrangeMemberSummaries(list, { sort: 'recent' }).map((s) => s.person.name)).toEqual([
      'New',
      'Old',
      'Never',
    ]);
  });

  it('filters by name or title, case-insensitively', () => {
    const list = [
      summary('self', 'Me'),
      summary('member', 'Adam', { person: person('p1', 'Adam', { title: 'Backend Engineer' }) }),
      summary('member', 'Zoe', { person: person('p2', 'Zoe', { title: 'Designer' }) }),
    ];
    expect(arrangeMemberSummaries(list, { query: 'engineer' }).map((s) => s.person.name)).toEqual(['Adam']);
    expect(arrangeMemberSummaries(list, { query: 'ZO' }).map((s) => s.person.name)).toEqual(['Zoe']);
  });
});
