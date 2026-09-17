/**
 * Deep links into the notes pane: `/notes?id=<id>` from global search, and
 * `/notes?focus=<id>` from a task backlink.
 *
 * Both land on a freshly mounted page, which is the hard case: the same effect
 * flush that resolves the link also runs the selection-repair effect, and that
 * one sees `selectedId` as it was at render time — still null. Whichever of the
 * two writes last decides what the user ends up looking at.
 */

import { useCallback, useMemo, useState } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../model';
import { useNotesSelection } from './useNotesSelection';

function note(id: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: id,
    body: '',
    locked: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

/**
 * Mirrors NotesPage: `searchParams` is router state, so a `setSearchParams`
 * from an effect re-renders the hook with the stripped query.
 */
function renderSelection(initialQuery: string, notes: Note[]) {
  const setViewMode = vi.fn();
  const view = renderHook(
    ({ allNotes }: { allNotes: Note[] }) => {
      const [query, setQuery] = useState(initialQuery);
      const searchParams = useMemo(() => new URLSearchParams(query), [query]);
      const setSearchParams = useCallback(
        (next: URLSearchParams) => setQuery(next.toString()),
        [],
      );
      const selection = useNotesSelection(
        allNotes,
        allNotes,
        searchParams,
        setSearchParams,
        'updated',
        () => undefined,
        'active',
        setViewMode,
      );
      return { ...selection, query };
    },
    { initialProps: { notes, allNotes: notes } as { allNotes: Note[] } },
  );
  return { view, setViewMode };
}

describe('useNotesSelection deep links', () => {
  it('selects the note named by ?id= instead of the first one in the list', async () => {
    const { view } = renderSelection('id=b', [note('a'), note('b'), note('c')]);

    await waitFor(() => expect(view.result.current.selectedId).toBe('b'));
    // Held past the flush that resolves the link: the repair effect runs again
    // once selection settles and must not reclaim the row for notes[0].
    await waitFor(() => expect(view.result.current.query).toBe(''));
    expect(view.result.current.selectedId).toBe('b');
  });

  it('selects the note named by ?focus=', async () => {
    const { view } = renderSelection('focus=c', [note('a'), note('b'), note('c')]);

    await waitFor(() => expect(view.result.current.selectedId).toBe('c'));
    expect(view.result.current.query).toBe('');
  });

  it('switches to the archived view for an archived target', async () => {
    const { view, setViewMode } = renderSelection('id=b', [
      note('a'),
      note('b', { archived: true }),
    ]);

    await waitFor(() => expect(view.result.current.selectedId).toBe('b'));
    expect(setViewMode).toHaveBeenCalledWith('archived');
  });

  it('keeps the link alive until the workspace has loaded', async () => {
    const { view } = renderSelection('id=b', []);

    // Nothing to resolve against yet. Dropping the query here is what loses a
    // deep link opened before the workspace finished loading.
    await waitFor(() => expect(view.result.current.query).toBe('id=b'));
    expect(view.result.current.selectedId).toBeNull();

    view.rerender({ allNotes: [note('a'), note('b')] });

    await waitFor(() => expect(view.result.current.selectedId).toBe('b'));
    expect(view.result.current.query).toBe('');
  });

  it('drops a query naming a note that no longer exists', async () => {
    const { view } = renderSelection('id=gone', [note('a'), note('b')]);

    await waitFor(() => expect(view.result.current.query).toBe(''));
    expect(view.result.current.selectedId).toBe('a');
  });

  it('resolves ?id= and leaves an unrelated query param in place', async () => {
    const { view } = renderSelection('id=b&tab=history', [note('a'), note('b')]);

    await waitFor(() => expect(view.result.current.selectedId).toBe('b'));
    expect(view.result.current.query).toBe('tab=history');
  });
});
