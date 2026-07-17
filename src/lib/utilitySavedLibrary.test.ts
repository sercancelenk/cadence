import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  defaultUtilityLibraryOpen,
  filterUtilityLibraryDocs,
  parseUtilityLibrarySort,
  prepareUtilityLibraryDocs,
  readUtilityLibraryOpen,
  sortUtilityLibraryDocs,
  utilityLibraryOpenStorageKey,
  writeUtilityLibraryOpen,
} from './utilitySavedLibrary';

const docs = [
  { id: 'a', title: 'Zebra board', updatedAt: '2026-07-01T10:00:00.000Z' },
  { id: 'b', title: 'Alpha schema', updatedAt: '2026-07-10T10:00:00.000Z' },
  { id: 'c', title: 'Middle', updatedAt: '2026-07-05T10:00:00.000Z' },
];

describe('utilitySavedLibrary', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('defaults open when empty, collapsed when docs exist', () => {
    expect(defaultUtilityLibraryOpen(0)).toBe(true);
    expect(defaultUtilityLibraryOpen(3)).toBe(false);
  });

  it('persists open state per library id', () => {
    expect(utilityLibraryOpenStorageKey('erd')).toBe('cadence.utilityLibrary.open.erd');
    writeUtilityLibraryOpen('erd', true);
    expect(readUtilityLibraryOpen('erd', 5)).toBe(true);
    writeUtilityLibraryOpen('erd', false);
    expect(readUtilityLibraryOpen('erd', 0)).toBe(false);
  });

  it('falls back to default when storage is empty', () => {
    expect(readUtilityLibraryOpen('sketch', 0)).toBe(true);
    expect(readUtilityLibraryOpen('sketch', 2)).toBe(false);
  });

  it('ignores invalid stored open flags', () => {
    localStorage.setItem(utilityLibraryOpenStorageKey('erd'), 'yes');
    expect(readUtilityLibraryOpen('erd', 0)).toBe(true);
    expect(readUtilityLibraryOpen('erd', 2)).toBe(false);
  });

  it('parses sort values with a safe fallback', () => {
    expect(parseUtilityLibrarySort('title')).toBe('title');
    expect(parseUtilityLibrarySort('updated')).toBe('updated');
    expect(parseUtilityLibrarySort('nope')).toBe('updated');
  });

  it('filters by title (case-insensitive)', () => {
    expect(filterUtilityLibraryDocs(docs, 'alpha').map((d) => d.id)).toEqual(['b']);
    expect(filterUtilityLibraryDocs(docs, '  ').map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by updated or title', () => {
    expect(sortUtilityLibraryDocs(docs, 'updated').map((d) => d.id)).toEqual(['b', 'c', 'a']);
    expect(sortUtilityLibraryDocs(docs, 'title').map((d) => d.id)).toEqual(['b', 'c', 'a']);
  });

  it('prepare combines filter + sort', () => {
    expect(prepareUtilityLibraryDocs(docs, 'a', 'title').map((d) => d.id)).toEqual(['b', 'a']);
  });
});
