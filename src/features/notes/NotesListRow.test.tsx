/**
 * The grip is the sidebar's only HTML5 drag source. Reordering is refused by
 * every sort mode except manual, but moving a note between lists still works
 * under other modes — so the handle stays visible (subtle) either way.
 */

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Note } from '../../model';
import { NotesListRow, type NotesListRowProps } from './NotesListRow';

const note: Note = {
  id: 'a',
  title: 'A note',
  body: '',
  locked: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function renderRow(isManual: boolean, overrides: Partial<NotesListRowProps> = {}) {
  const props: NotesListRowProps = {
    note,
    selectedId: null,
    bulkSelected: false,
    bulkSelectionSize: 0,
    onNoteClick: () => {},
    onNoteContextMenu: () => {},
    decrypted: null,
    isManual,
    isDragging: false,
    isDropTarget: false,
    onDragStart: () => {},
    onDragOver: () => {},
    onDrop: () => {},
    onDragEnd: () => {},
    ...overrides,
  };
  const { container } = render(<NotesListRow {...props} />);
  const row = container.querySelector('.notes-page__list-row');
  if (!row) throw new Error('row did not render');
  return row;
}

describe('NotesListRow', () => {
  it('offers a real draggable grip under manual sort', () => {
    const row = renderRow(true);
    const handle = row.querySelector('.notes-page__drag-handle');
    expect(handle).not.toBeNull();
    expect(handle?.getAttribute('draggable')).toBe('true');
    expect(handle?.classList.contains('notes-page__drag-handle--subtle')).toBe(false);
    expect(row.classList.contains('notes-page__list-row--manual')).toBe(true);
  });

  it('keeps a subtle draggable grip when the sort mode will not reorder', () => {
    // Without a handle, non-manual modes had no way to start a drag (the row
    // button swallows HTML5 dragstart), so move-between-lists was dead too.
    const row = renderRow(false);
    const handle = row.querySelector('.notes-page__drag-handle');
    expect(handle).not.toBeNull();
    expect(handle?.getAttribute('draggable')).toBe('true');
    expect(handle?.classList.contains('notes-page__drag-handle--subtle')).toBe(true);
  });

  it('does not mark the row or the click button as the drag source', () => {
    const row = renderRow(true);
    expect(row.getAttribute('draggable')).toBeNull();
    expect(row.querySelector('.notes-page__list-item')?.getAttribute('draggable')).toBe('false');
  });

  it('starts a drag from the grip, not from the title button', () => {
    const onDragStart = vi.fn();
    const row = renderRow(true, { onDragStart });
    const handle = row.querySelector('.notes-page__drag-handle');
    if (!handle) throw new Error('missing handle');

    fireEvent.dragStart(handle);
    expect(onDragStart).toHaveBeenCalledTimes(1);
    expect(onDragStart.mock.calls[0]?.[1]).toBe('a');
  });
});
