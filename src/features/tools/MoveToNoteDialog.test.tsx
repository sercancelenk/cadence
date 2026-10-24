import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteGroup } from '../../core/model';
import { MoveToNoteDialog } from './MoveToNoteDialog';

const TS = '2026-01-01T00:00:00.000Z';
const g = (id: string, over: Partial<NoteGroup> = {}): NoteGroup => ({ id, name: id, sortOrder: 0, createdAt: TS, ...over });

function setup(groups: NoteGroup[] = [g('work', { name: 'Work' }), g('proj', { name: 'Projects', parentId: 'work' })]) {
  const props = { groups, tabTitle: 'Plan', onConfirm: vi.fn(), onCancel: vi.fn() };
  render(<MoveToNoteDialog {...props} />);
  return props;
}

describe('MoveToNoteDialog', () => {
  afterEach(cleanup);

  it('names the document and lists the top level plus every list', () => {
    setup();
    expect(screen.getByText(/Plan/)).toBeTruthy();
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual([
      'No list (top level)',
      'Work',
      'Work / Projects',
    ]);
  });

  it('starts on the top level and confirms it as no list', () => {
    const p = setup();
    expect((screen.getByRole('radio', { name: 'No list (top level)' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move to Notes' }));
    expect(p.onConfirm).toHaveBeenCalledWith(undefined);
  });

  it('confirms the chosen list', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Work / Projects' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move to Notes' }));
    expect(p.onConfirm).toHaveBeenCalledWith('proj');
  });

  it('cancels without confirming', () => {
    const p = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(p.onCancel).toHaveBeenCalledTimes(1);
    expect(p.onConfirm).not.toHaveBeenCalled();
  });
});
