import { describe, expect, it } from 'vitest';
import { hashHue, priorityShort, ringStyle, sortGroups, tagColor } from './todoUiUtils';
import type { TodoGroup } from '../../model';

describe('hashHue', () => {
  it('returns a stable hue in 0–359', () => {
    expect(hashHue('group-a')).toBe(hashHue('group-a'));
    expect(hashHue('group-a')).toBeGreaterThanOrEqual(0);
    expect(hashHue('group-a')).toBeLessThan(360);
  });

  it('differs for different seeds', () => {
    expect(hashHue('a')).not.toBe(hashHue('b'));
  });
});

describe('tagColor and ringStyle', () => {
  it('builds hsl color from group id', () => {
    const hue = hashHue('g1');
    expect(tagColor('g1')).toBe(`hsl(${hue} 58% 40%)`);
    expect(ringStyle('g1')).toEqual({ '--todo-ring': `hsl(${hue} 62% 46%)` });
  });
});

describe('priorityShort', () => {
  it('maps known priorities', () => {
    expect(priorityShort('urgent')).toBe('U');
    expect(priorityShort('high')).toBe('H');
    expect(priorityShort('normal')).toBe('N');
    expect(priorityShort('low')).toBe('L');
  });
});

describe('sortGroups', () => {
  function group(
    id: string,
    opts: Partial<Pick<TodoGroup, 'pinned' | 'archived' | 'sortOrder'>> = {},
  ): TodoGroup {
    return {
      id,
      name: id,
      sortOrder: opts.sortOrder ?? 0,
      pinned: opts.pinned,
      archived: opts.archived,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
  }

  it('orders pinned before unpinned, archived last', () => {
    const sorted = sortGroups([
      group('archived', { archived: true, sortOrder: 0 }),
      group('normal', { sortOrder: 2 }),
      group('pinned', { pinned: true, sortOrder: 1 }),
    ]);
    expect(sorted.map((g) => g.id)).toEqual(['pinned', 'normal', 'archived']);
  });

  it('sorts by sortOrder within the same tier', () => {
    const sorted = sortGroups([group('b', { sortOrder: 2 }), group('a', { sortOrder: 1 })]);
    expect(sorted.map((g) => g.id)).toEqual(['a', 'b']);
  });
});
