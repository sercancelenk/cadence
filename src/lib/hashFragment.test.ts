import { describe, expect, it } from 'vitest';
import { hashFragment } from './hashFragment';

describe('hashFragment', () => {
  it.each([
    ['#ai', 'ai'],
    ['ai', 'ai'],
    ['#/settings#ai', 'ai'],
    ['#/settings?tab=x#ai', 'ai'],
    ['#/settings', ''],
    ['#/settings#', ''],
    ['', ''],
    ['#', ''],
  ])('%j -> %j', (hash, expected) => {
    expect(hashFragment(hash)).toBe(expected);
  });
});
