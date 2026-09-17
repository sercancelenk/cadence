/**
 * The sidebar holds the note being worked on in place while it is selected.
 * These pin the snapshot lifecycle: taken when the held id changes, released
 * when the user moves on, and never applied one render late (which would make
 * the list visibly jump before settling).
 */

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Note } from '../../model';
import { useNotesSort } from './useNotesSort';

function note(id: string, updatedAt: string): Note {
  return {
    id,
    title: id,
    body: '',
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
  };
}

const older = note('a', '2026-01-01T00:00:00.000Z');
const newer = note('b', '2026-05-01T00:00:00.000Z');

function renderSort(initial: { notes: Note[]; heldId: string | null }) {
  return renderHook(
    ({ notes, heldId }: { notes: Note[]; heldId: string | null }) =>
      useNotesSort(notes, undefined, heldId).notes.map((n) => n.id),
    { initialProps: initial },
  );
}

describe('useNotesSort', () => {
  it('holds the selected note in place on the very first render after an edit', () => {
    const view = renderSort({ notes: [older, newer], heldId: 'a' });
    expect(view.result.current).toEqual(['b', 'a']);

    const edited = { ...older, updatedAt: '2099-12-31T00:00:00.000Z' };
    view.rerender({ notes: [edited, newer], heldId: 'a' });

    expect(view.result.current).toEqual(['b', 'a']);
  });

  it('releases the note when the user selects another one', () => {
    const edited = { ...older, updatedAt: '2099-12-31T00:00:00.000Z' };
    const view = renderSort({ notes: [older, newer], heldId: 'a' });
    view.rerender({ notes: [edited, newer], heldId: 'a' });
    expect(view.result.current).toEqual(['b', 'a']);

    view.rerender({ notes: [edited, newer], heldId: 'b' });

    expect(view.result.current).toEqual(['a', 'b']);
  });

  it('sorts normally when nothing is held', () => {
    const view = renderSort({ notes: [older, newer], heldId: null });
    expect(view.result.current).toEqual(['b', 'a']);
  });

  it('settles instead of looping when the held id is not in the list', () => {
    const view = renderSort({ notes: [older, newer], heldId: 'ghost' });
    expect(view.result.current).toEqual(['b', 'a']);
  });

  it('applies a manual drag of the selected note instead of its held position', () => {
    const ordered = (id: string, sortOrder: number): Note => ({
      ...note(id, '2026-01-01T00:00:00.000Z'),
      sortOrder,
    });
    const view = renderHook(
      ({ notes, heldId }: { notes: Note[]; heldId: string | null }) =>
        useNotesSort(notes, undefined, heldId),
      { initialProps: { notes: [ordered('a', 0), ordered('b', 1), ordered('c', 2)], heldId: 'a' } },
    );
    act(() => view.result.current.setSortMode('manual'));
    expect(view.result.current.notes.map((n) => n.id)).toEqual(['a', 'b', 'c']);

    // Drag 'c' above the selected 'a': the drop re-stamps the whole tier. The
    // held snapshot must not pin 'a' at its pre-drag ordinal.
    view.rerender({
      notes: [ordered('a', 1), ordered('b', 2), ordered('c', 0)],
      heldId: 'a',
    });

    expect(view.result.current.notes.map((n) => n.id)).toEqual(['c', 'a', 'b']);
  });
});
