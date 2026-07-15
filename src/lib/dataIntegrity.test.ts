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
});
