// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  LEGACY_SELF_PERSON_ID,
  emptyData,
  getLeaderPerson,
  getSelfPerson,
  isLeaderPerson,
  isSelfPerson,
  isTodoOpen,
  normalizeData,
  priorityRank,
  selfPersonIdForTeam,
  shapeOfData,
  teamPeople,
  todoStatusRank,
  type AppData,
} from './index';

/**
 * Regression coverage for the data-loss-prevention work that landed after
 * the user reported "verilerim kayboldu, dosyada var ama UI'da yok":
 *
 *   1. `normalizeData` must auto-clean an orphan `notesLock` (lock metadata
 *      with zero locked notes). Without this, NotesPage would prompt for a
 *      passphrase that no longer unlocks anything → indistinguishable from
 *      "my data is gone" for a non-technical user.
 *
 *   2. `shapeOfData` is the canonical fingerprint we persist to
 *      localStorage on every save. Its semantics must NOT shift between
 *      releases or the boot-time integrity check would either miss real
 *      data-loss events or fire false positives on every other launch.
 *      In particular:
 *        - the auto-seeded `__self__` / `__leader__` people must NOT be
 *          counted (they exist in fresh empty workspaces too)
 *        - archived todo groups MUST be counted (the user's data isn't
 *          gone just because they archived a list — only its visibility)
 *        - the `total` must be non-negative even on a freshly-seeded
 *          workspace (otherwise the integrity banner would fire on the
 *          very first save)
 */
describe('normalizeData — notesLock orphan cleanup', () => {
  it('drops notesLock when no notes are locked', () => {
    const raw: Partial<AppData> = {
      version: 3,
      teams: [],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [],
      todoItems: [],
      notes: [
        {
          id: 'n1',
          title: '',
          body: 'plain',
          locked: false,
          pinned: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      notesLock: {
        saltB64: 'AAAA',
        verifierIvB64: 'BBBB',
        verifierCipherB64: 'CCCC',
      },
    };
    const norm = normalizeData(raw);
    expect(norm.notesLock).toBeUndefined();
    expect(norm.notes).toHaveLength(1);
    expect(norm.notes[0].body).toBe('plain');
  });

  it('preserves notesLock when at least one note is locked', () => {
    const raw: Partial<AppData> = {
      version: 3,
      teams: [],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [],
      todoItems: [],
      notes: [
        {
          id: 'n1',
          title: 'secret',
          body: '',
          locked: true,
          cipher: { ivB64: 'iv', cipherB64: 'ct' },
          pinned: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      notesLock: {
        saltB64: 'AAAA',
        verifierIvB64: 'BBBB',
        verifierCipherB64: 'CCCC',
      },
    };
    const norm = normalizeData(raw);
    expect(norm.notesLock).toBeDefined();
    expect(norm.notesLock?.saltB64).toBe('AAAA');
    expect(norm.notes[0].locked).toBe(true);
  });

  it('a missing notesLock stays missing (no-op)', () => {
    const raw: Partial<AppData> = {
      version: 3,
      teams: [],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [],
      todoItems: [],
      notes: [],
    };
    const norm = normalizeData(raw);
    expect(norm.notesLock).toBeUndefined();
  });
});

describe('normalizeData — profile round-trip', () => {
  it('preserves displayName and profile fields loaded from disk JSON', () => {
    const raw = {
      version: 3,
      teams: [{ id: 't1', name: 'Team', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [{ id: 'g1', name: 'General', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [],
      profile: {
        displayName: 'Sercan Çelenk',
        favoriteTeamIds: ['t1'],
        jobTitle: 'Engineer',
        department: 'Platform',
        phone: '+90 555',
        bio: 'About me',
      },
    };
    const norm = normalizeData(raw);
    expect(norm.profile?.displayName).toBe('Sercan Çelenk');
    expect(norm.profile?.jobTitle).toBe('Engineer');
    expect(norm.profile?.department).toBe('Platform');
    expect(norm.profile?.phone).toBe('+90 555');
    expect(norm.profile?.bio).toBe('About me');
    expect(norm.profile?.favoriteTeamIds).toEqual(['t1']);
  });

  it('does not reset displayName to Me when profile object is absent', () => {
    const norm = normalizeData({ version: 3 });
    expect(norm.profile?.displayName).toBe('Me');
  });
});

describe('shapeOfData — last-known-good fingerprint', () => {
  it('returns zeroed shape for null / undefined', () => {
    expect(shapeOfData(null)).toEqual({
      teams: 0,
      people: 0,
      items: 0,
      todoGroups: 0,
      todoItems: 0,
      notes: 0,
      total: 0,
    });
    expect(shapeOfData(undefined)).toEqual({
      teams: 0,
      people: 0,
      items: 0,
      todoGroups: 0,
      todoItems: 0,
      notes: 0,
      total: 0,
    });
  });

  it('excludes auto-seeded __self__ / __leader__ people from total', () => {
    // A freshly-seeded workspace has exactly:
    //   - 1 team ("My first team") → subtracted by the -1 in total
    //   - 2 people (__self__, __leader__) → filtered out entirely
    //   - 1 default "General" todoGroup (from defaultTodoBundle)
    // The integrity banner's shrink check uses a 50%/min-3 threshold,
    // so a freshly-seeded total of 1 is well below the alarm floor and
    // won't fire false positives on a brand-new install.
    const fresh = normalizeData({ version: 3 });
    const shape = shapeOfData(fresh);
    expect(shape.teams).toBe(1);
    expect(shape.people).toBe(0); // auto-seeded people are filtered out
    expect(shape.todoItems).toBe(0);
    expect(shape.notes).toBe(0);
    // total stays small enough that the boot integrity heuristic (drop
    // ≥ 3 AND ≥ 50% of previous) cannot trip on a fresh-install bounce.
    expect(shape.total).toBeLessThanOrEqual(2);
  });

  it('counts archived todo groups (visibility ≠ existence)', () => {
    // Archiving every list does NOT delete data — the user can still
    // restore the items by toggling "Show archived". The fingerprint
    // must reflect the underlying data, not the filter state, or
    // archiving would falsely fire the data-loss banner.
    const raw: Partial<AppData> = {
      version: 3,
      teams: [
        { id: 't1', name: 'Team', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' },
      ],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [
        { id: 'g1', name: 'G1', sortOrder: 0, archived: true, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'g2', name: 'G2', sortOrder: 1, archived: true, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 't',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          sortOrder: 0,
        },
      ],
      notes: [],
    };
    const norm = normalizeData(raw);
    const shape = shapeOfData(norm);
    expect(shape.todoGroups).toBe(2);
    expect(shape.todoItems).toBe(1);
    expect(shape.total).toBeGreaterThan(0);
  });

  it('total scales with content; useful for shrink detection', () => {
    // Sanity: two workspaces that obviously differ in size must have
    // monotonically different totals. The boot-time check relies on
    // this monotonicity for its 50%-shrink heuristic.
    const small = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 't',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          sortOrder: 0,
        },
      ],
      todoGroups: [
        { id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });
    const big = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      todoGroups: [
        { id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
      todoItems: Array.from({ length: 20 }, (_, i) => ({
        id: `i${i}`,
        groupId: 'g1',
        title: 't',
        status: 'todo' as const,
        done: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        sortOrder: i,
      })),
      notes: Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        title: '',
        body: 'x',
        locked: false,
        pinned: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })),
    });
    expect(shapeOfData(big).total).toBeGreaterThan(shapeOfData(small).total);
  });
});

/**
 * `sourceNoteId` is the cross-link that lets a todo show a 📝 backlink
 * chip and a note show a "Tasks from this note" panel. The migration
 * has to preserve it through a normalize round-trip without leaking
 * empty strings or non-string junk into the persisted file (any of
 * those would corrupt the backlinks panel's filter).
 */
describe('TodoItem — sourceNoteId migration', () => {
  it('preserves a valid sourceNoteId across a normalize round-trip', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 'extracted',
          status: 'todo',
          done: false,
          sourceNoteId: 'note-42',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.todoItems[0]?.sourceNoteId).toBe('note-42');
  });

  it('drops empty / non-string sourceNoteId so empty pills never render', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 'a',
          status: 'todo',
          done: false,
          sourceNoteId: '   ',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'i2',
          groupId: 'g1',
          title: 'b',
          status: 'todo',
          done: false,
          sourceNoteId: 12345 as unknown as string,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.todoItems[0]?.sourceNoteId).toBeUndefined();
    expect(norm.todoItems[1]?.sourceNoteId).toBeUndefined();
  });

  it('older items without the field load with sourceNoteId left undefined', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 'legacy',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.todoItems[0]).toBeDefined();
    // Field is undefined (not omitted) — the UI branches on truthy
    // string ID, so undefined renders no chip / no backlink, which is
    // the legacy behaviour we need to preserve.
    expect(norm.todoItems[0]!.sourceNoteId).toBeUndefined();
  });
});

/**
 * Multi-line `title` repair. Older builds (and stray paste-into-title
 * accidents) could land a multi-line blob in `title` with the body
 * trapped after newline characters. The closed-view CSS uses
 * `white-space: pre-wrap` and a 2-line clamp, which makes those rows
 * look broken (truncated mid-content, no body chip), and once
 * expanded the trailing lines render in title typography rather than
 * through MarkdownView. parseTodoItems splits the title on the first
 * non-empty line on every load so the row reaches the renderer in
 * the same shape as a freshly-typed task.
 */
describe('TodoItem — multi-line title rescue', () => {
  it('splits a multi-line title into single-line title + body', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: "Enter passphrase for key '/Users/me/.ssh/id_rsa':\n\nEnumerating objects: 31, done.\nCounting objects: 100% (31/31), done.",
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const it = norm.todoItems[0]!;
    expect(it.title).toBe("Enter passphrase for key '/Users/me/.ssh/id_rsa':");
    expect(it.title).not.toContain('\n');
    expect(it.body).toBe('Enumerating objects: 31, done.\nCounting objects: 100% (31/31), done.');
  });

  it('prepends rescued lines to a pre-existing body so nothing is lost', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 'Plan the launch\nFollow-up notes from Maria',
          body: 'Existing markdown body',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const it = norm.todoItems[0]!;
    expect(it.title).toBe('Plan the launch');
    expect(it.body).toBe('Follow-up notes from Maria\n\nExisting markdown body');
  });

  it('leaves a leading-#-style heading title clean', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: '# Onboarding plan\n\nSchedule kickoff with the team',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const it = norm.todoItems[0]!;
    expect(it.title).toBe('Onboarding plan');
    expect(it.body).toBe('Schedule kickoff with the team');
  });

  it('leaves single-line titles untouched', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 'Buy groceries',
          body: 'milk, eggs',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const it = norm.todoItems[0]!;
    expect(it.title).toBe('Buy groceries');
    expect(it.body).toBe('milk, eggs');
  });
});

describe('normalizeData — load edge cases', () => {
  it('returns emptyData for null, undefined, and non-objects', () => {
    expect(normalizeData(null).version).toBe(3);
    expect(normalizeData(undefined).teams.length).toBeGreaterThan(0);
    const bad = normalizeData('bad');
    expect(bad.teams.length).toBeGreaterThan(0);
    expect(bad.notes).toEqual([]);
    expect(bad.todoItems).toEqual([]);
  });

  it('migrates v1 files with legacy __self person id', () => {
    const norm = normalizeData({
      version: 1,
      people: [{ id: LEGACY_SELF_PERSON_ID, name: 'Legacy Me' }],
      items: [{ id: 'i1', personId: LEGACY_SELF_PERSON_ID, kind: 'task', title: 't', body: '', done: false }],
    });
    const teamId = norm.teams[0]!.id;
    const newSelfId = selfPersonIdForTeam(teamId);
    expect(norm.people.some((p) => p.id === newSelfId && p.isSelf)).toBe(true);
    expect(norm.items[0]?.personId).toBe(newSelfId);
    expect(norm.teams[0]?.name).toBe('Default team');
  });

  it('creates a default team when teams array is empty', () => {
    const norm = normalizeData({ version: 3, teams: [], people: [], items: [] });
    expect(norm.teams).toHaveLength(1);
    expect(norm.teams[0]?.name).toBe('My first team');
  });

  it('drops junk notifiedReminderIds and invalid lastTeamId', () => {
    const norm = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'T', createdAt: '2026-01-01T00:00:00.000Z' }],
      notifiedReminderIds: ['ok', 123, null],
      lastTeamId: 'missing-team',
    });
    expect(norm.notifiedReminderIds).toEqual(['ok']);
    expect(norm.lastTeamId).toBe('t1');
  });

  it('parses locked notes with cipher and strips plaintext body', () => {
    const norm = normalizeData({
      version: 3,
      notes: [
        {
          id: 'n1',
          title: 'Secret',
          body: 'should-not-keep',
          locked: true,
          cipher: { ivB64: 'iv', cipherB64: 'ct' },
        },
      ],
    });
    expect(norm.notes[0]?.body).toBe('');
    expect(norm.notes[0]?.cipher?.cipherB64).toBe('ct');
  });

  it('reassigns todo items to the first group when groupId is unknown', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'missing',
          title: 'orphan',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.todoItems[0]?.groupId).toBe('g1');
  });

  it('derives todo status from done when status is invalid', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'i1',
          groupId: 'g1',
          title: 'legacy done',
          status: 'unknown-status',
          done: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.todoItems[0]?.status).toBe('done');
    expect(norm.todoItems[0]?.done).toBe(true);
  });

  it('normalizes goal items and strips goal fields from non-goals', () => {
    const norm = normalizeData({
      version: 3,
      items: [
        {
          id: 'g1',
          personId: 'p1',
          kind: 'goal',
          title: 'Ship',
          body: '',
          goalStatus: 'bogus',
          done: true,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'n1',
          personId: 'p1',
          kind: 'note',
          title: 'Note',
          body: '',
          goalStatus: 'active',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.items[0]?.goalStatus).toBe('completed');
    expect(norm.items[0]?.done).toBe(true);
    expect(norm.items[1]?.goalStatus).toBeUndefined();
  });

  it('parses utility document and structured text payloads', () => {
    const norm = normalizeData({
      version: 3,
      utilityDocument: { body: '# Doc', bodyFormat: 'markdown', updatedAt: '2026-01-01T00:00:00.000Z' },
      utilityStructuredText: {
        content: '{"a":1}',
        diffContent: '{"a":2}',
        language: 'json',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    });
    expect(norm.utilityDocument?.body).toBe('# Doc');
    expect(norm.utilityStructuredText?.content).toBe('{"a":1}');
    expect(norm.utilityStructuredText?.language).toBe('json');
  });

  it('creates a fallback team when people lack a valid teamId and the first team has no id', () => {
    const norm = normalizeData({
      version: 3,
      teams: [{ id: '', name: 'Broken', createdAt: '2026-01-01T00:00:00.000Z' }],
      people: [
        {
          id: 'p-orphan',
          teamId: '',
          name: 'Floater',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const fallback = norm.teams.find((t) => t.name === 'Team');
    expect(fallback).toBeTruthy();
    expect(norm.people.find((p) => p.id === 'p-orphan')?.teamId).toBe(fallback?.id);
  });

  it('filters invalid favorite team ids from profile', () => {
    const norm = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      profile: { displayName: 'User', favoriteTeamIds: ['t1', 'ghost'] },
    });
    expect(norm.profile?.favoriteTeamIds).toEqual(['t1']);
  });
});

describe('model helpers', () => {
  it('priorityRank defaults unknown values to normal rank', () => {
    expect(priorityRank(undefined)).toBe(2);
    expect(priorityRank('urgent')).toBe(0);
    expect(priorityRank('bogus' as 'low')).toBe(2);
  });

  it('todoStatusRank and isTodoOpen classify lifecycle states', () => {
    expect(todoStatusRank('todo')).toBeLessThan(todoStatusRank('done'));
    expect(isTodoOpen('in_progress')).toBe(true);
    expect(isTodoOpen('done')).toBe(false);
    expect(isTodoOpen('cancelled')).toBe(false);
  });

  it('self/leader helpers resolve seeded people for a team', () => {
    const d = emptyData();
    const teamId = d.teams[0]!.id;
    const self = getSelfPerson(d, teamId);
    const leader = getLeaderPerson(d, teamId);
    expect(self && isSelfPerson(self)).toBe(true);
    expect(leader && isLeaderPerson(leader)).toBe(true);
    expect(teamPeople(d, teamId)).toEqual([]);
  });
});

describe('normalizeData — additional edge cases', () => {
  it('parses notesLock recovery envelope and AI extraction guidance', () => {
    const norm = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      notesLock: {
        saltB64: 's',
        verifierIvB64: 'iv',
        verifierCipherB64: 'c',
        recovery: { saltB64: 'rs', ivB64: 'riv', cipherB64: 'rc' },
      },
      notes: [
        {
          id: 'n1',
          title: 'locked',
          body: '',
          locked: true,
          cipher: { ivB64: 'iv', cipherB64: 'ct' },
          pinned: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      aiSettings: {
        provider: 'anthropic',
        extractionGuidance: 'Extract tasks only',
      },
    });
    expect(norm.notesLock?.recovery?.cipherB64).toBe('rc');
    expect(norm.aiSettings?.extractionGuidance).toBe('Extract tasks only');
  });

  it('reattaches people missing teamId to the first team', () => {
    const norm = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'T', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      people: [{ id: 'p1', name: 'Orphan', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    expect(norm.people.find((p) => p.id === 'p1')?.teamId).toBe('t1');
  });

  it('leaves multi-line titles unchanged when every line is blank', () => {
    const norm = normalizeData({
      version: 3,
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 't1',
          groupId: 'g1',
          title: '\n\n',
          status: 'todo',
          done: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    expect(norm.todoItems[0]?.title).toBe('\n\n');
  });
});
