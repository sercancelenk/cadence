import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  materialContentCount,
  isCatastrophicEmptyOverwrite,
  collectionCounts,
  contentShapeShrank,
} = require('./dataIntegrity.cjs') as {
  materialContentCount: (d: unknown) => number;
  isCatastrophicEmptyOverwrite: (prev: unknown, next: unknown) => boolean;
  collectionCounts: (d: unknown) => Record<string, number>;
  contentShapeShrank: (prev: unknown, next: unknown) => boolean;
};

describe('electron/persistence/dataIntegrity', () => {
  it('matches renderer empty-overwrite rule (prev >= 1)', () => {
    expect(materialContentCount({ notes: [1, 2], todoItems: [1], items: [] })).toBe(3);
    expect(
      isCatastrophicEmptyOverwrite(
        { notes: [1, 2, 3], todoItems: [], items: [] },
        { notes: [], todoItems: [], items: [] },
      ),
    ).toBe(true);
    expect(
      isCatastrophicEmptyOverwrite(
        { notes: [1], todoItems: [], items: [] },
        { notes: [], todoItems: [], items: [] },
      ),
    ).toBe(true);
    expect(
      isCatastrophicEmptyOverwrite(
        { notes: [], todoItems: [], items: [] },
        { notes: [], todoItems: [], items: [] },
      ),
    ).toBe(false);
  });

  it('contentShapeShrank flags any per-collection loss', () => {
    const base = { notes: [1, 2, 3], todoItems: [1, 2], items: [1] };

    expect(contentShapeShrank(base, base)).toBe(false);
    expect(contentShapeShrank(base, { ...base, notes: [1, 2, 3, 4] })).toBe(false);
    expect(contentShapeShrank(base, { ...base, notes: [1, 2] })).toBe(true);
    expect(contentShapeShrank(base, { ...base, todoItems: [1] })).toBe(true);
    expect(contentShapeShrank(base, { ...base, items: [] })).toBe(true);
  });

  it('contentShapeShrank treats an unknown previous workspace as a loss', () => {
    expect(contentShapeShrank(null, { notes: [1] })).toBe(true);
    expect(contentShapeShrank(undefined, { notes: [1] })).toBe(true);
  });

  it('collectionCounts enumerates every array-valued field', () => {
    expect(
      collectionCounts({
        notes: [1],
        teams: [1, 2],
        people: [],
        version: 3,
        profile: { name: 'x' },
      }),
    ).toEqual({ notes: 1, teams: 2, people: 0 });
    expect(collectionCounts(null)).toEqual({});
  });

  it('contentShapeShrank covers collections beyond the sharded three', () => {
    const base = {
      notes: [1],
      teams: [1, 2],
      people: [1, 2, 3],
      noteGroups: [1],
      utilitySketchDocuments: [1, 2],
      noteTodoLinks: [1],
    };

    expect(contentShapeShrank(base, base)).toBe(false);
    expect(contentShapeShrank(base, { ...base, teams: [1] })).toBe(true);
    expect(contentShapeShrank(base, { ...base, people: [] })).toBe(true);
    expect(contentShapeShrank(base, { ...base, noteGroups: [] })).toBe(true);
    expect(contentShapeShrank(base, { ...base, utilitySketchDocuments: [1] })).toBe(true);
    expect(contentShapeShrank(base, { ...base, noteTodoLinks: [] })).toBe(true);
  });

  it('contentShapeShrank flags a collection that disappears entirely', () => {
    const base = { notes: [1], teams: [1, 2] };
    const { teams: _dropped, ...withoutTeams } = base;

    expect(contentShapeShrank(base, withoutTeams)).toBe(true);
    expect(contentShapeShrank(base, { ...base, teams: undefined })).toBe(true);
    // A collection that did not exist before cannot shrink.
    expect(contentShapeShrank(withoutTeams, base)).toBe(false);
  });
});
