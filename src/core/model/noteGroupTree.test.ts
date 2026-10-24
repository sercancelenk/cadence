import { describe, expect, it } from 'vitest';
import type { Note, NoteGroup } from './index';
import { appDataToPersistJson, normalizeData, emptyData } from './index';
import {
  MAX_NOTE_GROUP_DEPTH,
  archivedRootGroupIds,
  effectiveParentId,
  groupAncestors,
  groupDepth,
  groupDescendantIds,
  groupSubtreeHeight,
  isGroupEffectivelyArchived,
  isNoteEffectivelyArchived,
} from './noteGroupTree';

const TS = '2026-01-01T00:00:00.000Z';
const g = (id: string, parentId?: string, extra: Partial<NoteGroup> = {}): NoteGroup => ({
  id,
  name: id,
  sortOrder: 0,
  createdAt: TS,
  ...(parentId ? { parentId } : {}),
  ...extra,
});
const note = (over: Partial<Note> = {}): Note => ({
  id: 'n',
  title: '',
  body: '',
  locked: false,
  createdAt: TS,
  updatedAt: TS,
  ...over,
});

describe('effectiveParentId', () => {
  it('returns undefined for legacy groups without parentId', () => {
    expect(effectiveParentId([g('a')], 'a')).toBeUndefined();
  });

  it('returns the parent when it exists', () => {
    expect(effectiveParentId([g('a'), g('b', 'a')], 'b')).toBe('a');
  });

  it('treats a missing parent, a self parent and a cycle as root without throwing', () => {
    expect(effectiveParentId([g('a', 'gone')], 'a')).toBeUndefined();
    expect(effectiveParentId([g('a', 'a')], 'a')).toBeUndefined();
    const cycle = [g('a', 'b'), g('b', 'a')];
    expect(effectiveParentId(cycle, 'a')).toBeUndefined();
    expect(effectiveParentId(cycle, 'b')).toBeUndefined();
  });

  it('keeps a branch that hangs off a cycle attached to it', () => {
    const groups = [g('a', 'b'), g('b', 'a'), g('c', 'a')];
    expect(effectiveParentId(groups, 'c')).toBe('a');
  });
});

describe('groupAncestors / groupDepth / groupDescendantIds / groupSubtreeHeight', () => {
  const groups = [g('root'), g('mid', 'root'), g('leaf', 'mid'), g('other')];

  it('lists ancestors nearest first', () => {
    expect(groupAncestors(groups, 'leaf')).toEqual(['mid', 'root']);
    expect(groupAncestors(groups, 'root')).toEqual([]);
  });

  it('counts depth with root = 1', () => {
    expect(groupDepth(groups, 'root')).toBe(1);
    expect(groupDepth(groups, 'leaf')).toBe(3);
  });

  it('collects every descendant', () => {
    expect(new Set(groupDescendantIds(groups, 'root'))).toEqual(new Set(['mid', 'leaf']));
    expect(groupDescendantIds(groups, 'other')).toEqual([]);
  });

  it('reports subtree height with a lone group = 1', () => {
    expect(groupSubtreeHeight(groups, 'root')).toBe(3);
    expect(groupSubtreeHeight(groups, 'other')).toBe(1);
  });

  it('caps nesting at depth 5', () => {
    expect(MAX_NOTE_GROUP_DEPTH).toBe(5);
  });

  it('terminates on cyclic data', () => {
    const cycle = [g('a', 'b'), g('b', 'a')];
    expect(groupDepth(cycle, 'a')).toBe(1);
    expect(groupDescendantIds(cycle, 'a')).toEqual([]);
  });
});

describe('archive derivation', () => {
  const groups = [
    g('p', undefined, { archived: true }),
    g('c', 'p'),
    g('free'),
    g('freeChild', 'free', { archived: true }),
  ];

  it('is archived itself or through any archived ancestor', () => {
    expect(isGroupEffectivelyArchived(groups, 'p')).toBe(true);
    expect(isGroupEffectivelyArchived(groups, 'c')).toBe(true);
    expect(isGroupEffectivelyArchived(groups, 'free')).toBe(false);
    expect(isGroupEffectivelyArchived(groups, 'freeChild')).toBe(true);
  });

  it('archives a note through its list without touching note.archived', () => {
    const inChild = note({ groupId: 'c' });
    expect(isNoteEffectivelyArchived(inChild, groups)).toBe(true);
    expect(inChild.archived).toBeUndefined();
    expect(isNoteEffectivelyArchived(note({ groupId: 'free' }), groups)).toBe(false);
    expect(isNoteEffectivelyArchived(note({ archived: true }), groups)).toBe(true);
    expect(isNoteEffectivelyArchived(note(), groups)).toBe(false);
  });

  it('returns only top-most archived groups as archive roots', () => {
    expect(new Set(archivedRootGroupIds(groups))).toEqual(new Set(['p', 'freeChild']));
  });

  it('keeps an earlier-archived child archived after its archived parent is restored', () => {
    const before = [g('p', undefined, { archived: true }), g('c', 'p', { archived: true })];
    const restored = before.map((x) => (x.id === 'p' ? { ...x, archived: undefined } : x));
    expect(isGroupEffectivelyArchived(restored, 'p')).toBe(false);
    expect(isGroupEffectivelyArchived(restored, 'c')).toBe(true);
    expect(restored.find((x) => x.id === 'c')?.parentId).toBe('p');
  });
});

describe('normalizeData with nested lists', () => {
  const base = () => {
    const d = emptyData();
    return JSON.parse(JSON.stringify(d)) as Record<string, unknown>;
  };

  it('loads legacy groups unchanged (no parentId key introduced)', () => {
    const raw = { ...base(), noteGroups: [{ id: 'a', name: 'A', sortOrder: 0, createdAt: TS }] };
    const out = normalizeData(raw);
    expect(out.noteGroups).toHaveLength(1);
    expect(out.noteGroups[0]?.parentId).toBeUndefined();
    expect(JSON.stringify(out.noteGroups[0])).not.toContain('parentId');
  });

  it('keeps parentId from disk, including a dangling one, and never drops the list', () => {
    const raw = {
      ...base(),
      noteGroups: [
        { id: 'a', name: 'A', sortOrder: 0, createdAt: TS },
        { id: 'b', name: 'B', sortOrder: 1, createdAt: TS, parentId: 'a' },
        { id: 'c', name: 'C', sortOrder: 2, createdAt: TS, parentId: 'missing' },
        { id: 'd', name: 'D', sortOrder: 3, createdAt: TS, parentId: 'd' },
      ],
    };
    const out = normalizeData(raw);
    expect(out.noteGroups.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.noteGroups.find((x) => x.id === 'b')?.parentId).toBe('a');
    expect(out.noteGroups.find((x) => x.id === 'c')?.parentId).toBe('missing');
    expect(effectiveParentId(out.noteGroups, 'c')).toBeUndefined();
    expect(effectiveParentId(out.noteGroups, 'd')).toBeUndefined();
  });

  it('ignores a non-string parentId value', () => {
    const raw = {
      ...base(),
      noteGroups: [{ id: 'a', name: 'A', sortOrder: 0, createdAt: TS, parentId: 42 }],
    };
    expect(normalizeData(raw).noteGroups[0]?.parentId).toBeUndefined();
  });

  it('round-trips nested lists and the archive flag through the persisted JSON', () => {
    const raw = {
      ...base(),
      noteGroups: [
        { id: 'a', name: 'A', sortOrder: 0, createdAt: TS, archived: true },
        { id: 'b', name: 'B', sortOrder: 1, createdAt: TS, parentId: 'a' },
      ],
      notes: [{ id: 'n', title: 'T', body: '', locked: false, groupId: 'b', createdAt: TS, updatedAt: TS }],
    };
    const first = normalizeData(raw);
    const again = normalizeData(JSON.parse(appDataToPersistJson(first)));
    expect(again.noteGroups.find((x) => x.id === 'b')?.parentId).toBe('a');
    expect(again.noteGroups.find((x) => x.id === 'a')?.archived).toBe(true);
    expect(again.notes[0]?.groupId).toBe('b');
    expect(again.notes[0]?.archived).toBeUndefined();
  });
});
