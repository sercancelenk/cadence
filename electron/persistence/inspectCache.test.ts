import { describe, expect, it } from 'vitest';

const { createInspectCache } = require('./inspectCache.cjs') as {
  createInspectCache: (max?: number) => {
    get: (file: string, stat: { size: number; mtimeMs: number }) => unknown;
    set: (file: string, stat: { size: number; mtimeMs: number }, info: { decryptable: boolean; counts: unknown }) => void;
  };
};

const stat = { size: 100, mtimeMs: 5 };
const good = { decryptable: true, counts: { notes: 3 } };

describe('inspect cache', () => {
  it('returns what was stored for the same file, size and time', () => {
    const c = createInspectCache();
    c.set('/a.json', stat, good);
    expect(c.get('/a.json', stat)).toEqual(good);
  });

  it('forgets a file that changed on disk', () => {
    const c = createInspectCache();
    c.set('/a.json', stat, good);
    expect(c.get('/a.json', { size: 101, mtimeMs: 5 })).toBeUndefined();
    expect(c.get('/a.json', { size: 100, mtimeMs: 6 })).toBeUndefined();
  });

  it('never keeps a file that could not be read, so a later sign-in can read it', () => {
    const c = createInspectCache();
    c.set('/a.json', stat, { decryptable: false, counts: null });
    expect(c.get('/a.json', stat)).toBeUndefined();
  });

  it('keeps at most the newest entries', () => {
    const c = createInspectCache(2);
    c.set('/1', stat, good);
    c.set('/2', stat, good);
    c.set('/3', stat, good);
    expect(c.get('/1', stat)).toBeUndefined();
    expect(c.get('/3', stat)).toEqual(good);
  });
});
