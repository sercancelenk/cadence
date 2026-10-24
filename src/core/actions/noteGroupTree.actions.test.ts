import { describe, expect, it } from 'vitest';
import { emptyData, isNoteEffectivelyArchived, type AppData, type Note, type NoteGroup } from '../model';
import { addNoteGroup, moveNoteGroup, removeNoteGroup, updateNoteGroup } from './index';

const TS = '2026-01-01T00:00:00.000Z';
const grp = (id: string, parentId?: string, extra: Partial<NoteGroup> = {}): NoteGroup => ({
  id,
  name: id,
  sortOrder: 0,
  createdAt: TS,
  ...(parentId ? { parentId } : {}),
  ...extra,
});
const nt = (id: string, groupId?: string): Note => ({
  id,
  title: id,
  body: '',
  locked: false,
  ...(groupId ? { groupId } : {}),
  createdAt: TS,
  updatedAt: TS,
});
function withGroups(groups: NoteGroup[], notes: Note[] = []): AppData {
  return { ...emptyData(), noteGroups: groups, notes };
}
const parentOf = (d: AppData, id: string) => d.noteGroups.find((g) => g.id === id)?.parentId;

describe('addNoteGroup with a parent', () => {
  it('creates a sub-list under an existing list', () => {
    const d = addNoteGroup(withGroups([grp('a')]), 'Child', 'c', 'a');
    expect(parentOf(d, 'c')).toBe('a');
  });

  it('falls back to a root list when the parent does not exist', () => {
    const d = addNoteGroup(withGroups([grp('a')]), 'Child', 'c', 'missing');
    expect(d.noteGroups.find((g) => g.id === 'c')).toBeDefined();
    expect(parentOf(d, 'c')).toBeUndefined();
  });

  it('refuses to nest deeper than 5 levels and leaves data unchanged', () => {
    const chain = [grp('l1'), grp('l2', 'l1'), grp('l3', 'l2'), grp('l4', 'l3'), grp('l5', 'l4')];
    const data = withGroups(chain);
    expect(addNoteGroup(data, 'Too deep', 'l6', 'l5')).toBe(data);
    expect(addNoteGroup(data, 'Fits', 'l5b', 'l4').noteGroups).toHaveLength(6);
  });

  it('keeps the old three-argument behaviour for root lists', () => {
    const d = addNoteGroup(withGroups([]), '  Work ', 'w');
    expect(d.noteGroups[0]).toMatchObject({ id: 'w', name: 'Work' });
    expect(parentOf(d, 'w')).toBeUndefined();
  });
});

describe('moveNoteGroup', () => {
  const tree = () => withGroups([grp('a'), grp('b', 'a'), grp('c'), grp('d', 'c')]);

  it('re-parents a list together with its sub-lists', () => {
    const d = moveNoteGroup(tree(), 'a', 'c');
    expect(parentOf(d, 'a')).toBe('c');
    expect(parentOf(d, 'b')).toBe('a');
  });

  it('moves a list to the root with an undefined parent', () => {
    expect(parentOf(moveNoteGroup(tree(), 'b', undefined), 'b')).toBeUndefined();
  });

  it('rejects moving a list into itself or its own descendant', () => {
    const data = tree();
    expect(moveNoteGroup(data, 'a', 'a')).toBe(data);
    expect(moveNoteGroup(data, 'a', 'b')).toBe(data);
  });

  it('rejects unknown ids and no-op moves', () => {
    const data = tree();
    expect(moveNoteGroup(data, 'nope', 'a')).toBe(data);
    expect(moveNoteGroup(data, 'a', 'nope')).toBe(data);
    expect(moveNoteGroup(data, 'b', 'a')).toBe(data);
  });

  it('rejects a move that would push the subtree below depth 5', () => {
    const data = withGroups([
      grp('l1'),
      grp('l2', 'l1'),
      grp('l3', 'l2'),
      grp('l4', 'l3'),
      grp('x'),
      grp('y', 'x'),
    ]);
    expect(moveNoteGroup(data, 'x', 'l4')).toBe(data);
  });

  it('never changes notes or other fields of the moved list', () => {
    const data = withGroups([grp('a', undefined, { pinned: true, sortOrder: 7 }), grp('c')], [nt('n1', 'a')]);
    const d = moveNoteGroup(data, 'a', 'c');
    expect(d.noteGroups.find((g) => g.id === 'a')).toMatchObject({ pinned: true, sortOrder: 7, parentId: 'c' });
    expect(d.notes).toEqual(data.notes);
  });
});

describe('removeNoteGroup with nesting', () => {
  it('moves sub-lists and notes up to the removed list parent', () => {
    const data = withGroups(
      [grp('top'), grp('mid', 'top'), grp('sub', 'mid')],
      [nt('n-mid', 'mid'), nt('n-sub', 'sub'), nt('n-top', 'top')],
    );
    const d = removeNoteGroup(data, 'mid');
    expect(d.noteGroups.map((g) => g.id)).toEqual(['top', 'sub']);
    expect(parentOf(d, 'sub')).toBe('top');
    expect(d.notes.find((n) => n.id === 'n-mid')?.groupId).toBe('top');
    expect(d.notes.find((n) => n.id === 'n-sub')?.groupId).toBe('sub');
    expect(d.notes).toHaveLength(3);
  });

  it('moves children and notes of a root list to root / ungrouped', () => {
    const data = withGroups([grp('top'), grp('sub', 'top')], [nt('n1', 'top')]);
    const d = removeNoteGroup(data, 'top');
    expect(parentOf(d, 'sub')).toBeUndefined();
    expect(d.notes[0]?.groupId).toBeUndefined();
    expect(d.notes).toHaveLength(1);
  });

  it('never loses a note or a sub-list, whatever the shape', () => {
    const data = withGroups(
      [grp('a'), grp('b', 'a'), grp('c', 'b'), grp('d', 'c'), grp('e')],
      [nt('1', 'a'), nt('2', 'b'), nt('3', 'c'), nt('4', 'd'), nt('5', 'e'), nt('6')],
    );
    const d = removeNoteGroup(data, 'b');
    expect(d.notes).toHaveLength(6);
    expect(d.noteGroups).toHaveLength(4);
  });
});

describe('archiving a list keeps everything in place', () => {
  it('toggles only the flag; parentId, sortOrder and notes are untouched', () => {
    const data = withGroups([grp('p'), grp('c', 'p', { sortOrder: 3 })], [nt('n', 'c')]);
    const archived = updateNoteGroup(data, 'p', { archived: true });
    const restored = updateNoteGroup(archived, 'p', { archived: false });
    expect(archived.noteGroups.find((g) => g.id === 'p')?.archived).toBe(true);
    expect(restored.noteGroups.find((g) => g.id === 'p')?.archived).toBeUndefined();
    expect(restored.noteGroups.find((g) => g.id === 'c')).toEqual(data.noteGroups.find((g) => g.id === 'c'));
    expect(restored.notes).toEqual(data.notes);
  });
});

describe('removeNoteGroup keeps archived content archived', () => {
  it('notes of a deleted archived list stay archived at the new parent', () => {
    const data = withGroups([grp('p'), grp('g', 'p', { archived: true })], [nt('n', 'g')]);
    const d = removeNoteGroup(data, 'g');
    const n = d.notes.find((x) => x.id === 'n')!;
    expect(n.groupId).toBe('p');
    expect(isNoteEffectivelyArchived(n, d.noteGroups)).toBe(true);
  });

  it('notes of a deleted archived root list stay archived at the top level', () => {
    const data = withGroups([grp('g', undefined, { archived: true })], [nt('n', 'g')]);
    const d = removeNoteGroup(data, 'g');
    const n = d.notes.find((x) => x.id === 'n')!;
    expect(n.groupId).toBeUndefined();
    expect(isNoteEffectivelyArchived(n, d.noteGroups)).toBe(true);
  });

  it('sub-lists of a deleted archived list stay archived, with their notes', () => {
    const data = withGroups(
      [grp('g', undefined, { archived: true }), grp('c', 'g')],
      [nt('n', 'c')],
    );
    const d = removeNoteGroup(data, 'g');
    const n = d.notes.find((x) => x.id === 'n')!;
    expect(parentOf(d, 'c')).toBeUndefined();
    expect(isNoteEffectivelyArchived(n, d.noteGroups)).toBe(true);
  });

  it('keeps content archived when only an ancestor of the deleted list was archived', () => {
    const data = withGroups(
      [grp('a', undefined, { archived: true }), grp('g', 'a')],
      [nt('n', 'g')],
    );
    const d = removeNoteGroup(data, 'g');
    const n = d.notes.find((x) => x.id === 'n')!;
    expect(n.groupId).toBe('a');
    expect(isNoteEffectivelyArchived(n, d.noteGroups)).toBe(true);
  });

  it('leaves content active when the deleted list was active', () => {
    const data = withGroups([grp('g'), grp('c', 'g')], [nt('n', 'g'), nt('m', 'c')]);
    const d = removeNoteGroup(data, 'g');
    expect(d.notes.every((x) => !isNoteEffectivelyArchived(x, d.noteGroups))).toBe(true);
    expect(d.noteGroups.find((x) => x.id === 'c')?.archived).toBeUndefined();
  });

  it('never changes which notes exist', () => {
    const data = withGroups([grp('g', undefined, { archived: true })], [nt('n1', 'g'), nt('n2')]);
    const d = removeNoteGroup(data, 'g');
    expect(d.notes.map((x) => x.id)).toEqual(['n1', 'n2']);
  });
});

describe('removeNoteGroup with damaged trees', () => {
  it('keeps content archived when the archived list pointed at a parent that no longer exists', () => {
    const data = withGroups([grp('g', 'ghost', { archived: true })], [nt('n', 'g')]);
    const d = removeNoteGroup(data, 'g');
    const n = d.notes.find((x) => x.id === 'n')!;
    expect(n.groupId).toBeUndefined();
    expect(isNoteEffectivelyArchived(n, d.noteGroups)).toBe(true);
  });

  it('loses nothing and archives everything when an archived list sits in a parent cycle', () => {
    const data = withGroups(
      [grp('a', 'b', { archived: true }), grp('b', 'a')],
      [nt('n1', 'a'), nt('n2', 'b')],
    );
    const d = removeNoteGroup(data, 'a');
    expect(d.notes.map((x) => x.id).sort()).toEqual(['n1', 'n2']);
    expect(d.noteGroups.map((x) => x.id)).toEqual(['b']);
    const n1 = d.notes.find((x) => x.id === 'n1')!;
    expect(isNoteEffectivelyArchived(n1, d.noteGroups)).toBe(true);
    expect(d.noteGroups[0]!.parentId).toBeUndefined();
  });

  it('does not archive anything extra when an archived list moves under an already archived parent', () => {
    const data = withGroups(
      [grp('top', undefined, { archived: true }), grp('g', 'top', { archived: true })],
      [nt('n', 'g')],
    );
    const d = removeNoteGroup(data, 'g');
    const n = d.notes.find((x) => x.id === 'n')!;
    expect(n.groupId).toBe('top');
    expect(n.archived).toBeUndefined();
  });
});
