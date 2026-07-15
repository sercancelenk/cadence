import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  materialContentCount,
  isCatastrophicEmptyOverwrite,
} = require('./dataIntegrity.cjs') as {
  materialContentCount: (d: unknown) => number;
  isCatastrophicEmptyOverwrite: (prev: unknown, next: unknown) => boolean;
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
});
