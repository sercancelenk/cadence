import { describe, expect, it } from 'vitest';
import type { Note, NoteGroup } from '../../model';
import {
  buildGroupForest,
  describeGroupDeletion,
  flattenForestNoteIds,
  moveTargets,
  type GroupNode,
} from './noteGroupForest';

const TS = '2026-01-01T00:00:00.000Z';
const g = (id: string, over: Partial<NoteGroup> = {}): NoteGroup => ({
  id,
  name: id,
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
const ids = (nodes: GroupNode[]) => nodes.map((x) => x.group.id);
const find = (nodes: GroupNode[], id: string): GroupNode | undefined => {
  for (const node of nodes) {
    if (node.group.id === id) return node;
    const hit = find(node.children, id);
    if (hit) return hit;
  }
  return undefined;
};
const allIds = (nodes: GroupNode[]): string[] => nodes.flatMap((x) => [x.group.id, ...allIds(x.children)]);

describe('buildGroupForest (active view)', () => {
  const groups = [
    g('work', { sortOrder: 2 }),
    g('home', { sortOrder: 1 }),
    g('proj', { sortOrder: 0, parentId: 'work' }),
    g('old', { archived: true }),
    g('old-sub', { parentId: 'old' }),
  ];
  const notes = [
    n('a', { groupId: 'work' }),
    n('b', { groupId: 'proj' }),
    n('c', { groupId: 'proj' }),
    n('d'),
  ];

  it('nests lists, sorts siblings by sortOrder and hides archived lists with their sub-lists', () => {
    const { roots, ungrouped } = buildGroupForest({ groups, notes, viewMode: 'active' });
    expect(ids(roots)).toEqual(['home', 'work']);
    expect(ids(find(roots, 'work')!.children)).toEqual(['proj']);
    expect(allIds(roots)).not.toContain('old');
    expect(allIds(roots)).not.toContain('old-sub');
    expect(ungrouped.map((x) => x.id)).toEqual(['d']);
  });

  it('counts notes across the whole subtree but lists only direct notes per list', () => {
    const { roots } = buildGroupForest({ groups, notes, viewMode: 'active' });
    const work = find(roots, 'work')!;
    expect(work.notes.map((x) => x.id)).toEqual(['a']);
    expect(work.noteCount).toBe(3);
    expect(find(roots, 'proj')!.noteCount).toBe(2);
  });

  it('offers archive and sub-list creation, but never restore', () => {
    const { roots } = buildGroupForest({ groups, notes, viewMode: 'active' });
    const work = find(roots, 'work')!;
    expect(work.canArchive).toBe(true);
    expect(work.canRestore).toBe(false);
    expect(work.canAddSubList).toBe(true);
  });

  it('stops offering sub-lists at the maximum depth', () => {
    const chain = [g('l1'), g('l2', { parentId: 'l1' }), g('l3', { parentId: 'l2' }), g('l4', { parentId: 'l3' }), g('l5', { parentId: 'l4' })];
    const { roots } = buildGroupForest({ groups: chain, notes: [], viewMode: 'active' });
    expect(find(roots, 'l4')!.canAddSubList).toBe(true);
    expect(find(roots, 'l5')!.canAddSubList).toBe(false);
  });
});

describe('buildGroupForest (archived view)', () => {
  it('shows an archived list as a restorable root with its sub-lists nested and not restorable', () => {
    const groups = [g('p', { archived: true }), g('c', { parentId: 'p' }), g('live')];
    const notes = [n('x', { groupId: 'c' })];
    const { roots } = buildGroupForest({ groups, notes, viewMode: 'archived' });
    expect(ids(roots)).toEqual(['p']);
    expect(ids(roots[0]!.children)).toEqual(['c']);
    expect(roots[0]!.canRestore).toBe(true);
    expect(roots[0]!.children[0]!.canRestore).toBe(false);
    expect(roots[0]!.canArchive).toBe(false);
    expect(roots[0]!.canAddSubList).toBe(false);
    expect(roots[0]!.noteCount).toBe(1);
  });

  it('shows a child archived on its own as a root labelled with its parent path', () => {
    const groups = [g('top'), g('mid', { parentId: 'top' }), g('leaf', { parentId: 'mid', archived: true })];
    const { roots } = buildGroupForest({ groups, notes: [], viewMode: 'archived' });
    expect(ids(roots)).toEqual(['leaf']);
    expect(roots[0]!.pathLabel).toBe('top / mid');
    expect(roots[0]!.canRestore).toBe(true);
  });

  it('keeps a live list visible when one of its notes was archived on its own', () => {
    const groups = [g('live'), g('empty')];
    const notes = [n('solo', { groupId: 'live', archived: true })];
    const { roots } = buildGroupForest({ groups, notes, viewMode: 'archived' });
    expect(ids(roots)).toEqual(['live']);
    expect(roots[0]!.canRestore).toBe(false);
    expect(roots[0]!.notes.map((x) => x.id)).toEqual(['solo']);
  });

  it('leaves an earlier-archived child archived and nested after its parent is restored', () => {
    const groups = [g('p'), g('c', { parentId: 'p', archived: true })];
    const { roots: active } = buildGroupForest({ groups, notes: [], viewMode: 'active' });
    expect(allIds(active)).toEqual(['p']);
    const { roots: archived } = buildGroupForest({ groups, notes: [], viewMode: 'archived' });
    expect(ids(archived)).toEqual(['c']);
    expect(archived[0]!.pathLabel).toBe('p');
  });
});

describe('buildGroupForest never loses a list', () => {
  it('renders every list of a cyclic or dangling tree exactly once', () => {
    const groups = [
      g('a', { parentId: 'b' }),
      g('b', { parentId: 'a' }),
      g('c', { parentId: 'gone' }),
      g('d', { parentId: 'd' }),
    ];
    const { roots } = buildGroupForest({ groups, notes: [], viewMode: 'active' });
    expect(allIds(roots).sort()).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('flattenForestNoteIds', () => {
  it('follows display order: sub-lists, then own notes, then ungrouped', () => {
    const groups = [g('p'), g('c', { parentId: 'p' })];
    const notes = [n('np', { groupId: 'p' }), n('nc', { groupId: 'c' }), n('free')];
    expect(flattenForestNoteIds(buildGroupForest({ groups, notes, viewMode: 'active' }))).toEqual([
      'nc',
      'np',
      'free',
    ]);
  });
});

describe('describeGroupDeletion', () => {
  const groups = [g('top'), g('mid', { parentId: 'top' }), g('sub', { parentId: 'mid' })];
  const notes = [n('1', { groupId: 'mid' }), n('2', { groupId: 'mid' }), n('3', { groupId: 'sub' })];

  it('counts direct notes and direct sub-lists and names the destination', () => {
    const d = describeGroupDeletion(groups, notes, 'mid');
    expect(d).toMatchObject({ noteCount: 2, subListCount: 1, destinationName: 'top' });
    expect(d.message).toBe('2 notes and 1 sub-list will move to “top”. Nothing else is deleted.');
  });

  it('moves a root list contents to the top level / ungrouped', () => {
    const d = describeGroupDeletion(groups, notes, 'top');
    expect(d.destinationName).toBeUndefined();
    expect(d.message).toBe('1 sub-list will move to the top level. Nothing else is deleted.');
  });

  it('says so when the list is empty', () => {
    expect(describeGroupDeletion([g('x')], [], 'x').message).toBe('This list is empty.');
  });
});

describe('moveTargets', () => {
  const groups = [g('a'), g('b', { parentId: 'a' }), g('c', { parentId: 'b' }), g('d')];

  it('excludes the list, its sub-lists and its current parent', () => {
    const labels = moveTargets(groups, 'b').map((t) => t.id);
    expect(labels).toContain('d');
    expect(labels).not.toContain('b');
    expect(labels).not.toContain('c');
    expect(labels).not.toContain('a');
  });

  it('offers the top level only when the list is nested', () => {
    expect(moveTargets(groups, 'b').some((t) => t.id === undefined)).toBe(true);
    expect(moveTargets(groups, 'd').some((t) => t.id === undefined)).toBe(false);
  });

  it('drops destinations that would push the subtree past the depth limit', () => {
    const deep = [g('l1'), g('l2', { parentId: 'l1' }), g('l3', { parentId: 'l2' }), g('l4', { parentId: 'l3' }), g('x'), g('y', { parentId: 'x' })];
    const targets = moveTargets(deep, 'x').map((t) => t.id);
    expect(targets).not.toContain('l4');
    expect(targets).toContain('l3');
  });
});
