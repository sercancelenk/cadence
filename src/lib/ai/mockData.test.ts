import { describe, expect, it } from 'vitest';
import { parseSampleRecords, validateMockRecords } from './mockData';

describe('parseSampleRecords', () => {
  it('accepts one object or a list of objects', () => {
    expect(parseSampleRecords('{"a":1}')).toEqual({ ok: true, records: [{ a: 1 }] });
    expect(parseSampleRecords('[{"a":1},{"a":2}]')).toEqual({ ok: true, records: [{ a: 1 }, { a: 2 }] });
  });

  it.each([
    ['not JSON', '{oops'],
    ['empty', '   '],
    ['a number', '5'],
    ['a list of numbers', '[1,2]'],
    ['an empty list', '[]'],
    ['an empty object', '{}'],
    ['too large', JSON.stringify({ blob: 'x'.repeat(9000) })],
  ])('rejects %s with a reason', (_n, text) => {
    const r = parseSampleRecords(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(0);
  });

  it('uses at most the first five records as the example', () => {
    const r = parseSampleRecords(JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ i }))));
    expect(r.ok && r.records).toHaveLength(5);
  });
});

describe('validateMockRecords', () => {
  const sample = [{ id: 1, name: 'Ana', active: true, tags: ['a'], address: { city: 'Izmir', zip: null }, nick: 'x' }, { id: 2, name: 'Bo', active: false, tags: [], address: { city: 'Ankara', zip: '06' } }];

  it('keeps records with the same keys and value types, and counts what it dropped', () => {
    const good = { id: 10, name: 'Cem', active: true, tags: ['q', 'r'], address: { city: 'Bursa', zip: '16' }, nick: 'c' };
    const r = validateMockRecords(sample, [
      good,
      { ...good, id: '10' }, // wrong type
      { id: 11, name: 'D', active: true, tags: [], address: { city: 'X', zip: null } }, // optional "nick" absent is fine
      { ...good, extra: 1 }, // extra key
      { id: 12, name: 'E', active: true, tags: [] }, // missing address
      'junk',
      null,
    ]);
    expect(r.records).toHaveLength(2);
    expect(r.records[0]).toEqual(good);
    expect(r.dropped).toBe(5);
  });

  it('a null in the sample allows null or a value of any simple type', () => {
    const r = validateMockRecords([{ zip: null }], [{ zip: null }, { zip: '06' }, { zip: 6 }, { zip: { a: 1 } }]);
    expect(r.records).toHaveLength(3);
    expect(r.dropped).toBe(1);
  });

  it('nested objects must match too', () => {
    const r = validateMockRecords([{ a: { b: 1 } }], [{ a: { b: 2 } }, { a: { b: 'x' } }, { a: { c: 1 } }, { a: 5 }]);
    expect(r.records).toEqual([{ a: { b: 2 } }]);
  });

  it('caps the result at 50 records and returns none for an empty list', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ a: i }));
    expect(validateMockRecords([{ a: 1 }], many).records).toHaveLength(50);
    expect(validateMockRecords([{ a: 1 }], []).records).toEqual([]);
  });
});

describe('validateMockRecords with field names that exist on every object', () => {
  it('treats a field named toString or constructor as optional when only some sample records own it', () => {
    const sample: Record<string, unknown>[] = [{ id: 1, toString: 'x', constructor: 'y' }, { id: 2 }];
    const out = validateMockRecords(sample, [{ id: 3 }, { id: 4, toString: 'z' }]);
    expect(out.dropped).toBe(0);
    expect(out.records).toHaveLength(2);
  });
});
