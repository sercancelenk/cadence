import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TodoItem } from '../../model';
import { AddToPlanningModal } from './AddToPlanningModal';

const item = (id: string, title: string, over: Partial<TodoItem> = {}): TodoItem =>
  ({ id, groupId: 'g1', title, status: 'todo', done: false, createdAt: '2026-01-01', updatedAt: '2026-01-01', dueAt: '2026-03-01T09:00:00.000Z', ...over }) as TodoItem;

const candidates = [
  item('a', 'Write report', { bodyPlainText: 'include the Q3 numbers', body: '', bodyFormat: 'markdown' }),
  item('b', 'Call vendor', { body: 'ask about the **invoice** delay', bodyFormat: 'markdown' }),
  item('c', 'Book travel'),
];

function mount() {
  render(
    <MemoryRouter>
      <AddToPlanningModal candidates={candidates} hubCount={0} atCapacity={false} onAddMany={vi.fn()} onClose={vi.fn()} />
    </MemoryRouter>,
  );
}
afterEach(cleanup);

describe('AddToPlanningModal', () => {
  it('shows only the title of each task, one tight row each', () => {
    mount();
    expect(screen.getByText('Write report')).toBeTruthy();
    expect(screen.queryByText(/Work list/)).toBeNull();
    expect(document.querySelectorAll('.planning-add-dialog__row').length).toBe(3);
    // The list-name span used to share the class of the scrolling list, which gave every row a tall minimum height.
    expect(document.querySelectorAll('.planning-add-dialog__list').length).toBe(1);
  });

  it('searches the title and the details of a task', () => {
    mount();
    const box = screen.getByPlaceholderText(/Search/);
    fireEvent.change(box, { target: { value: 'q3 numbers' } });
    expect(screen.getByText('Write report')).toBeTruthy();
    expect(screen.queryByText('Call vendor')).toBeNull();
    fireEvent.change(box, { target: { value: 'invoice' } });
    expect(screen.getByText('Call vendor')).toBeTruthy();
    expect(screen.queryByText('Write report')).toBeNull();
    fireEvent.change(box, { target: { value: 'travel' } });
    expect(screen.getByText('Book travel')).toBeTruthy();
  });
});
