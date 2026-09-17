import { describe, expect, it } from 'vitest';
import { PLACEHOLDER_TITLE } from './notePreferences';
import { sortNotes } from './sortNotes';
import type { Note } from '../../model';

function note(id: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    body: '',
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('sortNotes', () => {
  it('pins notes above unpinned regardless of sort mode', () => {
    const sorted = sortNotes(
      [note('u'), note('p', { pinned: true, updatedAt: '2020-01-01' })],
      'updated',
    );
    expect(sorted.map((n) => n.id)).toEqual(['p', 'u']);
  });

  it('sorts by updated descending', () => {
    const sorted = sortNotes(
      [note('old', { updatedAt: '2026-01-01' }), note('new', { updatedAt: '2026-06-01' })],
      'updated',
    );
    expect(sorted.map((n) => n.id)).toEqual(['new', 'old']);
  });

  it('sorts by created descending', () => {
    const sorted = sortNotes(
      [note('a', { createdAt: '2026-01-01' }), note('b', { createdAt: '2026-06-01' })],
      'created',
    );
    expect(sorted.map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('sorts by opened using lastOpenedAt with updatedAt fallback', () => {
    const sorted = sortNotes(
      [
        note('fallback', { updatedAt: '2026-06-01' }),
        note('opened', { lastOpenedAt: '2026-07-01', updatedAt: '2020-01-01' }),
      ],
      'opened',
    );
    expect(sorted.map((n) => n.id)).toEqual(['opened', 'fallback']);
  });

  it('sorts by title case-insensitively', () => {
    const sorted = sortNotes(
      [note('z', { title: 'Zebra' }), note('a', { title: 'apple' })],
      'title',
    );
    expect(sorted.map((n) => n.id)).toEqual(['a', 'z']);
  });

  it('uses placeholder title for empty titles', () => {
    const sorted = sortNotes([note('empty', { title: '' }), note('named', { title: 'Beta' })], 'title');
    expect(sorted.map((n) => n.id)).toEqual(['named', 'empty']);
    expect(PLACEHOLDER_TITLE).toBe('New note');
  });

  it('sorts manual by sortOrder then a stable created/id tie-break', () => {
    const sorted = sortNotes(
      [
        note('late', { sortOrder: 2, updatedAt: '2026-06-01' }),
        note('first', { sortOrder: 1, updatedAt: '2020-01-01' }),
        note('unordered', { updatedAt: '2099-01-01' }),
      ],
      'manual',
    );
    expect(sorted.map((n) => n.id)).toEqual(['first', 'late', 'unordered']);
  });

  it('manual order is invariant to edits (updatedAt must not reshuffle)', () => {
    const before = sortNotes(
      [
        note('a', { sortOrder: 0, updatedAt: '2026-01-01' }),
        note('b', { sortOrder: 1, updatedAt: '2026-01-01' }),
        note('c', { sortOrder: 2, updatedAt: '2026-01-01' }),
      ],
      'manual',
    );
    expect(before.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    // Editing 'a' bumps its updatedAt to the newest — order must NOT change.
    const after = sortNotes(
      [
        note('a', { sortOrder: 0, updatedAt: '2099-12-31' }),
        note('b', { sortOrder: 1, updatedAt: '2026-01-01' }),
        note('c', { sortOrder: 2, updatedAt: '2026-01-01' }),
      ],
      'manual',
    );
    expect(after.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  describe('held note', () => {
    it('keeps the edited note in place while its updatedAt climbs', () => {
      const notes = [
        note('editing', { updatedAt: '2026-01-01' }),
        note('newer', { updatedAt: '2026-05-01' }),
      ];
      const held = notes[0]!;
      const afterTyping = [{ ...held, updatedAt: '2099-12-31' }, notes[1]!];

      expect(sortNotes(afterTyping, 'updated').map((n) => n.id)).toEqual(['editing', 'newer']);
      expect(sortNotes(afterTyping, 'updated', held).map((n) => n.id)).toEqual([
        'newer',
        'editing',
      ]);
    });

    it('keeps the edited note in place while its title changes', () => {
      const held = note('editing', { title: 'Zebra' });
      const notes = [{ ...held, title: 'Aardvark' }, note('other', { title: 'Mango' })];

      expect(sortNotes(notes, 'title').map((n) => n.id)).toEqual(['editing', 'other']);
      expect(sortNotes(notes, 'title', held).map((n) => n.id)).toEqual(['other', 'editing']);
    });

    it('releases the note as soon as it is no longer held', () => {
      const notes = [
        note('editing', { updatedAt: '2099-12-31' }),
        note('newer', { updatedAt: '2026-05-01' }),
      ];
      expect(sortNotes(notes, 'updated', null).map((n) => n.id)).toEqual(['editing', 'newer']);
    });

    it('still moves the note when the user pins it', () => {
      const held = note('editing', { updatedAt: '2026-01-01' });
      const notes = [note('newer', { updatedAt: '2026-05-01' }), { ...held, pinned: true }];

      expect(sortNotes(notes, 'updated', held).map((n) => n.id)).toEqual(['editing', 'newer']);
    });

    it('ignores a held note that is not in the list', () => {
      const notes = [note('a', { updatedAt: '2026-05-01' }), note('b', { updatedAt: '2026-01-01' })];
      expect(sortNotes(notes, 'updated', note('ghost')).map((n) => n.id)).toEqual(['a', 'b']);
    });

    it('applies a manual drag of the held note instead of its pre-drag position', () => {
      // The selected note is always held, so a drag has to win over the
      // snapshot or manual reordering silently snaps back.
      const held = note('a', { sortOrder: 0, createdAt: '2026-01-01' });
      const beforeDrag = [
        held,
        note('b', { sortOrder: 1, createdAt: '2026-01-02' }),
        note('c', { sortOrder: 2, createdAt: '2026-01-03' }),
      ];
      expect(sortNotes(beforeDrag, 'manual', held).map((n) => n.id)).toEqual(['a', 'b', 'c']);

      // Drag 'c' above the held 'a': the whole tier is re-stamped 0..n.
      const afterDrag = [
        { ...held, sortOrder: 1 },
        note('b', { sortOrder: 2, createdAt: '2026-01-02' }),
        note('c', { sortOrder: 0, createdAt: '2026-01-03' }),
      ];
      expect(sortNotes(afterDrag, 'manual', held).map((n) => n.id)).toEqual(['c', 'a', 'b']);
    });

    it('reads created order live, since createdAt cannot drift while typing', () => {
      const held = note('editing', { createdAt: '2020-01-01' });
      const notes = [note('other', { createdAt: '2026-01-01' }), { ...held, createdAt: '2099-01-01' }];

      expect(sortNotes(notes, 'created', held).map((n) => n.id)).toEqual(['editing', 'other']);
    });
  });

  it('breaks equal/absent sortOrder ties deterministically by createdAt then id', () => {
    const sorted = sortNotes(
      [
        note('y', { createdAt: '2026-03-01' }),
        note('x', { createdAt: '2026-01-01' }),
        note('z', { createdAt: '2026-01-01' }),
      ],
      'manual',
    );
    // x and z share createdAt → id tie-break (x < z); y is newer-created → last.
    expect(sorted.map((n) => n.id)).toEqual(['x', 'z', 'y']);
  });
});
