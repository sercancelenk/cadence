import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../model';
import { useNotesSidebarDnD } from './useNotesSidebarDnD';

function note(id: string, sortOrder: number, groupId?: string): Note {
  return {
    id,
    title: id,
    body: '',
    locked: false,
    groupId,
    sortOrder,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function dragEvent(
  overrides: Partial<React.DragEvent<HTMLElement>> & {
    clientY?: number;
    rect?: { top: number; height: number };
  } = {},
) {
  const { clientY = 120, rect = { top: 100, height: 40 }, ...rest } = overrides;
  const dataTransfer = {
    effectAllowed: 'none' as DataTransfer['effectAllowed'],
    dropEffect: 'none' as DataTransfer['dropEffect'],
    setData: vi.fn(),
  };
  return {
    preventDefault: vi.fn(),
    dataTransfer,
    clientY,
    currentTarget: {
      getBoundingClientRect: () => rect,
    },
    ...rest,
  } as unknown as React.DragEvent<HTMLElement>;
}

describe('useNotesSidebarDnD', () => {
  it('accepts dragover before React has committed draggingId state', () => {
    const notes = [note('a', 0), note('b', 1)];
    const { result } = renderHook(() => useNotesSidebarDnD('manual', notes, vi.fn()));

    act(() => {
      result.current.onNoteDragStart(dragEvent(), 'a');
    });
    const over = dragEvent({ clientY: 130 });
    result.current.onNoteDragOver(over, 'b');

    expect(over.preventDefault).toHaveBeenCalled();
    expect(over.dataTransfer.dropEffect).toBe('move');
  });

  it('moves a note DOWN onto the next neighbour via the bottom half', () => {
    const notes = [note('a', 0), note('b', 1), note('c', 2)];
    const update = vi.fn((fn: (d: { notes: Note[] }) => { notes: Note[] }) => fn({ notes }));
    const { result } = renderHook(() => useNotesSidebarDnD('manual', notes, update as never));

    act(() => {
      result.current.onNoteDragStart(dragEvent(), 'a');
    });
    // Bottom half of b → insert after b → [b, a, c]
    act(() => {
      result.current.onNoteDragOver(dragEvent({ clientY: 130 }), 'b');
      result.current.onNoteDrop(dragEvent({ clientY: 130 }), 'b');
    });

    expect(update).toHaveBeenCalled();
    const next = update.mock.calls[0]![0]({ notes });
    expect(
      next.notes
        .slice()
        .sort((x: Note, y: Note) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0))
        .map((n: Note) => n.id),
    ).toEqual(['b', 'a', 'c']);
  });

  it('moves a note UP onto the previous neighbour via the top half', () => {
    const notes = [note('a', 0), note('b', 1), note('c', 2)];
    const update = vi.fn((fn: (d: { notes: Note[] }) => { notes: Note[] }) => fn({ notes }));
    const { result } = renderHook(() => useNotesSidebarDnD('manual', notes, update as never));

    act(() => {
      result.current.onNoteDragStart(dragEvent(), 'c');
    });
    act(() => {
      result.current.onNoteDragOver(dragEvent({ clientY: 110 }), 'a');
      result.current.onNoteDrop(dragEvent({ clientY: 110 }), 'a');
    });

    const next = update.mock.calls[0]![0]({ notes });
    expect(
      next.notes
        .slice()
        .sort((x: Note, y: Note) => (x.sortOrder ?? 0) - (y.sortOrder ?? 0))
        .map((n: Note) => n.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('reorders under non-manual sort and flips the mode to manual', () => {
    const notes = [note('a', 0), note('b', 1)];
    const update = vi.fn((fn: (d: { notes: Note[] }) => { notes: Note[] }) => fn({ notes }));
    const setSortMode = vi.fn();
    const { result } = renderHook(() =>
      useNotesSidebarDnD('updated', notes, update as never, setSortMode),
    );

    act(() => {
      result.current.onNoteDragStart(dragEvent(), 'a');
    });
    const over = dragEvent({ clientY: 130 });
    act(() => {
      result.current.onNoteDragOver(over, 'b');
      result.current.onNoteDrop(dragEvent({ clientY: 130 }), 'b');
    });

    expect(over.preventDefault).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(setSortMode).toHaveBeenCalledWith('manual');
  });
});
