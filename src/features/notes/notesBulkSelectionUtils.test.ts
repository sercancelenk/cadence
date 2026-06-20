import { describe, expect, it } from 'vitest';
import {
  contextMenuNoteIds,
  rangeNoteIds,
  shouldUpdateRangeAnchor,
  toggleBulkId,
} from './notesBulkSelectionUtils';
import { flatSidebarNoteIds } from './notesSidebarOrder';
import type { Note, NoteGroup } from '../../model';

function note(id: string, groupId?: string): Note {
  return {
    id,
    title: id,
    body: '',
    locked: false,
    pinned: false,
    groupId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('flatSidebarNoteIds', () => {
  it('returns grouped notes before ungrouped in list order', () => {
    const groups: NoteGroup[] = [
      { id: 'g1', name: 'A', sortOrder: 0, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'g2', name: 'B', sortOrder: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    ];
    const notes = [note('u1'), note('g1n1', 'g1'), note('g2n1', 'g2')];
    expect(flatSidebarNoteIds(groups, notes)).toEqual(['g1n1', 'g2n1', 'u1']);
  });
});

describe('rangeNoteIds', () => {
  const ordered = ['a', 'b', 'c', 'd'];

  it('returns inclusive range between anchor and target', () => {
    expect(rangeNoteIds(ordered, 'b', 'd')).toEqual(['b', 'c', 'd']);
    expect(rangeNoteIds(ordered, 'd', 'b')).toEqual(['b', 'c', 'd']);
  });

  it('falls back to target when anchor is missing', () => {
    expect(rangeNoteIds(ordered, 'missing', 'c')).toEqual(['c']);
  });
});

describe('toggleBulkId', () => {
  it('adds and removes ids', () => {
    expect(toggleBulkId(new Set(['a']), 'b')).toEqual(new Set(['a', 'b']));
    expect(toggleBulkId(new Set(['a', 'b']), 'a')).toEqual(new Set(['b']));
  });
});

describe('shouldUpdateRangeAnchor', () => {
  it('returns false for no-op click on sole auto-selected row with empty bulk', () => {
    expect(shouldUpdateRangeAnchor('a', 'a', new Set())).toBe(false);
  });

  it('returns false for no-op click on sole auto-selected row', () => {
    expect(shouldUpdateRangeAnchor('a', 'a', new Set(['a']))).toBe(false);
  });

  it('returns true when selection changes to another row', () => {
    expect(shouldUpdateRangeAnchor('b', 'a', new Set())).toBe(true);
    expect(shouldUpdateRangeAnchor('b', 'a', new Set(['a']))).toBe(true);
  });

  it('returns true when bulk selection has multiple rows', () => {
    expect(shouldUpdateRangeAnchor('a', 'a', new Set(['a', 'b']))).toBe(true);
  });
});

describe('contextMenuNoteIds', () => {
  it('keeps multi selection when right-clicking a selected row', () => {
    const bulk = new Set(['a', 'b', 'c']);
    expect(contextMenuNoteIds('b', bulk)).toEqual({
      ids: ['a', 'b', 'c'],
      nextBulk: new Set(['a', 'b', 'c']),
    });
  });

  it('selects only clicked row when outside current bulk selection', () => {
    const bulk = new Set(['a', 'b']);
    expect(contextMenuNoteIds('z', bulk)).toEqual({
      ids: ['z'],
      nextBulk: new Set(['z']),
    });
  });
});
