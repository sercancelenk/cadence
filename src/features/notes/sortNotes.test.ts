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
