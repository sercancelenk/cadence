import { describe, expect, it } from 'vitest';
import type { AppData, TodoItem } from '../model';
import {
  activityOpenReferenceAt,
  buildActivityReport,
  buildActivityReportFromData,
  collectActivityRecords,
  getActivityPeriod,
  getActivityPeriodFromDates,
  isWithinActivityPeriod,
  parseActivityDate,
  wasOpenAt,
} from './todoActivityReport';

const TS = '2026-06-04T12:00:00.000Z';
const REF = new Date('2026-06-04T15:00:00.000Z');

function todo(partial: Partial<TodoItem> & Pick<TodoItem, 'id'>): TodoItem {
  return {
    groupId: 'g1',
    title: 'Task',
    status: 'todo',
    done: false,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...partial,
    id: partial.id,
  };
}

function emptyData(overrides: Partial<AppData> = {}): AppData {
  return {
    version: 3,
    teams: [{ id: 't1', name: 'Alpha', createdAt: TS, status: 'active' }],
    people: [{ id: 'p1', teamId: 't1', name: 'Pat', createdAt: TS }],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [{ id: 'g1', name: 'General', sortOrder: 0, createdAt: TS }],
    todoItems: [],
    notes: [],
    ...overrides,
  };
}

describe('getActivityPeriod', () => {
  it('builds today with midnight boundaries', () => {
    const p = getActivityPeriod('today', REF);
    expect(p.start.getHours()).toBe(0);
    expect(p.end.getTime() - p.start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('builds last year as previous calendar year', () => {
    const p = getActivityPeriod('last_year', REF);
    expect(p.start.getFullYear()).toBe(2025);
    expect(p.end.getFullYear()).toBe(2026);
    expect(p.end.getMonth()).toBe(0);
    expect(p.end.getDate()).toBe(1);
  });

  it('falls back to a single-day custom period', () => {
    const p = getActivityPeriod('custom', REF);
    expect(p.preset).toBe('custom');
    expect(p.start.getDate()).toBe(p.end.getDate() - 1);
  });

  it('builds week, month, and year presets', () => {
    expect(getActivityPeriod('this_week', REF).preset).toBe('this_week');
    expect(getActivityPeriod('this_month', REF).label).toContain('2026');
    expect(getActivityPeriod('this_year', REF).label).toBe('2026');
  });
});

describe('getActivityPeriodFromDates', () => {
  it('normalizes reversed dates and uses exclusive end', () => {
    const p = getActivityPeriodFromDates(
      new Date('2026-06-10T15:00:00.000Z'),
      new Date('2026-06-04T08:00:00.000Z'),
    );
    expect(p.preset).toBe('custom');
    expect(p.start.getDate()).toBe(4);
    expect(p.end.getDate()).toBe(11);
    expect(p.label).toContain('4');
    expect(p.label).toContain('10');
  });
});

describe('collectActivityRecords', () => {
  it('includes all personal todos by default scope', () => {
    const data = emptyData({
      todoItems: [
        todo({ id: 'a', title: 'Plain' }),
        todo({ id: 'b', title: 'Hub', planInHub: true }),
      ],
    });
    const records = collectActivityRecords(data, { source: 'personal' });
    expect(records.map((r) => r.id).sort()).toEqual(['a', 'b']);
    expect(records.find((r) => r.id === 'a')?.navPath).toBe('/todos?focus=a');
  });

  it('filters planning hub only when planningHubOnly is set', () => {
    const data = emptyData({
      todoItems: [
        todo({ id: 'a', title: 'Plain' }),
        todo({ id: 'b', title: 'Hub', planInHub: true }),
      ],
    });
    const records = collectActivityRecords(data, { source: 'personal', planningHubOnly: true });
    expect(records.map((r) => r.id)).toEqual(['b']);
  });

  it('collects team tasks and goals', () => {
    const data = emptyData({
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'Team task',
          body: '',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    const records = collectActivityRecords(data, { source: 'team' });
    expect(records).toHaveLength(1);
    expect(records[0]?.source).toBe('team');
    expect(records[0]?.contextLabel).toContain('Alpha');
    expect(records[0]?.navPath).toBe('/teams/t1/people/p1?focus=i1');
  });

  it('maps team goal statuses and filters by teamId', () => {
    const data = emptyData({
      teams: [
        { id: 't1', name: 'Alpha', createdAt: TS, status: 'active' },
        { id: 't2', name: 'Beta', createdAt: TS, status: 'active' },
      ],
      people: [
        { id: 'p1', teamId: 't1', name: 'Pat', createdAt: TS },
        { id: 'p2', teamId: 't2', name: 'Sam', createdAt: TS },
      ],
      items: [
        {
          id: 'g-active',
          personId: 'p1',
          kind: 'goal',
          title: 'Active goal',
          body: '',
          done: false,
          goalStatus: 'active',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'g-done',
          personId: 'p1',
          kind: 'goal',
          title: 'Done goal',
          body: '',
          done: true,
          goalStatus: 'completed',
          doneAt: TS,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'g-cancel',
          personId: 'p1',
          kind: 'goal',
          title: 'Cancelled goal',
          body: '',
          done: false,
          goalStatus: 'cancelled',
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'g-draft',
          personId: 'p1',
          kind: 'goal',
          title: 'Draft goal',
          body: '',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'other-team',
          personId: 'p2',
          kind: 'task',
          title: 'Beta task',
          body: '',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });

    const all = collectActivityRecords(data, { source: 'team' });
    expect(all.map((r) => r.id).sort()).toEqual([
      'g-active',
      'g-cancel',
      'g-done',
      'g-draft',
      'other-team',
    ]);
    expect(all.find((r) => r.id === 'g-active')?.status).toBe('in_progress');
    expect(all.find((r) => r.id === 'g-done')?.status).toBe('done');
    expect(all.find((r) => r.id === 'g-cancel')?.status).toBe('cancelled');
    expect(all.find((r) => r.id === 'g-draft')?.status).toBe('todo');
    expect(all.find((r) => r.id === 'g-done')?.doneAt).not.toBeNull();

    const alphaOnly = collectActivityRecords(data, { source: 'team', teamId: 't1' });
    expect(alphaOnly.every((r) => r.teamId === 't1')).toBe(true);
    expect(alphaOnly.some((r) => r.id === 'other-team')).toBe(false);
  });
});

describe('buildActivityReport', () => {
  it('splits completed, opened, still open, and cancelled', () => {
    const period = getActivityPeriod('this_week', REF);
    const records = collectActivityRecords(
      emptyData({
        todoItems: [
          todo({
            id: 'done',
            status: 'done',
            done: true,
            doneAt: '2026-06-03T09:00:00.000Z',
            createdAt: '2026-05-20T09:00:00.000Z',
          }),
          todo({
            id: 'new',
            createdAt: '2026-06-04T08:00:00.000Z',
            updatedAt: '2026-06-04T08:00:00.000Z',
          }),
          todo({
            id: 'open',
            createdAt: '2026-05-01T09:00:00.000Z',
            updatedAt: '2026-05-01T09:00:00.000Z',
          }),
          todo({
            id: 'drop',
            status: 'cancelled',
            createdAt: '2026-05-01T09:00:00.000Z',
            updatedAt: '2026-06-04T10:00:00.000Z',
          }),
        ],
      }),
      { source: 'personal' },
    );

    const report = buildActivityReport(records, period, REF);
    expect(report.summary.completed).toBe(1);
    expect(report.summary.opened).toBe(1);
    expect(report.summary.cancelled).toBe(1);
    expect(report.stillOpen.map((x) => x.id)).toContain('open');
    expect(report.stillOpen.map((x) => x.id)).not.toContain('done');
  });

  it('uses last-year period end for still-open reference', () => {
    const period = getActivityPeriod('last_year', REF);
    expect(activityOpenReferenceAt(period, REF).getTime()).toBe(period.end.getTime());
  });
});

describe('activity helpers', () => {
  it('parses invalid dates as null', () => {
    expect(parseActivityDate('not-a-date')).toBeNull();
    expect(parseActivityDate(null)).toBeNull();
  });

  it('checks period membership with exclusive end', () => {
    const period = getActivityPeriod('today', REF);
    expect(isWithinActivityPeriod(period.start, period)).toBe(true);
    expect(isWithinActivityPeriod(period.end, period)).toBe(false);
    expect(isWithinActivityPeriod(null, period)).toBe(false);
  });
});

describe('wasOpenAt', () => {
  it('treats done-before reference as not open', () => {
    const record = collectActivityRecords(
      emptyData({
        todoItems: [
          todo({
            id: 'x',
            status: 'done',
            done: true,
            doneAt: '2026-06-01T09:00:00.000Z',
          }),
        ],
      }),
      { source: 'personal' },
    )[0]!;
    expect(wasOpenAt(record, REF)).toBe(false);
  });
});

describe('buildActivityReportFromData', () => {
  it('returns empty sections when no data', () => {
    const report = buildActivityReportFromData(emptyData(), {
      source: 'personal',
      preset: 'today',
      ref: REF,
    });
    expect(report.summary.completed).toBe(0);
    expect(report.summary.opened).toBe(0);
  });

  it('accepts an explicit custom period', () => {
    const period = getActivityPeriodFromDates(
      new Date('2026-06-01T00:00:00'),
      new Date('2026-06-07T00:00:00'),
    );
    const report = buildActivityReportFromData(emptyData(), {
      source: 'personal',
      period,
    });
    expect(report.period.preset).toBe('custom');
  });
});
