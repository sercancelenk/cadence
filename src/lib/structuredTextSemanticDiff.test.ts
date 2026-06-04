import { describe, expect, it } from 'vitest';
import {
  computeStructuredSemanticDiff,
  detectArrayStableIdKey,
  arrayObjectsEqualById,
  isUniquePrimitiveIdKey,
  flattenStructuredPaths,
  formatStructuredValue,
  getImmediateChildKey,
  pairSemanticRenames,
  pairSubtreeRenames,
  parseStructuredDocumentValue,
  semanticDiffCounts,
  semanticPathDisplayName,
  semanticPathParent,
  semanticPathToSearchHints,
  semanticPathSearchHint,
} from './structuredTextSemanticDiff';

describe('flattenStructuredPaths', () => {
  it('flattens nested objects to dotted paths', () => {
    const paths = flattenStructuredPaths({ name: 'cadence', meta: { version: 2 } });
    expect(paths.get('$.name')).toBe('cadence');
    expect(paths.get('$.meta.version')).toBe(2);
  });

  it('flattens array indices', () => {
    const paths = flattenStructuredPaths({ items: ['a', 'b'] });
    expect(paths.get('$.items[0]')).toBe('a');
    expect(paths.get('$.items[1]')).toBe('b');
  });

  it('records empty objects and arrays at their path', () => {
    expect(flattenStructuredPaths({ empty: {} }).get('$.empty')).toEqual({});
    expect(flattenStructuredPaths({ list: [] }).get('$.list')).toEqual([]);
  });

  it('stores leaf primitives under their prefix', () => {
    expect(flattenStructuredPaths(42).get('$')).toBe(42);
    expect(flattenStructuredPaths(null).get('$')).toBe(null);
  });
});

describe('computeStructuredSemanticDiff', () => {
  it('detects added, removed, and changed paths', () => {
    const a = '{\n  "name": "cadence",\n  "count": 1\n}\n';
    const b = '{\n  "name": "cadence",\n  "count": 2,\n  "active": true\n}\n';
    const diff = computeStructuredSemanticDiff(a, b, 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.removed).toEqual([]);
    expect(diff.added.map((x) => x.path)).toEqual(['$.active']);
    expect(diff.changed.map((x) => x.path)).toEqual(['$.count']);
    expect(diff.changed[0]?.before).toBe(1);
    expect(diff.changed[0]?.after).toBe(2);
  });

  it('reports removed keys', () => {
    const a = '{\n  "keep": 1,\n  "drop": 2\n}\n';
    const b = '{\n  "keep": 1\n}\n';
    const diff = computeStructuredSemanticDiff(a, b, 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.removed.map((x) => x.path)).toEqual(['$.drop']);
    expect(diff.added).toEqual([]);
  });

  it('works for YAML documents', () => {
    const a = 'name: cadence\nversion: 1\n';
    const b = 'name: cadence\nversion: 2\n';
    const diff = computeStructuredSemanticDiff(a, b, 'yaml');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    expect(diff.changed.map((x) => x.path)).toEqual(['$.version']);
  });

  it('returns error for invalid JSON', () => {
    const diff = computeStructuredSemanticDiff('{', '{\n}\n', 'json');
    expect(diff.ok).toBe(false);
  });

  it('returns error when side B fails to parse', () => {
    const diff = computeStructuredSemanticDiff('{\n}\n', '{', 'json');
    expect(diff.ok).toBe(false);
  });

  it('pairs removed and added keys with the same value as a rename', () => {
    const a = '{\n  "soyad2": "Yılmaz",\n  "count": 1\n}\n';
    const b = '{\n  "soyad": "Yılmaz",\n  "count": 2\n}\n';
    const diff = computeStructuredSemanticDiff(a, b, 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.renamed).toEqual([
      {
        fromPath: '$.soyad2',
        toPath: '$.soyad',
        value: 'Yılmaz',
      },
    ]);
    expect(diff.removed).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.changed.map((x) => x.path)).toEqual(['$.count']);
  });

  it('does not pair ambiguous key renames when multiple candidates share a value', () => {
    const a = '{\n  "old1": "x",\n  "old2": "x"\n}\n';
    const b = '{\n  "new1": "x",\n  "new2": "x"\n}\n';
    const diff = computeStructuredSemanticDiff(a, b, 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.renamed).toEqual([]);
    expect(diff.removed).toHaveLength(2);
    expect(diff.added).toHaveLength(2);
  });

  it('collapses primitive list reordering into a single list-order row', () => {
    const a = '{\n  "tags": ["a", "b", "c"]\n}\n';
    const b = '{\n  "tags": ["c", "a", "b"]\n}\n';
    const diff = computeStructuredSemanticDiff(a, b, 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.reordered).toEqual([
      {
        path: '$.tags',
        before: ['a', 'b', 'c'],
        after: ['c', 'a', 'b'],
      },
    ]);
    expect(diff.changed).toEqual([]);
  });

  it('collapses object list reordering when items share a unique id', () => {
    const a = {
      users: [
        { id: 1, name: 'Ada' },
        { id: 2, name: 'Bob' },
      ],
    };
    const b = {
      users: [
        { id: 2, name: 'Bob' },
        { id: 1, name: 'Ada' },
      ],
    };
    const diff = computeStructuredSemanticDiff(JSON.stringify(a), JSON.stringify(b), 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.reordered).toEqual([
      {
        path: '$.users',
        before: a.users,
        after: b.users,
      },
    ]);
    expect(diff.changed).toEqual([]);
  });

  it('keeps per-index object changes when an item value actually changes', () => {
    const a = { users: [{ id: 1, name: 'Ada' }] };
    const b = { users: [{ id: 1, name: 'Amy' }] };
    const diff = computeStructuredSemanticDiff(JSON.stringify(a), JSON.stringify(b), 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.reordered).toEqual([]);
    expect(diff.changed.map((item) => item.path)).toEqual(['$.users[0].name']);
  });

  it('does not collapse object list reorder when multiple unique id keys exist', () => {
    const a = {
      items: [
        { sku: 'a', ref: 1 },
        { sku: 'b', ref: 2 },
      ],
    };
    const b = {
      items: [
        { sku: 'b', ref: 2 },
        { sku: 'a', ref: 1 },
      ],
    };
    const diff = computeStructuredSemanticDiff(JSON.stringify(a), JSON.stringify(b), 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.reordered).toEqual([]);
    expect(diff.changed.length).toBeGreaterThan(0);
  });

  it('pairs renamed nested object keys as a single rename', () => {
    const a = {
      ad: 'Ahmet',
      adres2: { ilce: 'Maltepe', postaKodu: '34710', sehir: 'İstanbul' },
      aktifMi: true,
    };
    const b = {
      ad: 'Ahmet',
      adres: { ilce: 'Maltepe', postaKodu: '34710', sehir: 'İstanbul' },
      aktifMi: true,
    };
    const diff = computeStructuredSemanticDiff(JSON.stringify(a), JSON.stringify(b), 'json');
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;

    expect(diff.renamed).toContainEqual({
      fromPath: '$.adres2',
      toPath: '$.adres',
      value: a.adres2,
    });
    expect(diff.removed.some((item) => item.path.startsWith('$.adres2'))).toBe(false);
    expect(diff.added.some((item) => item.path.startsWith('$.adres'))).toBe(false);
  });
});

describe('detectArrayStableIdKey', () => {
  it('prefers id when values are unique', () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(detectArrayStableIdKey(items)).toBe('id');
  });

  it('returns null when multiple unique key candidates exist', () => {
    const items = [
      { sku: 'a', ref: 1 },
      { sku: 'b', ref: 2 },
    ];
    expect(detectArrayStableIdKey(items)).toBeNull();
  });
});

describe('arrayObjectsEqualById', () => {
  it('matches objects regardless of array order', () => {
    const a = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bob' }];
    const b = [{ id: 2, name: 'Bob' }, { id: 1, name: 'Ada' }];
    expect(arrayObjectsEqualById(a, b, 'id')).toBe(true);
    expect(isUniquePrimitiveIdKey(a, 'id')).toBe(true);
  });
});

describe('formatStructuredValue', () => {
  it('formats strings and structured values for display', () => {
    expect(formatStructuredValue(undefined)).toBe('—');
    expect(formatStructuredValue('cadence')).toBe('"cadence"');
    expect(formatStructuredValue({ a: 1 })).toBe('{"a":1}');
  });
});

describe('semanticDiffCounts', () => {
  it('aggregates added, removed, renamed, reordered, and changed totals', () => {
    const diff = computeStructuredSemanticDiff(
      '{"a":1,"drop":2}',
      '{"a":2,"add":3}',
      'json',
    );
    expect(diff.ok).toBe(true);
    if (!diff.ok) return;
    const counts = semanticDiffCounts(diff);
    expect(counts.keys).toBe(counts.added + counts.removed + counts.renamed);
    expect(counts.values).toBe(counts.changed + counts.reordered);
    expect(counts.total).toBe(counts.added + counts.removed + counts.changed + counts.renamed + counts.reordered);
  });
});

describe('pairSubtreeRenames', () => {
  it('pairs sibling object keys when entire subtrees match', () => {
    const removed = [
      { path: '$.adres2.ilce', before: 'Maltepe' },
      { path: '$.adres2.sehir', before: 'İstanbul' },
    ];
    const added = [
      { path: '$.adres.ilce', after: 'Maltepe' },
      { path: '$.adres.sehir', after: 'İstanbul' },
    ];
    const rootA = { adres2: { ilce: 'Maltepe', sehir: 'İstanbul' } };
    const rootB = { adres: { ilce: 'Maltepe', sehir: 'İstanbul' } };
    const paired = pairSubtreeRenames(removed, added, [], rootA, rootB);
    expect(paired.renamed).toEqual([
      {
        fromPath: '$.adres2',
        toPath: '$.adres',
        value: rootA.adres2,
      },
    ]);
    expect(paired.removed).toEqual([]);
    expect(paired.added).toEqual([]);
  });
});

describe('getImmediateChildKey', () => {
  it('returns the first segment under a parent path', () => {
    expect(getImmediateChildKey('$.adres2.ilce', '$')).toBe('adres2');
    expect(getImmediateChildKey('$.adres.ilce', '$')).toBe('adres');
    expect(getImmediateChildKey('$.meta.version', '$.meta')).toBe('version');
  });
});

describe('pairSemanticRenames', () => {
  it('requires a unique 1:1 value match under the same parent', () => {
    const removed = [{ path: '$.soyad2', before: 'Yılmaz' }];
    const added = [{ path: '$.soyad', after: 'Yılmaz' }];
    const paired = pairSemanticRenames(removed, added);
    expect(paired.renamed).toHaveLength(1);
    expect(paired.removed).toEqual([]);
    expect(paired.added).toEqual([]);
  });

  it('leaves ambiguous matches in added and removed when values collide', () => {
    const removed = [
      { path: '$.old1', before: 'x' },
      { path: '$.old2', before: 'x' },
    ];
    const added = [
      { path: '$.new1', after: 'x' },
      { path: '$.new2', after: 'x' },
    ];
    const paired = pairSemanticRenames(removed, added);
    expect(paired.renamed).toEqual([]);
    expect(paired.removed).toHaveLength(2);
    expect(paired.added).toHaveLength(2);
  });
});

describe('semanticPathParent', () => {
  it('returns the parent path for sibling fields', () => {
    expect(semanticPathParent('$.meta.version')).toBe('$.meta');
    expect(semanticPathParent('$.soyad2')).toBe('$');
  });
});

describe('semanticPathToSearchHints', () => {
  it('returns ordered segments for nested paths', () => {
    expect(semanticPathToSearchHints('$.adres2.ilce')).toEqual(['"adres2"', '"ilce"']);
    expect(semanticPathToSearchHints('$.items[0]')).toEqual(['"items"', '[0]']);
  });
});

describe('semanticPathSearchHint', () => {
  it('returns quoted key for object paths', () => {
    expect(semanticPathSearchHint('$.meta.version')).toBe('"version"');
  });

  it('returns array index for array paths', () => {
    expect(semanticPathSearchHint('$.items[2]')).toBe('[2]');
  });

  it('returns raw segment when key is not a simple identifier', () => {
    expect(semanticPathSearchHint('$.["weird-key"]')).toBe('"weird-key"');
    expect(semanticPathSearchHint('$')).toBe('$');
  });
});

describe('semanticPathDisplayName', () => {
  it('shows the last key segment for object paths', () => {
    expect(semanticPathDisplayName('$.meta.version')).toBe('version');
    expect(semanticPathDisplayName('$.soyad')).toBe('soyad');
  });

  it('includes array index in the label', () => {
    expect(semanticPathDisplayName('$.items[2]')).toBe('items[2]');
    expect(semanticPathDisplayName('$[0]')).toBe('[0]');
  });
});

describe('parseStructuredDocumentValue', () => {
  it('treats empty text as empty object', () => {
    expect(parseStructuredDocumentValue('  ', 'json')).toEqual({ ok: true, value: {} });
  });
});
