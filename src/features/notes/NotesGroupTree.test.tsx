import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Note, NoteGroup } from '../../model';
import { buildGroupForest } from './noteGroupForest';
import { NotesGroupTree, type NotesGroupTreeProps } from './NotesGroupTree';

const TS = '2026-01-01T00:00:00.000Z';
const g = (id: string, over: Partial<NoteGroup> = {}): NoteGroup => ({
  id,
  name: id[0]!.toUpperCase() + id.slice(1),
  sortOrder: 0,
  createdAt: TS,
  ...over,
});
const n = (id: string, over: Partial<Note> = {}): Note => ({
  id,
  title: id,
  body: '',
  locked: false,
  createdAt: TS,
  updatedAt: TS,
  ...over,
});

function setup(opts: {
  groups: NoteGroup[];
  notes?: Note[];
  viewMode?: 'active' | 'archived';
  expanded?: string[];
}) {
  const viewMode = opts.viewMode ?? 'active';
  const notes = opts.notes ?? [];
  const forest = buildGroupForest({ groups: opts.groups, notes, viewMode });
  const expanded = new Set(opts.expanded ?? opts.groups.map((x) => x.id));
  const handlers = {
    onToggle: vi.fn(),
    onExpand: vi.fn(),
    onCreateNote: vi.fn(),
    onCreateSubGroup: vi.fn(),
    onRename: vi.fn(),
    onSetArchived: vi.fn(),
    onMove: vi.fn(),
    onRequestDelete: vi.fn(),
    onGroupDragOver: vi.fn(),
    onGroupDrop: vi.fn(),
  };
  const props: NotesGroupTreeProps = {
    nodes: forest.roots,
    allGroups: opts.groups,
    archivedView: viewMode === 'archived',
    isExpanded: (id) => expanded.has(id),
    renderNote: (note) => (
      <li key={note.id} data-testid={`note-${note.id}`}>
        {note.title}
      </li>
    ),
    dropTargetGroupId: null,
    ...handlers,
  };
  render(<NotesGroupTree {...props} />);
  return handlers;
}

afterEach(cleanup);

describe('NotesGroupTree structure', () => {
  it('nests a sub-list inside its parent and shows notes under the list they belong to', () => {
    setup({
      groups: [g('work'), g('proj', { parentId: 'work' })],
      notes: [n('a', { groupId: 'work' }), n('b', { groupId: 'proj' })],
    });
    const work = screen.getByRole('list', { name: 'Notes in Work' });
    expect(within(work).getByText('Proj')).toBeTruthy();
    expect(within(work).getByTestId('note-a')).toBeTruthy();
    const proj = screen.getByRole('list', { name: 'Notes in Proj' });
    expect(within(proj).getByTestId('note-b')).toBeTruthy();
  });

  it('hides the contents of a collapsed list', () => {
    setup({ groups: [g('work'), g('proj', { parentId: 'work' })], expanded: [] });
    expect(screen.queryByText('Proj')).toBeNull();
  });

  it('shows the subtree note count on the list head', () => {
    setup({
      groups: [g('work'), g('proj', { parentId: 'work' })],
      notes: [n('a', { groupId: 'work' }), n('b', { groupId: 'proj' })],
      expanded: [],
    });
    expect(screen.getByRole('button', { name: /^Work/ }).textContent).toContain('2');
  });
});

describe('NotesGroupTree creating and renaming', () => {
  it('creates a sub-list inline: Enter submits, the parent is expanded', () => {
    const h = setup({ groups: [g('work')] });
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-list to Work' }));
    const input = screen.getByLabelText('New sub-list name');
    fireEvent.change(input, { target: { value: '  Proj  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.onCreateSubGroup).toHaveBeenCalledWith('work', 'Proj');
    expect(h.onExpand).toHaveBeenCalledWith('work');
    expect(screen.queryByLabelText('New sub-list name')).toBeNull();
  });

  it('cancels inline creation with Escape and ignores a blank name', () => {
    const h = setup({ groups: [g('work')] });
    fireEvent.click(screen.getByRole('button', { name: 'Add sub-list to Work' }));
    const input = screen.getByLabelText('New sub-list name');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.onCreateSubGroup).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByLabelText('New sub-list name')).toBeNull();
    expect(h.onCreateSubGroup).not.toHaveBeenCalled();
  });

  it('renames with F2 and Enter, and cancels with Escape', () => {
    const h = setup({ groups: [g('work')] });
    fireEvent.keyDown(screen.getByRole('button', { name: /^Work/ }), { key: 'F2' });
    const input = screen.getByLabelText('Rename list');
    fireEvent.change(input, { target: { value: 'Office' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(h.onRename).toHaveBeenCalledWith('work', 'Office');

    fireEvent.keyDown(screen.getByRole('button', { name: /^Work/ }), { key: 'F2' });
    fireEvent.keyDown(screen.getByLabelText('Rename list'), { key: 'Escape' });
    expect(screen.queryByLabelText('Rename list')).toBeNull();
    expect(h.onRename).toHaveBeenCalledTimes(1);
  });

  it('renames on double click', () => {
    setup({ groups: [g('work')] });
    fireEvent.doubleClick(screen.getByRole('button', { name: /^Work/ }));
    expect(screen.getByLabelText('Rename list')).toBeTruthy();
  });

  it('adds a note straight into a list', () => {
    const h = setup({ groups: [g('work')] });
    fireEvent.click(screen.getByRole('button', { name: 'Add note to Work' }));
    expect(h.onCreateNote).toHaveBeenCalledWith('work');
  });

  it('does not offer sub-lists past the maximum depth', () => {
    setup({
      groups: [
        g('l1'),
        g('l2', { parentId: 'l1' }),
        g('l3', { parentId: 'l2' }),
        g('l4', { parentId: 'l3' }),
        g('l5', { parentId: 'l4' }),
      ],
    });
    expect(screen.getByRole('button', { name: 'Add sub-list to L4' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add sub-list to L5' })).toBeNull();
  });
});

describe('NotesGroupTree actions', () => {
  it('archives from the head button', () => {
    const h = setup({ groups: [g('work')] });
    fireEvent.click(screen.getByRole('button', { name: 'Archive Work' }));
    expect(h.onSetArchived).toHaveBeenCalledWith('work', true);
  });

  it('asks for deletion confirmation through the callback instead of deleting itself', () => {
    const h = setup({ groups: [g('work')] });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Work' }));
    expect(h.onRequestDelete).toHaveBeenCalledWith('work');
  });

  it('opens a context menu with every list action', () => {
    const h = setup({ groups: [g('work'), g('home')] });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Work/ }));
    const menu = screen.getByRole('menu', { name: 'List actions' });
    for (const label of ['New note', 'New sub-list', 'Rename', 'Archive', 'Delete']) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeTruthy();
    }
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Archive' }));
    expect(h.onSetArchived).toHaveBeenCalledWith('work', true);
    expect(screen.queryByRole('menu', { name: 'List actions' })).toBeNull();
  });

  it('moves a list from the context menu, including back to the top level', () => {
    const h = setup({ groups: [g('work'), g('proj', { parentId: 'work' }), g('home')] });
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Proj/ }));
    const menu = screen.getByRole('menu', { name: 'List actions' });
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Home' }));
    expect(h.onMove).toHaveBeenCalledWith('proj', 'home');
    fireEvent.contextMenu(screen.getByRole('button', { name: /^Proj/ }));
    fireEvent.click(
      within(screen.getByRole('menu', { name: 'List actions' })).getByRole('menuitem', { name: 'Top level' }),
    );
    expect(h.onMove).toHaveBeenLastCalledWith('proj', undefined);
  });
});

describe('NotesGroupTree archived view', () => {
  const groups = [g('p', { archived: true }), g('c', { parentId: 'p' })];

  it('offers Restore on the archived root only, and no creation controls', () => {
    const h = setup({ groups, viewMode: 'archived' });
    fireEvent.click(screen.getByRole('button', { name: 'Restore P' }));
    expect(h.onSetArchived).toHaveBeenCalledWith('p', false);
    expect(screen.queryByRole('button', { name: 'Restore C' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add note to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Add sub-list to/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Archive / })).toBeNull();
  });

  it('labels a list shown outside its parent with the parent path', () => {
    setup({
      groups: [g('top'), g('mid', { parentId: 'top', archived: true })],
      viewMode: 'archived',
    });
    expect(screen.getByText('Top')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore Mid' })).toBeTruthy();
  });
});
