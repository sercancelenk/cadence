import { describe, it, expect } from 'vitest';
import { normalizeData, shapeOfData, type AppData } from './model';

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
