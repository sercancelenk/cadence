import { describe, it, expect } from 'vitest';
import {
  AI_PROVIDER_OPTIONS,
  DATA_VERSION,
  FEEDBACK_KIND_OPTIONS,
  GOAL_STATUS_OPTIONS,
  LEGACY_SELF_PERSON_ID,
  PRIORITY_OPTIONS,
  REMIND_REPEAT_OPTIONS,
  TODO_STATUS_OPTIONS,
  emptyData,
  appDataToPersistJson,
  getLeaderPerson,
  getSelfPerson,
  getSkipLevelPerson,
  isLeaderPerson,
  isSelfPerson,
  isSkipLevelPerson,
  isSyntheticPerson,
  isTodoOpen,
  isTodoItemArchived,
  isNoteArchived,
  leaderPersonIdForTeam,
  normalizeData,
  nowIso,
  priorityRank,
  selfPersonIdForTeam,
  skipLevelPersonIdForTeam,
  shapeOfData,
  teamPeople,
  todoStatusRank,
  type AppData,
  type Item,
  type TodoItem,
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
 *        - the auto-seeded `__self__` / `__leader__` / `__skiplevel__` people must NOT be
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

/**
 * `withExtras` carries unknown fields through a load → save round-trip so an
 * older build doesn't drop data written by a newer build. These tests lock
 * down its two load-bearing invariants:
 *
 *   1. CONFIDENTIALITY — it must NEVER resurrect a stripped secret. A locked
 *      note's plaintext `body` / `bodyPlainText` are deliberately dropped; the
 *      parser emits them as explicit (empty/undefined) keys so `withExtras`
 *      treats them as "known" and does not copy the raw plaintext back. If a
 *      refactor ever breaks that, this test fails instead of silently leaking
 *      plaintext into the saved (and synced) file.
 *   2. FORWARD-COMPAT — genuinely-unknown top-level keys survive untouched.
 */
describe('normalizeData — withExtras invariants', () => {
  const baseRaw = {
    version: 3,
    teams: [{ id: 't1', name: 'Team', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
    people: [],
    items: [],
    notifiedReminderIds: [],
    todoGroups: [{ id: 'g1', name: 'General', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
    todoItems: [],
  };

  it('never resurrects a locked note plaintext body/bodyPlainText', () => {
    const norm = normalizeData({
      ...baseRaw,
      notes: [
        {
          id: 'n1',
          title: 'Secret',
          locked: true,
          cipher: { ivB64: 'aaaa', cipherB64: 'bbbb' },
          // Hostile / leftover plaintext that must be discarded for a locked note.
          body: 'TOP SECRET plaintext',
          bodyPlainText: 'TOP SECRET plaintext',
          // A field a newer build might add — should be carried through.
          futureNoteField: { tag: 'keep-me' },
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const note = norm.notes.find((n) => n.id === 'n1');
    expect(note).toBeDefined();
    expect(note?.locked).toBe(true);
    expect(note?.body).toBe('');
    expect(note?.bodyPlainText).toBeUndefined();
    // The serialized form must not leak the plaintext anywhere.
    expect(JSON.stringify(note)).not.toContain('TOP SECRET');
    // ...but an unknown forward-compat field on the note is preserved.
    expect((note as unknown as Record<string, unknown>).futureNoteField).toEqual({
      tag: 'keep-me',
    });
  });

  it('preserves unknown top-level keys for forward compatibility', () => {
    const norm = normalizeData({
      ...baseRaw,
      // A whole collection a newer Cadence build might introduce.
      futureCollection: [{ id: 'x1', value: 42 }],
    });
    expect((norm as unknown as Record<string, unknown>).futureCollection).toEqual([
      { id: 'x1', value: 42 },
    ]);
    // Known fields still win and are normalized as usual.
    expect(norm.version).toBe(DATA_VERSION);
  });

  it('keeps plaintext when a note claims locked but carries no usable cipher', () => {
    const norm = normalizeData({
      ...baseRaw,
      notes: [
        {
          id: 'n2',
          title: 'Half-locked',
          locked: true,
          // No cipher persisted yet (interrupted lock-write / broken peer).
          body: 'recoverable plaintext',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const note = norm.notes.find((n) => n.id === 'n2');
    expect(note).toBeDefined();
    // Degrades to unlocked-with-content rather than a permanently-empty shell.
    expect(note?.locked).toBe(false);
    expect(note?.body).toBe('recoverable plaintext');
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

  it('excludes auto-seeded __self__ / __leader__ / __skiplevel__ people from total', () => {
    // A freshly-seeded workspace has exactly:
    //   - 1 team ("My first team") → subtracted by the -1 in total
    //   - 3 people (__self__, __leader__, __skiplevel__) → filtered out entirely
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

  it('treats version-less modern-shaped exports as v2+ instead of v1 migration', () => {
    const norm = normalizeData({
      teams: [{ id: 't1', name: 'Team A', createdAt: '2026-01-01T00:00:00.000Z', status: 'active' }],
      todoGroups: [{ id: 'g1', name: 'General', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' }],
      todoItems: [
        {
          id: 'todo-1',
          groupId: 'g1',
          title: 'Keep me',
          status: 'todo',
          done: false,
          sortOrder: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      people: [],
      items: [],
      notes: [],
    });
    expect(norm.todoItems).toHaveLength(1);
    expect(norm.todoItems[0]?.title).toBe('Keep me');
    expect(norm.teams[0]?.name).toBe('Team A');
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

  it('isTodoItemArchived is true only when archived flag is set', () => {
    expect(isTodoItemArchived({ archived: true })).toBe(true);
    expect(isTodoItemArchived({ archived: undefined })).toBe(false);
    expect(isTodoItemArchived({ archived: false })).toBe(false);
  });

  it('isNoteArchived is true only when archived flag is set', () => {
    expect(isNoteArchived({ archived: true })).toBe(true);
    expect(isNoteArchived({ archived: undefined })).toBe(false);
    expect(isNoteArchived({ archived: false })).toBe(false);
  });

  it('self/leader/skip-level helpers resolve seeded people for a team', () => {
    const d = emptyData();
    const teamId = d.teams[0]!.id;
    const self = getSelfPerson(d, teamId);
    const leader = getLeaderPerson(d, teamId);
    const skipLevel = getSkipLevelPerson(d, teamId);
    expect(self && isSelfPerson(self)).toBe(true);
    expect(leader && isLeaderPerson(leader)).toBe(true);
    expect(skipLevel && isSkipLevelPerson(skipLevel)).toBe(true);
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

describe('model constants and helpers — exact shapes', () => {
  it('exports stable option tables used by parsers', () => {
    expect(GOAL_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'planned',
      'active',
      'completed',
      'cancelled',
    ]);
    expect(FEEDBACK_KIND_OPTIONS.map((o) => o.value)).toEqual(['praise', 'coaching', 'concern']);
    expect(REMIND_REPEAT_OPTIONS.map((o) => o.value)).toEqual(['', 'daily', 'weekly', 'monthly']);
    expect(TODO_STATUS_OPTIONS.map((o) => o.value)).toEqual([
      'todo',
      'in_progress',
      'done',
      'cancelled',
    ]);
    expect(PRIORITY_OPTIONS.map((o) => o.value)).toEqual(['urgent', 'high', 'normal', 'low']);
    expect(AI_PROVIDER_OPTIONS.map((o) => o.value)).toEqual(['anthropic', 'openai', 'gemini']);
    expect(DATA_VERSION).toBe(3);
  });

  it('priorityRank returns exact ranks for each priority and defaults', () => {
    expect(priorityRank(undefined)).toBe(2);
    expect(priorityRank('urgent')).toBe(0);
    expect(priorityRank('high')).toBe(1);
    expect(priorityRank('normal')).toBe(2);
    expect(priorityRank('low')).toBe(3);
    expect(priorityRank('bogus' as 'low')).toBe(2);
  });

  it('todoStatusRank and isTodoOpen cover every lifecycle branch', () => {
    expect(todoStatusRank(undefined)).toBe(0);
    expect(todoStatusRank('todo')).toBe(0);
    expect(todoStatusRank('in_progress')).toBe(1);
    expect(todoStatusRank('done')).toBe(2);
    expect(todoStatusRank('cancelled')).toBe(3);
    expect(todoStatusRank('bogus' as 'todo')).toBe(0);
    expect(isTodoOpen(undefined)).toBe(false);
    expect(isTodoOpen('todo')).toBe(true);
    expect(isTodoOpen('in_progress')).toBe(true);
    expect(isTodoOpen('done')).toBe(false);
    expect(isTodoOpen('cancelled')).toBe(false);
  });

  it('team-scoped self/leader/skip-level id helpers round-trip', () => {
    expect(selfPersonIdForTeam('team-a')).toBe('__self__team-a');
    expect(leaderPersonIdForTeam('team-a')).toBe('__leader__team-a');
    expect(skipLevelPersonIdForTeam('team-a')).toBe('__skiplevel__team-a');
  });

  it('isSelfPerson / isLeaderPerson / isSkipLevelPerson detect ids without flags', () => {
    expect(isSelfPerson({ id: '__self__x', isSelf: false })).toBe(true);
    expect(isSelfPerson({ id: 'p1', isSelf: true })).toBe(true);
    expect(isSelfPerson({ id: 'p1', isSelf: false })).toBe(false);
    expect(isLeaderPerson({ id: '__leader__x' })).toBe(true);
    expect(isLeaderPerson({ id: 'p1' })).toBe(false);
    expect(isSkipLevelPerson({ id: '__skiplevel__x' })).toBe(true);
    expect(isSkipLevelPerson({ id: 'p1' })).toBe(false);
    expect(isSyntheticPerson({ id: '__skiplevel__x' })).toBe(true);
    expect(isSyntheticPerson({ id: 'p1' })).toBe(false);
  });

  it('nowIso returns a parseable ISO timestamp', () => {
    const t = nowIso();
    expect(Number.isNaN(Date.parse(t))).toBe(false);
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('emptyData — seeded workspace shape', () => {
  it('matches the canonical empty-workspace scaffold', () => {
    const d = emptyData();
    const teamId = d.teams[0]!.id;
    expect(d.version).toBe(3);
    expect(d.teams).toEqual([
      expect.objectContaining({ name: 'My first team', status: 'active' }),
    ]);
    expect(d.people).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: selfPersonIdForTeam(teamId),
          teamId,
          name: 'Me',
          isSelf: true,
          scratchpad: '',
        }),
        expect.objectContaining({
          id: leaderPersonIdForTeam(teamId),
          teamId,
          name: 'My leader',
          scratchpad: '',
        }),
        expect.objectContaining({
          id: skipLevelPersonIdForTeam(teamId),
          teamId,
          name: 'Skip-level leader',
          scratchpad: '',
        }),
      ]),
    );
    expect(d.items).toEqual([]);
    expect(d.notes).toEqual([]);
    expect(d.todoItems).toEqual([]);
    expect(d.todoGroups).toHaveLength(1);
    expect(d.todoGroups[0]).toEqual(
      expect.objectContaining({ name: 'General', sortOrder: 0 }),
    );
    expect(d.profile).toEqual({ displayName: 'Me', favoriteTeamIds: [] });
    expect(d.lastTeamId).toBe(teamId);
    expect(d.notifiedReminderIds).toEqual([]);
  });
});

describe('normalizeData — exhaustive parse/load/migration', () => {
  const TS = '2026-06-01T12:00:00.000Z';

  function baseV3(overrides: Record<string, unknown> = {}) {
    return {
      version: 3,
      teams: [{ id: 't1', name: 'Alpha', createdAt: TS, status: 'active' }],
      people: [
        {
          id: 'p1',
          teamId: 't1',
          name: 'Pat',
          title: 'IC',
          scratchpad: 'notes',
          agenda: '# 1:1',
          createdAt: TS,
        },
      ],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: TS }],
      todoItems: [],
      notes: [],
      ...overrides,
    };
  }

  it('parses team statuses and defaults invalid status to active', () => {
    const norm = normalizeData({
      ...baseV3(),
      teams: [
        { id: 't1', name: 'A', createdAt: TS, status: 'paused' },
        { id: 't2', name: '  ', createdAt: TS, status: 'archived' },
        { id: 't3', name: '', createdAt: TS, status: 'bogus' },
      ],
    });
    expect(norm.teams).toEqual([
      { id: 't1', name: 'A', createdAt: TS, status: 'paused' },
      { id: 't2', name: 'Team', createdAt: TS, status: 'archived' },
      expect.objectContaining({ id: 't3', name: 'Team', status: 'active' }),
    ]);
  });

  it('parses people with __self__ id prefix as self even without isSelf flag', () => {
    const norm = normalizeData({
      ...baseV3(),
      people: [{ id: '__self__t1', teamId: 't1', name: 'Me', createdAt: TS }],
    });
    const self = norm.people.find((p) => p.id === '__self__t1');
    expect(self).toEqual(
      expect.objectContaining({ isSelf: true, name: 'Me', scratchpad: '', agenda: '' }),
    );
  });

  it('assigns generated ids and Unnamed for junk people rows', () => {
    const norm = normalizeData({
      ...baseV3(),
      people: [{ teamId: 't1', name: '   ', createdAt: TS }, null, 'x'],
    });
    const unnamed = norm.people.find((p) => p.name === 'Unnamed');
    expect(unnamed).toEqual(
      expect.objectContaining({ teamId: 't1', scratchpad: '', agenda: '' }),
    );
    expect(unnamed!.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('parses each item kind with exact field shapes', () => {
    const items: Partial<Item>[] = [
      {
        id: 'task-1',
        personId: 'p1',
        kind: 'task',
        title: 'Task',
        body: 'body',
        category: '  Ops  ',
        dueAt: TS,
        remindAt: TS,
        remindRepeat: 'daily',
        done: false,
        url: 'https://x.test',
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'goal-1',
        personId: 'p1',
        kind: 'goal',
        title: 'Goal',
        body: '',
        goalStatus: 'active',
        startAt: TS,
        done: false,
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'fb-1',
        personId: 'p1',
        kind: 'feedback',
        title: 'FB',
        body: '',
        feedbackKind: 'praise',
        done: false,
        createdAt: TS,
        updatedAt: TS,
      },
      {
        id: 'doc-1',
        personId: 'p1',
        kind: 'document',
        title: 'Doc',
        body: 'x',
        done: true,
        createdAt: TS,
        updatedAt: TS,
      },
    ];
    const norm = normalizeData({ ...baseV3(), items });
    expect(norm.items[0]).toEqual({
      id: 'task-1',
      personId: 'p1',
      kind: 'task',
      title: 'Task',
      body: 'body',
      category: 'Ops',
      dueAt: TS,
      startAt: undefined,
      goalStatus: undefined,
      feedbackKind: undefined,
      remindAt: TS,
      remindRepeat: 'daily',
      done: false,
      doneAt: undefined,
      url: 'https://x.test',
      createdAt: TS,
      updatedAt: TS,
    });
    expect(norm.items[1]).toEqual(
      expect.objectContaining({ kind: 'goal', goalStatus: 'active', startAt: TS, done: false }),
    );
    expect(norm.items[2]).toEqual(
      expect.objectContaining({ kind: 'feedback', feedbackKind: 'praise' }),
    );
    expect(norm.items[3]).toEqual(expect.objectContaining({ kind: 'document', done: true }));
  });

  it('defaults invalid item kind to note and feedback without kind to coaching', () => {
    const norm = normalizeData({
      ...baseV3(),
      items: [
        {
          id: 'n1',
          personId: 'p1',
          kind: 'bogus',
          title: 'T',
          body: '',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'f1',
          personId: 'p1',
          kind: 'feedback',
          title: 'F',
          body: '',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.items[0]?.kind).toBe('note');
    expect(norm.items[1]?.feedbackKind).toBe('coaching');
  });

  it('normalizes each goal status and maps done from completed', () => {
    for (const status of ['planned', 'active', 'completed', 'cancelled'] as const) {
      const norm = normalizeData({
        ...baseV3(),
        items: [
          {
            id: 'g',
            personId: 'p1',
            kind: 'goal',
            title: 'G',
            body: '',
            goalStatus: status,
            done: false,
            createdAt: TS,
            updatedAt: TS,
          },
        ],
      });
      expect(norm.items[0]?.goalStatus).toBe(status);
      expect(norm.items[0]?.done).toBe(status === 'completed');
    }
  });

  it('derives planned goal status when goalStatus is invalid and not done', () => {
    const norm = normalizeData({
      ...baseV3(),
      items: [
        {
          id: 'g',
          personId: 'p1',
          kind: 'goal',
          title: 'G',
          body: '',
          goalStatus: 'nope',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.items[0]).toEqual(
      expect.objectContaining({ goalStatus: 'planned', done: false }),
    );
  });

  it('strips invalid remindRepeat and empty categories', () => {
    const norm = normalizeData({
      ...baseV3(),
      items: [
        {
          id: 'i',
          personId: 'p1',
          kind: 'task',
          title: 'T',
          body: '',
          category: '   ',
          remindRepeat: 'yearly',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.items[0]?.category).toBeUndefined();
    expect(norm.items[0]?.remindRepeat).toBeUndefined();
  });

  it('parses todo groups with pinned, archived, and priority', () => {
    const norm = normalizeData({
      ...baseV3(),
      todoGroups: [
        {
          id: 'g1',
          name: '  List  ',
          sortOrder: 0,
          pinned: true,
          archived: true,
          priority: 'urgent',
          createdAt: TS,
        },
        { id: 'g2', name: 'Fallback', sortOrder: 1, priority: 'nope', createdAt: TS },
      ],
    });
    expect(norm.todoGroups[0]).toEqual({
      id: 'g1',
      name: 'List',
      sortOrder: 0,
      pinned: true,
      archived: true,
      priority: 'urgent',
      createdAt: TS,
    });
    expect(norm.todoGroups[1]).toEqual({
      id: 'g2',
      name: 'Fallback',
      sortOrder: 1,
      pinned: undefined,
      archived: undefined,
      priority: undefined,
      createdAt: TS,
    });
  });

  it('parses each todo status and syncs done with status', () => {
    const cases: { status: string; done: boolean; expected: TodoItem['status']; resolvedDone: boolean }[] = [
      { status: 'todo', done: false, expected: 'todo', resolvedDone: false },
      { status: 'in_progress', done: false, expected: 'in_progress', resolvedDone: false },
      { status: 'done', done: false, expected: 'done', resolvedDone: true },
      { status: 'cancelled', done: true, expected: 'cancelled', resolvedDone: false },
    ];
    for (const c of cases) {
      const norm = normalizeData({
        ...baseV3(),
        todoItems: [
          {
            id: 'ti',
            groupId: 'g1',
            title: 'T',
            status: c.status,
            done: c.done,
            createdAt: TS,
            updatedAt: TS,
          },
        ],
      });
      expect(norm.todoItems[0]?.status).toBe(c.expected);
      expect(norm.todoItems[0]?.done).toBe(c.resolvedDone);
    }
  });

  it('parses todo remindRepeat, bodyFormat, priority, and trims whitespace-only body', () => {
    const norm = normalizeData({
      ...baseV3(),
      todoItems: [
        {
          id: 'ti',
          groupId: 'g1',
          title: 'T',
          body: '   ',
          bodyFormat: 'prosemirror',
          bodyPlainText: 'plain',
          status: 'todo',
          done: false,
          priority: 'low',
          remindAt: TS,
          remindRepeat: 'weekly',
          sortOrder: 3,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.todoItems[0]).toEqual({
      id: 'ti',
      groupId: 'g1',
      title: 'T',
      body: undefined,
      bodyFormat: 'prosemirror',
      bodyPlainText: 'plain',
      status: 'todo',
      done: false,
      doneAt: undefined,
      dueAt: undefined,
      priority: 'low',
      remindAt: TS,
      remindRepeat: 'weekly',
      sortOrder: 3,
      sourceNoteId: undefined,
      createdAt: TS,
      updatedAt: TS,
    });
  });

  it('parses optional planning hub fields on todos', () => {
    const norm = normalizeData({
      ...baseV3(),
      todoItems: [
        {
          id: 'p1',
          groupId: 'g1',
          title: 'Plan me',
          status: 'todo',
          done: false,
          planInHub: true,
          planImportant: true,
          planUrgent: false,
          planFocusToday: true,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'p2',
          groupId: 'g1',
          title: 'Legacy',
          status: 'todo',
          done: false,
          planInHub: 'yes',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.todoItems[0]?.planInHub).toBe(true);
    expect(norm.todoItems[0]?.planImportant).toBe(true);
    expect(norm.todoItems[0]?.planUrgent).toBe(false);
    expect(norm.todoItems[0]?.planFocusToday).toBe(true);
    expect(norm.todoItems[1]?.planInHub).toBeUndefined();
  });

  it('creates Genel todo group when todoGroups array is empty', () => {
    const norm = normalizeData({ ...baseV3(), todoGroups: [] });
    expect(norm.todoGroups).toHaveLength(1);
    expect(norm.todoGroups[0]?.name).toBe('Genel');
    expect(norm.todoGroups[0]?.sortOrder).toBe(0);
  });

  it('parses notes: skips invalid rows, locked cipher, and plaintext stripping', () => {
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        null,
        { title: 'no-id' },
        {
          id: 'n-open',
          title: 'Open',
          body: 'text',
          bodyFormat: 'markdown',
          bodyPlainText: 'plain',
          pinned: true,
          sortOrder: 1,
          lastOpenedAt: TS,
          locked: false,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'n-lock',
          title: 'Locked',
          body: 'must-strip',
          locked: true,
          cipher: { ivB64: 'iv', cipherB64: 'ct' },
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'n-bad-cipher',
          title: 'Bad',
          body: 'x',
          locked: true,
          cipher: { ivB64: 1, cipherB64: null },
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.notes).toHaveLength(3);
    expect(norm.notes[0]).toEqual({
      id: 'n-open',
      title: 'Open',
      body: 'text',
      bodyFormat: 'markdown',
      bodyPlainText: 'plain',
      locked: false,
      cipher: undefined,
      attachmentRefs: undefined,
      lockedBodySignature: undefined,
      pinned: true,
      sortOrder: 1,
      lastOpenedAt: TS,
      archived: undefined,
      groupId: undefined,
      createdAt: TS,
      updatedAt: TS,
    });
    expect(norm.notes[1]).toEqual(
      expect.objectContaining({ id: 'n-lock', body: '', locked: true, cipher: { ivB64: 'iv', cipherB64: 'ct' } }),
    );
    expect(norm.notes[2]?.cipher).toBeUndefined();
  });

  it('recovers plaintext when a note is flagged locked but has no usable cipher', () => {
    // Simulates an interrupted lock-write (or sync from a broken peer): the
    // row says locked:true but the cipher never made it to disk while the
    // plaintext body is still present. We must NOT discard the plaintext into
    // a permanently-locked empty shell.
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        {
          id: 'n-half-locked',
          title: 'Recoverable',
          body: 'still here',
          bodyFormat: 'markdown',
          bodyPlainText: 'still here',
          locked: true,
          cipher: { ivB64: 1, cipherB64: null },
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    const note = norm.notes.find((n) => n.id === 'n-half-locked')!;
    expect(note.locked).toBe(false);
    expect(note.body).toBe('still here');
    expect(note.bodyPlainText).toBe('still here');
    expect(note.cipher).toBeUndefined();
  });

  it('keeps a genuinely-locked note locked when its cipher is valid', () => {
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        {
          id: 'n-locked',
          title: 'Secret',
          body: 'should-be-stripped',
          locked: true,
          cipher: { ivB64: 'aXY=', cipherB64: 'Y2lwaA==' },
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    const note = norm.notes.find((n) => n.id === 'n-locked')!;
    expect(note.locked).toBe(true);
    expect(note.body).toBe('');
    expect(note.cipher).toEqual({ ivB64: 'aXY=', cipherB64: 'Y2lwaA==' });
  });

  it('does not create note lists or assign groupId when loading legacy workspaces', () => {
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        {
          id: 'n1',
          title: 'Legacy note',
          body: 'hello',
          locked: false,
          pinned: true,
          sortOrder: 2,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'n2',
          title: 'Second',
          body: '',
          locked: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.noteGroups).toEqual([]);
    expect(norm.notes).toHaveLength(2);
    expect(norm.notes.every((n) => n.groupId === undefined)).toBe(true);
    expect(norm.notes[0]).toEqual(
      expect.objectContaining({ id: 'n1', title: 'Legacy note', body: 'hello', pinned: true, sortOrder: 2 }),
    );
  });

  it('preserves explicit note list membership from disk', () => {
    const norm = normalizeData({
      ...baseV3(),
      noteGroups: [{ id: 'lg1', name: 'Work', sortOrder: 0, createdAt: TS }],
      notes: [
        {
          id: 'n1',
          title: 'In list',
          body: '',
          locked: false,
          groupId: 'lg1',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.noteGroups).toEqual([{ id: 'lg1', name: 'Work', sortOrder: 0, createdAt: TS }]);
    expect(norm.notes[0]?.groupId).toBe('lg1');
  });

  it('clears orphaned note groupId without reassigning to a default list', () => {
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        {
          id: 'n1',
          title: 'Orphan',
          body: '',
          locked: false,
          groupId: 'missing-list',
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.noteGroups).toEqual([]);
    expect(norm.notes[0]?.groupId).toBeUndefined();
  });

  it('omits unused note-list fields from persist JSON', () => {
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        {
          id: 'n1',
          title: 'Keep me flat',
          body: 'text',
          locked: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    const raw = JSON.parse(appDataToPersistJson(norm)) as Record<string, unknown>;
    expect(raw.noteGroups).toBeUndefined();
    const notes = raw.notes as Record<string, unknown>[];
    expect(notes[0]?.groupId).toBeUndefined();
    expect(notes[0]?.title).toBe('Keep me flat');
  });

  it('parses notes archived flag only when true', () => {
    const norm = normalizeData({
      ...baseV3(),
      notes: [
        {
          id: 'n-arch',
          title: 'Archived',
          body: '',
          locked: false,
          archived: true,
          createdAt: TS,
          updatedAt: TS,
        },
        {
          id: 'n-active',
          title: 'Active',
          body: '',
          locked: false,
          archived: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.notes[0]?.archived).toBe(true);
    expect(norm.notes[1]?.archived).toBeUndefined();
  });

  it('drops notesLock when verifier fields are incomplete', () => {
    const norm = normalizeData({
      ...baseV3(),
      notesLock: { saltB64: 's', verifierIvB64: 'iv' },
      notes: [
        {
          id: 'n1',
          title: 'L',
          body: '',
          locked: true,
          cipher: { ivB64: 'i', cipherB64: 'c' },
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.notesLock).toBeUndefined();
  });

  it('parses notesLock recovery only when all recovery fields are strings', () => {
    const norm = normalizeData({
      ...baseV3(),
      notesLock: {
        saltB64: 's',
        verifierIvB64: 'iv',
        verifierCipherB64: 'c',
        recovery: { saltB64: 'rs', ivB64: 'riv', cipherB64: 'rc' },
      },
      notes: [
        {
          id: 'n1',
          title: 'L',
          body: '',
          locked: true,
          cipher: { ivB64: 'i', cipherB64: 'c' },
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(norm.notesLock).toEqual({
      saltB64: 's',
      verifierIvB64: 'iv',
      verifierCipherB64: 'c',
      recovery: { saltB64: 'rs', ivB64: 'riv', cipherB64: 'rc' },
    });
    const badRecovery = normalizeData({
      ...baseV3(),
      notesLock: {
        saltB64: 's',
        verifierIvB64: 'iv',
        verifierCipherB64: 'c',
        recovery: { saltB64: 'rs', ivB64: 1, cipherB64: 'rc' },
      },
      notes: [
        {
          id: 'n1',
          title: 'L',
          body: '',
          locked: true,
          cipher: { ivB64: 'i', cipherB64: 'c' },
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(badRecovery.notesLock).toEqual({
      saltB64: 's',
      verifierIvB64: 'iv',
      verifierCipherB64: 'c',
    });
  });

  it('parses AI settings field-by-field and drops empty settings', () => {
    expect(
      normalizeData({
        ...baseV3(),
        aiSettings: { provider: 'openai', apiKey: '  key  ', model: ' gpt ', systemPrompt: 'sys' },
      }).aiSettings,
    ).toEqual({
      provider: 'openai',
      apiKey: 'key',
      model: 'gpt',
      systemPrompt: 'sys',
      extractionGuidance: undefined,
    });
    expect(normalizeData({ ...baseV3(), aiSettings: { provider: 'bogus' } }).aiSettings).toBeUndefined();
    expect(normalizeData({ ...baseV3(), aiSettings: {} }).aiSettings).toBeUndefined();
  });

  it('parses profile displayName, avatar data URL, and trims optional fields', () => {
    const norm = normalizeData({
      ...baseV3(),
      profile: {
        displayName: '  Alex  ',
        favoriteTeamIds: ['t1', 2, 'ghost'],
        jobTitle: '  Eng  ',
        department: ' ',
        phone: ' +1 ',
        bio: ' bio ',
        avatarDataUrl: 'http://not-data',
      },
    });
    expect(norm.profile).toEqual({
      displayName: 'Alex',
      favoriteTeamIds: ['t1'],
      jobTitle: 'Eng',
      department: undefined,
      phone: '+1',
      bio: 'bio',
      avatarDataUrl: undefined,
    });
  });

  it('ensureProfile defaults blank displayName to Me', () => {
    const norm = normalizeData({
      ...baseV3(),
      profile: { displayName: '   ', favoriteTeamIds: [] },
    });
    expect(norm.profile?.displayName).toBe('Me');
  });

  it('seeds missing self and leader people for every team', () => {
    const norm = normalizeData({
      version: 3,
      teams: [
        { id: 't1', name: 'One', createdAt: TS, status: 'active' },
        { id: 't2', name: 'Two', createdAt: TS, status: 'active' },
      ],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [{ id: 'g1', name: 'G', sortOrder: 0, createdAt: TS }],
      todoItems: [],
      notes: [],
    });
    expect(getSelfPerson(norm, 't1')?.id).toBe(selfPersonIdForTeam('t1'));
    expect(getLeaderPerson(norm, 't2')?.id).toBe(leaderPersonIdForTeam('t2'));
    expect(getSkipLevelPerson(norm, 't1')?.id).toBe(skipLevelPersonIdForTeam('t1'));
  });

  it('shapeOfData counts user people and computes total for a populated workspace', () => {
    const norm = normalizeData({
      ...baseV3(),
      people: [
        { id: 'p1', teamId: 't1', name: 'Pat', createdAt: TS },
        { id: selfPersonIdForTeam('t1'), teamId: 't1', name: 'Me', isSelf: true, createdAt: TS },
      ],
      items: [
        {
          id: 'i1',
          personId: 'p1',
          kind: 'task',
          title: 'T',
          body: '',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      notes: [
        {
          id: 'n1',
          title: '',
          body: 'x',
          locked: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
      todoItems: [
        {
          id: 'ti',
          groupId: 'g1',
          title: 'todo',
          status: 'todo',
          done: false,
          createdAt: TS,
          updatedAt: TS,
        },
      ],
    });
    expect(shapeOfData(norm)).toEqual({
      teams: 1,
      people: 1,
      items: 1,
      todoGroups: 1,
      todoItems: 1,
      notes: 1,
      total: 5,
    });
  });

  it('migrateV1ToV2 rewrites legacy self ids and filters notifiedReminderIds', () => {
    const norm = normalizeData({
      version: 1,
      people: [{ id: LEGACY_SELF_PERSON_ID, name: 'Legacy' }],
      items: [
        {
          id: 'i1',
          personId: LEGACY_SELF_PERSON_ID,
          kind: 'task',
          title: 't',
          body: '',
          done: false,
        },
      ],
      notifiedReminderIds: ['a', 1, null],
    });
    const teamId = norm.teams[0]!.id;
    const selfId = selfPersonIdForTeam(teamId);
    expect(norm.teams[0]).toEqual(
      expect.objectContaining({ name: 'Default team', status: 'active' }),
    );
    expect(norm.people.find((p) => p.id === selfId)).toEqual(
      expect.objectContaining({ isSelf: true, name: 'Legacy', teamId }),
    );
    expect(norm.items[0]?.personId).toBe(selfId);
    expect(norm.notifiedReminderIds).toEqual(['a']);
    expect(norm.version).toBe(3);
  });

  it('migrateV1 inserts self person when legacy file had no __self row', () => {
    const norm = normalizeData({
      version: 1,
      people: [{ id: 'p-other', name: 'Other' }],
      items: [],
    });
    const selfId = selfPersonIdForTeam(norm.teams[0]!.id);
    expect(norm.people.some((p) => p.id === selfId && p.isSelf)).toBe(true);
  });

  it('parses utility payloads and yaml language default', () => {
    expect(
      normalizeData({
        ...baseV3(),
        utilityDocument: { body: 'doc', bodyFormat: 'prosemirror', bodyPlainText: 'p', updatedAt: TS },
        utilityStructuredText: {
          content: '{}',
          diffContentLeft: '{"a":1}',
          diffContent: '[]',
          language: 'yaml',
          updatedAt: TS,
        },
      }).utilityStructuredText,
    ).toEqual({
      content: '{}',
      diffContentLeft: '{"a":1}',
      diffContent: '[]',
      language: 'yaml',
      updatedAt: TS,
    });
    expect(
      normalizeData({
        ...baseV3(),
        utilityStructuredText: { content: '[]', updatedAt: TS },
      }).utilityStructuredText,
    ).toEqual({ content: '[]', diffContent: undefined, language: 'json', updatedAt: TS });
    expect(normalizeData({ ...baseV3(), utilityDocument: { nope: 1 } }).utilityDocument).toBeUndefined();
  });

  it('teamPeople excludes self and leader rows', () => {
    const norm = normalizeData({
      ...baseV3(),
      people: [
        { id: 'p1', teamId: 't1', name: 'Pat', createdAt: TS },
        { id: selfPersonIdForTeam('t1'), teamId: 't1', name: 'Me', isSelf: true, createdAt: TS },
        { id: leaderPersonIdForTeam('t1'), teamId: 't1', name: 'Boss', createdAt: TS },
      ],
    });
    expect(teamPeople(norm, 't1')).toEqual([
      expect.objectContaining({ id: 'p1', name: 'Pat' }),
    ]);
  });
});

/**
 * Forward-compatibility (cross-version data-loss prevention).
 *
 * A file written by a NEWER Cadence build can carry top-level keys and
 * per-entity fields this build doesn't know about. An older build must
 * round-trip (load → save) those unknown fields untouched — otherwise it
 * silently strips the newer data and, via sync, propagates the loss to
 * every device. These tests lock that guarantee in.
 */
describe('normalizeData — forward-compatible unknown-field passthrough', () => {
  const FTS = '2026-06-01T12:00:00.000Z';

  function futureFile(extra: Record<string, unknown> = {}) {
    return {
      version: 3,
      teams: [{ id: 't1', name: 'Alpha', createdAt: FTS, status: 'active', emoji: '🚀' }],
      people: [{ id: 'p1', teamId: 't1', name: 'Pat', createdAt: FTS, pronouns: 'they/them' }],
      items: [
        { id: 'i1', personId: 'p1', kind: 'note', title: 'X', body: '', createdAt: FTS, updatedAt: FTS, mood: 'great' },
      ],
      notifiedReminderIds: [],
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: FTS, colorTag: 'blue' }],
      todoItems: [
        { id: 'td1', groupId: 'g1', title: 'Do it', status: 'todo', done: false, createdAt: FTS, updatedAt: FTS, estimateMins: 25 },
      ],
      notes: [
        { id: 'n1', title: 'Hi', body: 'hello', locked: false, createdAt: FTS, updatedAt: FTS, color: 'red', tags: ['a', 'b'] },
      ],
      noteGroups: [{ id: 'ng1', name: 'Refs', sortOrder: 0, createdAt: FTS, icon: 'star' }],
      profile: { displayName: 'Me', favoriteTeamIds: [], avatarShape: 'circle' },
      // Whole top-level collections / objects a future version might add:
      calendars: [{ id: 'c1', name: 'Work' }],
      futureSetting: { theme: 'neon' },
      ...extra,
    };
  }

  it('preserves unknown top-level keys', () => {
    const norm = normalizeData(futureFile()) as unknown as Record<string, unknown>;
    expect(norm.calendars).toEqual([{ id: 'c1', name: 'Work' }]);
    expect(norm.futureSetting).toEqual({ theme: 'neon' });
  });

  it('preserves unknown per-entity fields on every content collection', () => {
    const norm = normalizeData(futureFile());
    expect((norm.teams[0] as unknown as Record<string, unknown>).emoji).toBe('🚀');
    expect((norm.people.find((p) => p.id === 'p1') as unknown as Record<string, unknown>).pronouns).toBe('they/them');
    expect((norm.items[0] as unknown as Record<string, unknown>).mood).toBe('great');
    expect((norm.todoGroups.find((g) => g.id === 'g1') as unknown as Record<string, unknown>).colorTag).toBe('blue');
    expect((norm.todoItems[0] as unknown as Record<string, unknown>).estimateMins).toBe(25);
    expect((norm.notes[0] as unknown as Record<string, unknown>).color).toBe('red');
    expect((norm.notes[0] as unknown as Record<string, unknown>).tags).toEqual(['a', 'b']);
    expect((norm.noteGroups[0] as unknown as Record<string, unknown>).icon).toBe('star');
    expect((norm.profile as unknown as Record<string, unknown>).avatarShape).toBe('circle');
  });

  it('survives a full normalize → persist JSON → normalize round trip', () => {
    const once = normalizeData(futureFile());
    const json = appDataToPersistJson(once);
    const twice = normalizeData(JSON.parse(json)) as unknown as Record<string, unknown>;
    expect(twice.calendars).toEqual([{ id: 'c1', name: 'Work' }]);
    expect(twice.futureSetting).toEqual({ theme: 'neon' });
    expect((twice.notes as Record<string, unknown>[])[0].color).toBe('red');
    expect((twice.todoItems as Record<string, unknown>[])[0].estimateMins).toBe(25);
  });

  it('never lets an unknown extra override a known field', () => {
    // A hostile/garbage file tries to smuggle a bogus value under a known
    // key name — the parser must win, not the raw passthrough.
    const norm = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'Real', createdAt: FTS, status: 'bogus-status', extraOnly: 'kept' }],
      notes: [{ id: 'n1', title: 'T', body: 'B', locked: false, createdAt: FTS, updatedAt: FTS, done: 'not-a-real-field-but-unknown' }],
    });
    expect(norm.teams[0]!.status).toBe('active'); // sanitised, not 'bogus-status'
    expect((norm.teams[0] as unknown as Record<string, unknown>).extraOnly).toBe('kept');
    // `done` is unknown on a Note, so it's preserved verbatim (harmless), but
    // the note's real content is intact.
    expect(norm.notes[0]!.title).toBe('T');
    expect(norm.notes[0]!.body).toBe('B');
  });

  it('does not reintroduce a locked note plaintext body via passthrough', () => {
    // Locked note: plaintext `body` / `bodyPlainText` are deliberately stripped.
    // They are KNOWN keys, so passthrough must not carry them back.
    const norm = normalizeData({
      version: 3,
      teams: [{ id: 't1', name: 'A', createdAt: FTS, status: 'active' }],
      notes: [
        {
          id: 'n1',
          title: 'Secret',
          body: 'PLAINTEXT-SHOULD-NOT-PERSIST',
          bodyPlainText: 'PLAINTEXT-SHOULD-NOT-PERSIST',
          locked: true,
          cipher: { ivB64: 'aXY=', cipherB64: 'Y2lwaA==' },
          createdAt: FTS,
          updatedAt: FTS,
          futureMeta: 'kept',
        },
      ],
    });
    expect(norm.notes[0]!.locked).toBe(true);
    expect(norm.notes[0]!.body).toBe('');
    expect(norm.notes[0]!.bodyPlainText).toBeUndefined();
    expect((norm.notes[0] as unknown as Record<string, unknown>).futureMeta).toBe('kept');
  });

  it('adds no surprise keys when the file has no unknown fields', () => {
    const clean = {
      version: 3,
      teams: [{ id: 't1', name: 'A', createdAt: FTS, status: 'active' }],
      people: [],
      items: [],
      notifiedReminderIds: [],
      todoGroups: [{ id: 'g1', name: 'Inbox', sortOrder: 0, createdAt: FTS }],
      todoItems: [],
      notes: [],
      noteGroups: [],
    };
    const norm = normalizeData(clean) as unknown as Record<string, unknown>;
    // Only the canonical AppData keys (no stray passthrough wrapper).
    const allowed = new Set([
      'version', 'teams', 'people', 'items', 'notifiedReminderIds', 'lastTeamId',
      'profile', 'todoGroups', 'todoItems', 'aiSettings', 'notes', 'noteGroups',
      'notesLock', 'utilityDocument', 'utilityStructuredText',
    ]);
    for (const key of Object.keys(norm)) {
      expect(allowed.has(key)).toBe(true);
    }
  });
});
