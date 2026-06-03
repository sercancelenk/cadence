import { describe, expect, it } from 'vitest';
import { DATA_VERSION, normalizeData } from './index';
import {
  UnsupportedDataVersionError,
  isUnsupportedDataVersionError,
} from './unsupportedDataVersion';

describe('UnsupportedDataVersionError', () => {
  it('carries file and app versions', () => {
    const err = new UnsupportedDataVersionError(9, 3);
    expect(err.fileVersion).toBe(9);
    expect(err.appVersion).toBe(3);
    expect(err.message).toContain('version 9');
    expect(isUnsupportedDataVersionError(err)).toBe(true);
  });

  it('normalizeData throws for files newer than DATA_VERSION', () => {
    expect(() =>
      normalizeData({
        version: DATA_VERSION + 1,
        teams: [],
        people: [],
        items: [],
        todoGroups: [],
        todoItems: [],
      }),
    ).toThrow(UnsupportedDataVersionError);
  });
});
