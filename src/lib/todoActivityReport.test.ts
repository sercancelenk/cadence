import { describe, expect, it } from 'vitest';
import type { AppData, TodoItem } from '../model';
import {
  buildActivityReport,
  buildActivityReportFromData,
  collectActivityRecords,
  getActivityPeriod,
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
});
