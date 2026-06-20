import { describe, expect, it } from 'vitest';
import type { Note } from '../../model';
import {
  isPendingSelectionComplete,
  isSelectedNotePresent,
  resolveNotesSelectionCorrection,
} from './notesSelectionUtils';

function note(id: string): Note {
  return {
    id,
    title: '',
    body: '',
    locked: false,
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('isSelectedNotePresent', () => {
  it('returns true when id is in the visible sidebar list', () => {
    const n = note('a');
    expect(isSelectedNotePresent('a', [n], [n])).toBe(true);
  });

  it('returns true when id is only in allNotes (create-note lag)', () => {
    const n = note('new');
    expect(isSelectedNotePresent('new', [], [n])).toBe(true);
  });

  it('returns false when id is missing everywhere', () => {
    expect(isSelectedNotePresent('missing', [note('a')], [note('a')])).toBe(false);
  });
});

describe('resolveNotesSelectionCorrection', () => {
  it('waits while pending create id is not in workspace yet', () => {
    const first = note('first');
    expect(
      resolveNotesSelectionCorrection('first', 'new-id', [first], [first], false),
    ).toEqual({ action: 'keep' });
  });

  it('forces pending id once workspace contains the new note', () => {
    const first = note('first');
    const created = note('new-id');
    expect(
      resolveNotesSelectionCorrection('first', 'new-id', [first, created], [first, created], false),
    ).toEqual({ action: 'select', id: 'new-id' });
  });

  it('does not fall back to first note while pending id exists in workspace', () => {
    const first = note('first');
    const created = note('new-id');
    expect(
      resolveNotesSelectionCorrection('new-id', 'new-id', [first, created], [first, created], false),
    ).toEqual({ action: 'keep' });
  });

  it('falls back to first visible note when selection is invalid and no pending id', () => {
    const first = note('first');
    expect(resolveNotesSelectionCorrection('gone', null, [first], [first], false)).toEqual({
      action: 'select-first',
    });
  });

  it('forces pending id when another note was wrongly selected (grouped create)', () => {
    const first = note('first');
    const grouped = { ...note('grouped-new'), groupId: 'list-1' };
    expect(
      resolveNotesSelectionCorrection('first', 'grouped-new', [first, grouped], [first, grouped], false),
    ).toEqual({ action: 'select', id: 'grouped-new' });
  });
});

describe('isPendingSelectionComplete', () => {
  it('is true once pending id is selected and present', () => {
    const created = note('new-id');
    expect(isPendingSelectionComplete('new-id', 'new-id', [created], [created])).toBe(true);
  });
});
