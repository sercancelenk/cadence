import { describe, it, expect } from 'vitest';
import {
  isCatastrophicEmptyOverwrite,
  isSuspiciousShrink,
  materialContentCount,
  shouldBlockPersistOnSuspiciousShrink,
} from './dataIntegrity';
import type { DataShape } from '../core/model';

function shape(over: Partial<DataShape> = {}): DataShape {
  return {
    teams: 1,
    people: 0,
    items: 0,
    todoGroups: 1,
    todoItems: 0,
    notes: 0,
    total: 0,
    ...over,
  };
}

describe('dataIntegrity', () => {
  it('materialContentCount sums notes + todos + items', () => {
    expect(materialContentCount({ notes: [1, 2], todoItems: [1], items: [] })).toBe(3);
    expect(materialContentCount(null)).toBe(0);
  });

  it('isSuspiciousShrink ignores tiny non-empty drops', () => {
    expect(
      isSuspiciousShrink(shape({ total: 10, notes: 4, todoItems: 4 }), shape({ total: 12, notes: 5, todoItems: 5 })),
    ).toBe(false);
  });

  it('isSuspiciousShrink ignores previous marker with no content', () => {
    expect(isSuspiciousShrink(shape({ total: 0 }), shape({ total: 0 }))).toBe(false);
  });

  it('isSuspiciousShrink fires on any populated → empty wipe', () => {
    expect(
      isSuspiciousShrink(shape({ total: 0 }), shape({ total: 1, notes: 1 })),
    ).toBe(true);
    expect(
      isSuspiciousShrink(shape({ total: 0 }), shape({ total: 2, notes: 1, todoItems: 1 })),
    ).toBe(true);
    expect(
      isSuspiciousShrink(shape({ total: 0 }), shape({ total: 20, notes: 10, todoItems: 8 })),
    ).toBe(true);
  });

  it('isSuspiciousShrink fires when nearly emptied or half wiped', () => {
    expect(
      isSuspiciousShrink(shape({ total: 1, notes: 1 }), shape({ total: 10, notes: 5, todoItems: 5 })),
    ).toBe(true);
    expect(
      isSuspiciousShrink(shape({ total: 5 }), shape({ total: 20, notes: 10, todoItems: 8 })),
    ).toBe(true);
    // Large absolute drop but under 50% relative — not suspicious.
    expect(
      isSuspiciousShrink(shape({ total: 12 }), shape({ total: 20 })),
    ).toBe(false);
  });

  it('materialContentCount treats missing arrays as zero', () => {
    expect(materialContentCount({})).toBe(0);
    expect(materialContentCount({ notes: undefined, todoItems: [1], items: undefined })).toBe(1);
  });

  it('shouldBlockPersistOnSuspiciousShrink needs a previous marker', () => {
    expect(shouldBlockPersistOnSuspiciousShrink(shape({ total: 0 }), null)).toBe(false);
    expect(
      shouldBlockPersistOnSuspiciousShrink(shape({ total: 0 }), shape({ total: 12 })),
    ).toBe(true);
  });

  it('isCatastrophicEmptyOverwrite when any content → empty', () => {
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
        { notes: [], todoItems: [1], items: [] },
        { notes: [], todoItems: [], items: [] },
      ),
    ).toBe(true);
    expect(
      isCatastrophicEmptyOverwrite(
        { notes: [1, 2, 3], todoItems: [], items: [] },
        { notes: [1], todoItems: [], items: [] },
      ),
    ).toBe(false);
    expect(
      isCatastrophicEmptyOverwrite(
        { notes: [], todoItems: [], items: [] },
        { notes: [], todoItems: [], items: [] },
      ),
    ).toBe(false);
  });

  describe('notes wiped while other content survives', () => {
    it('is suspicious when every note is gone even though the overall drop is small', () => {
      const previous = shape({ notes: 5, todoItems: 20, total: 25 });
      const current = shape({ notes: 0, todoItems: 20, total: 20 });
      expect(isSuspiciousShrink(current, previous)).toBe(true);
      expect(shouldBlockPersistOnSuspiciousShrink(current, previous)).toBe(true);
    });

    it('is suspicious for a single note that disappears', () => {
      expect(
        isSuspiciousShrink(shape({ notes: 0, todoItems: 30, total: 30 }), shape({ notes: 1, todoItems: 30, total: 31 })),
      ).toBe(true);
    });

    it('is not suspicious when some notes remain', () => {
      expect(
        isSuspiciousShrink(shape({ notes: 4, todoItems: 20, total: 24 }), shape({ notes: 5, todoItems: 20, total: 25 })),
      ).toBe(false);
    });

    it('is not suspicious when there were no notes to lose', () => {
      expect(
        isSuspiciousShrink(shape({ notes: 0, todoItems: 18, total: 18 }), shape({ notes: 0, todoItems: 20, total: 20 })),
      ).toBe(false);
    });
  });
});
