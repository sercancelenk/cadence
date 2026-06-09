/**
 * `parseRemoteSnapshot` is the gate that protects local data from
 * being clobbered by a structurally-bogus remote payload. These tests
 * make sure the gate accepts every realistic shape we may receive
 * (from older Cadence builds, partial first-write states, etc.) and
 * rejects everything else — most importantly, `{}` and `null` which
 * are the failure modes that actually showed up in development.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseRemoteSnapshot } from './syncSnapshotGuard';
import { filterPlanningHubItems } from './planningMatrix';
import { collectActivityRecords } from './todoActivityReport';

describe('parseRemoteSnapshot', () => {
  it('accepts a snapshot with teams', () => {
    const result = parseRemoteSnapshot({ teams: [{ id: 't1', name: 'A' }] });
    expect(result.kind).toBe('ok');
  });

  it('accepts a snapshot that only has notes', () => {
    const result = parseRemoteSnapshot({ notes: [{ id: 'n1', title: 'A', body: '' }] });
    expect(result.kind).toBe('ok');
  });

  it('accepts a snapshot with todos only', () => {
    const result = parseRemoteSnapshot({
      todoItems: [{ id: 'tdo1', title: 'A', status: 'todo' }],
    });
    expect(result.kind).toBe('ok');
  });

  it('rejects an empty object', () => {
    const result = parseRemoteSnapshot({});
    expect(result.kind).toBe('invalid');
  });

  it('rejects null', () => {
    const result = parseRemoteSnapshot(null);
    expect(result.kind).toBe('invalid');
  });

  it('rejects a string payload', () => {
    const result = parseRemoteSnapshot('not a snapshot');
    expect(result.kind).toBe('invalid');
  });

  it('rejects a snapshot where the known key is not an array', () => {
    const result = parseRemoteSnapshot({ teams: 'whoops' });
    expect(result.kind).toBe('invalid');
  });

  it('accepts a commit-envelope rolling backup export', () => {
    const result = parseRemoteSnapshot({
      magic: 'CDNC1',
      writeGeneration: 3,
      workspace: {
        version: 3,
        teams: [{ id: 't1', name: 'A', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
        notes: [{ id: 'n1', title: 'Note', body: 'hi', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      },
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.notes).toHaveLength(1);
  });

  it('returns a normalised AppData with at least one team', () => {
    const result = parseRemoteSnapshot({ teams: [], people: [] });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.teams.length).toBeGreaterThan(0); // normaliser seeds a default
  });

  it('accepts the screenshot demo workspace JSON', () => {
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), 'docs/demo/cadence-screenshot-demo.json'), 'utf8'),
    );
    const result = parseRemoteSnapshot(raw);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.notes.length).toBeGreaterThanOrEqual(6);
    expect(result.data.todoItems.length).toBeGreaterThanOrEqual(15);
    expect(filterPlanningHubItems(result.data.todoItems).length).toBeGreaterThanOrEqual(5);
    const activity = collectActivityRecords(result.data, { source: 'personal' });
    expect(activity.length).toBeGreaterThan(0);
  });
});
