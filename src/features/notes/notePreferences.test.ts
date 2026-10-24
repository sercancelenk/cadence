import { describe, expect, it } from 'vitest';
import type { Note, NoteGroup } from '../../model';
import { filterNotesForView } from './notePreferences';

const TS = '2026-01-01T00:00:00.000Z';
const n = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: '',
  locked: false,
  createdAt: TS,
  updatedAt: TS,
  ...over,
});
const g = (id: string, over: Partial<NoteGroup> = {}): NoteGroup => ({
  id,
  name: id,
  sortOrder: 0,
  createdAt: TS,
  ...over,
});

describe('filterNotesForView with nested lists', () => {
  const groups = [
    g('proj', { archived: true }),
    g('proj-sub', { parentId: 'proj' }),
    g('live'),
  ];
  const notes = [
    n('own-archived', { archived: true }),
    n('in-archived-list', { groupId: 'proj' }),
    n('in-archived-sub', { groupId: 'proj-sub' }),
    n('in-live', { groupId: 'live' }),
    n('loose'),
  ];
  const ids = (list: Note[]) => list.map((x) => x.id);

  it('shows notes of an archived list (and its sub-lists) only in the Archived view', () => {
    expect(ids(filterNotesForView(notes, 'archived', groups))).toEqual([
      'own-archived',
      'in-archived-list',
      'in-archived-sub',
    ]);
    expect(ids(filterNotesForView(notes, 'active', groups))).toEqual(['in-live', 'loose']);
  });

  it('keeps the old note-only behaviour when no lists are passed', () => {
    expect(ids(filterNotesForView(notes, 'archived'))).toEqual(['own-archived']);
    expect(ids(filterNotesForView(notes, 'active')).length).toBe(4);
  });

  it('puts every note in exactly one view', () => {
    const a = filterNotesForView(notes, 'active', groups).length;
    const b = filterNotesForView(notes, 'archived', groups).length;
    expect(a + b).toBe(notes.length);
  });
});
