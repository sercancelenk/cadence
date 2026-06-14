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
import { describe, expect, it, vi } from 'vitest';
import { parseRemoteSnapshot, snapshotParseErrorMessage } from './syncSnapshotGuard';
import * as model from '../model';
import { appDataToPersistJson, DATA_VERSION } from '../model';
import { filterPlanningHubItems } from './planningMatrix';
import { collectActivityRecords } from './todoActivityReport';

describe('parseRemoteSnapshot', () => {
  const TS = '2026-06-01T12:00:00.000Z';

  /** Typical pre–note-lists export from an older Cadence build. */
  const LEGACY_BACKUP = {
    version: 3,
    teams: [{ id: 't1', name: 'Team', createdAt: TS, status: 'active' }],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [{ id: 'g1', name: 'General', sortOrder: 0, createdAt: TS }],
    todoItems: [{ id: 'td1', groupId: 'g1', title: 'Task', status: 'todo', sortOrder: 0, createdAt: TS, updatedAt: TS }],
    notes: [
      {
        id: 'n1',
        title: 'Legacy note',
        body: 'Important content',
        locked: false,
        pinned: true,
        createdAt: TS,
        updatedAt: TS,
      },
    ],
  };

  it('accepts legacy backups without noteGroups and preserves note content', () => {
    const result = parseRemoteSnapshot(LEGACY_BACKUP);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.noteGroups).toEqual([]);
    expect(result.data.notes).toHaveLength(1);
    expect(result.data.notes[0]).toEqual(
      expect.objectContaining({
        id: 'n1',
        title: 'Legacy note',
        body: 'Important content',
        pinned: true,
      }),
    );
    expect(result.data.notes[0]?.groupId).toBeUndefined();
    expect(result.data.todoItems).toHaveLength(1);
  });

  it('legacy backup survives export round-trip and re-import', () => {
    const first = parseRemoteSnapshot(LEGACY_BACKUP);
    expect(first.kind).toBe('ok');
    if (first.kind !== 'ok') return;

    const exported = JSON.parse(appDataToPersistJson(first.data)) as Record<string, unknown>;
    expect(exported.noteGroups).toBeUndefined();
    const notes = exported.notes as Record<string, unknown>[];
    expect(notes[0]?.groupId).toBeUndefined();
    expect(notes[0]?.title).toBe('Legacy note');

    const second = parseRemoteSnapshot(exported);
    expect(second.kind).toBe('ok');
    if (second.kind !== 'ok') return;
    expect(second.data.notes[0]?.title).toBe('Legacy note');
    expect(second.data.notes[0]?.body).toBe('Important content');
    expect(second.data.todoItems[0]?.title).toBe('Task');
  });

  it('accepts legacy rolling-backup envelope without noteGroups', () => {
    const result = parseRemoteSnapshot({
      magic: 'CDNC1',
      writeGeneration: 12,
      workspace: LEGACY_BACKUP,
    });
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(result.data.notes[0]?.title).toBe('Legacy note');
    expect(result.data.noteGroups).toEqual([]);
  });

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

  it('rethrows unexpected normalisation errors', () => {
    vi.spyOn(model, 'normalizeData').mockImplementation(() => {
      throw new TypeError('unexpected');
    });
    expect(() => parseRemoteSnapshot({ notes: [{ id: 'n1', title: 'A', body: '' }] })).toThrow(
      'unexpected',
    );
    vi.restoreAllMocks();
  });

  it('formats unsupported-version errors for the UI', () => {
    const msg = snapshotParseErrorMessage({
      kind: 'unsupported-version',
      fileVersion: DATA_VERSION + 2,
      error: 'unsupported',
    });
    expect(msg).toMatch(/data version/);
    expect(msg).toMatch(String(DATA_VERSION + 2));
  });

  it('formats invalid snapshot errors for the UI', () => {
    expect(snapshotParseErrorMessage({ kind: 'invalid' })).toMatch(/unrecognisable shape/i);
  });

  it('returns unsupported-version for future workspace files instead of throwing', () => {
    const result = parseRemoteSnapshot({
      version: DATA_VERSION + 1,
      teams: [{ id: 't1', name: 'A', createdAt: TS, status: 'active' }],
      notes: [{ id: 'n1', title: 'Note', body: 'hi', createdAt: TS, updatedAt: TS }],
    });
    expect(result.kind).toBe('unsupported-version');
    if (result.kind === 'unsupported-version') {
      expect(result.fileVersion).toBe(DATA_VERSION + 1);
    }
  });
});
