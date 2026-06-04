/**
 * Semantic JSON / YAML diff — compare by dotted paths (keys) and leaf values.
 * Pure helpers; no CodeMirror dependency.
 */

import {
  parseStructuredDocumentValue,
  type StructuredTextLanguage,
} from './structuredText';

export type StructuredSemanticPathChange = {
  path: string;
  before?: unknown;
  after?: unknown;
};

export type StructuredSemanticRename = {
  fromPath: string;
  toPath: string;
  value: unknown;
};

export type StructuredSemanticOrderChange = {
  path: string;
  before: unknown[];
  after: unknown[];
};

export type StructuredSemanticDiff = {
  ok: true;
  /** Paths present on B but not A. */
  added: StructuredSemanticPathChange[];
  /** Paths present on A but not B. */
  removed: StructuredSemanticPathChange[];
  /** Same path, different leaf value. */
  changed: StructuredSemanticPathChange[];
  /** Same parent + value, different field name — likely a rename. */
  renamed: StructuredSemanticRename[];
  /** Same array elements, different order — index-only diffs collapsed. */
  reordered: StructuredSemanticOrderChange[];
};

export type StructuredSemanticDiffResult =
  | StructuredSemanticDiff
  | { ok: false; error: string };

export { parseStructuredDocumentValue };

/** Collect leaf paths → value (objects/arrays become intermediate path segments). */
export function flattenStructuredPaths(
  value: unknown,
  prefix = '$',
  out = new Map<string, unknown>(),
): Map<string, unknown> {
  if (value === null || typeof value !== 'object') {
    out.set(prefix, value);
    return out;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      out.set(prefix, []);
      return out;
    }
    value.forEach((item, index) => {
      flattenStructuredPaths(item, `${prefix}[${index}]`, out);
    });
    return out;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    out.set(prefix, {});
    return out;
  }

  for (const [key, child] of entries) {
    flattenStructuredPaths(child, `${prefix}.${key}`, out);
  }
  return out;
}

function stableStringify(value: unknown): string {
  return JSON.stringify(value);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Parent path segment shared by sibling fields (`$.a.b` → `$.a`). */
export function semanticPathParent(path: string): string {
  const arrayMatch = path.match(/^(.*)\[\d+\]$/);
  if (arrayMatch) return arrayMatch[1] || '$';
  const dot = path.lastIndexOf('.');
  if (dot <= 0) return '$';
  return path.slice(0, dot);
}

/** Pair removed+added keys with identical values under the same parent (1:1 only). */
export function pairSemanticRenames(
  removed: StructuredSemanticPathChange[],
  added: StructuredSemanticPathChange[],
): {
  renamed: StructuredSemanticRename[];
  removed: StructuredSemanticPathChange[];
  added: StructuredSemanticPathChange[];
} {
  const renamed: StructuredSemanticRename[] = [];
  const usedRemoved = new Set<number>();
  const usedAdded = new Set<number>();

  for (let ri = 0; ri < removed.length; ri++) {
    const removedItem = removed[ri]!;
    const candidates = added
      .map((addedItem, ai) => ({ addedItem, ai }))
      .filter(
        ({ addedItem, ai }) =>
          !usedAdded.has(ai) &&
          semanticPathParent(removedItem.path) === semanticPathParent(addedItem.path) &&
          valuesEqual(removedItem.before, addedItem.after),
      );
    if (candidates.length !== 1) continue;
    const { addedItem, ai } = candidates[0]!;
    renamed.push({
      fromPath: removedItem.path,
      toPath: addedItem.path,
      value: removedItem.before,
    });
    usedRemoved.add(ri);
    usedAdded.add(ai);
  }

  renamed.sort((a, b) => a.fromPath.localeCompare(b.fromPath));

  return {
    renamed,
    removed: removed.filter((_, index) => !usedRemoved.has(index)),
    added: added.filter((_, index) => !usedAdded.has(index)),
  };
}

function pathIsUnder(path: string, prefix: string): boolean {
  if (path === prefix) return true;
  return path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`);
}

function childPath(parent: string, childKey: string): string {
  if (childKey.startsWith('[')) return `${parent}${childKey}`;
  return parent === '$' ? `$.${childKey}` : `${parent}.${childKey}`;
}

/** First segment under `parent` (`$.a.b` under `$` → `a`; under `$.a` → `b`). */
export function getImmediateChildKey(path: string, parent: string): string | null {
  if (parent === '$') {
    if (path.startsWith('$.')) {
      const match = path.slice(2).match(/^([^.\[]+|\[\d+\])/);
      return match?.[1] ?? null;
    }
    if (path.startsWith('$[')) {
      const match = path.match(/^\$(\[\d+\])/);
      return match?.[1] ?? null;
    }
    return null;
  }
  const dotPrefix = `${parent}.`;
  const bracketPrefix = `${parent}[`;
  if (path.startsWith(dotPrefix)) {
    const match = path.slice(dotPrefix.length).match(/^([^.\[]+|\[\d+\])/);
    return match?.[1] ?? null;
  }
  if (path.startsWith(bracketPrefix)) {
    const match = path.slice(parent.length).match(/^(\[\d+\])/);
    return match?.[1] ?? null;
  }
  return null;
}

function collectImmediateChildKeys(
  items: StructuredSemanticPathChange[],
  parent: string,
): Set<string> {
  const keys = new Set<string>();
  for (const item of items) {
    const key = getImmediateChildKey(item.path, parent);
    if (key) keys.add(key);
  }
  return keys;
}

function parentPathDepth(path: string): number {
  return (path.match(/[.[]/g) ?? []).length;
}

function isExclusiveSubtreePrefix(
  prefix: string,
  present: StructuredSemanticPathChange[],
  absent: StructuredSemanticPathChange[],
  unchanged: StructuredSemanticPathChange[],
): boolean {
  if (!present.some((item) => pathIsUnder(item.path, prefix))) return false;
  if (absent.some((item) => pathIsUnder(item.path, prefix))) return false;
  if (unchanged.some((item) => pathIsUnder(item.path, prefix))) return false;
  return true;
}

/** Pair removed+added object/array subtrees with identical content (e.g. `adres2` → `adres`). */
export function pairSubtreeRenames(
  removed: StructuredSemanticPathChange[],
  added: StructuredSemanticPathChange[],
  changed: StructuredSemanticPathChange[],
  rootA: unknown,
  rootB: unknown,
): {
  renamed: StructuredSemanticRename[];
  removed: StructuredSemanticPathChange[];
  added: StructuredSemanticPathChange[];
} {
  const renamed: StructuredSemanticRename[] = [];
  const collapsedPrefixes: Array<{ from: string; to: string }> = [];

  const parents = new Set<string>(['$']);
  for (const item of [...removed, ...added]) {
    let parent = semanticPathParent(item.path);
    while (parent) {
      parents.add(parent);
      parent = parent === '$' ? '' : semanticPathParent(parent);
    }
  }

  const parentsByDepth = [...parents].sort(
    (a, b) => parentPathDepth(b) - parentPathDepth(a),
  );

  for (const parent of parentsByDepth) {
    const removedKeys = collectImmediateChildKeys(removed, parent);
    const addedKeys = collectImmediateChildKeys(added, parent);
    const usedAddedKeys = new Set<string>();

    for (const removedKey of removedKeys) {
      const fromPrefix = childPath(parent, removedKey);
      if (!isExclusiveSubtreePrefix(fromPrefix, removed, added, changed)) continue;

      const before = getStructuredValueAtPath(rootA, fromPrefix);
      const candidates = [...addedKeys]
        .filter((addedKey) => !usedAddedKeys.has(addedKey))
        .map((addedKey) => {
          const toPrefix = childPath(parent, addedKey);
          return { addedKey, toPrefix };
        })
        .filter(({ toPrefix }) =>
          isExclusiveSubtreePrefix(toPrefix, added, removed, changed),
        )
        .filter(({ toPrefix }) => valuesEqual(before, getStructuredValueAtPath(rootB, toPrefix)));

      if (candidates.length !== 1) continue;

      const { addedKey, toPrefix } = candidates[0]!;
      renamed.push({
        fromPath: fromPrefix,
        toPath: toPrefix,
        value: before,
      });
      usedAddedKeys.add(addedKey);
      collapsedPrefixes.push({ from: fromPrefix, to: toPrefix });
    }
  }

  renamed.sort((a, b) => a.fromPath.localeCompare(b.fromPath));

  const underCollapsed = (path: string) =>
    collapsedPrefixes.some(({ from, to }) => pathIsUnder(path, from) || pathIsUnder(path, to));

  return {
    renamed,
    removed: removed.filter((item) => !underCollapsed(item.path)),
    added: added.filter((item) => !underCollapsed(item.path)),
  };
}

/** Read a flattened path (`$.a[0].b`) from a parsed document root. */
export function getStructuredValueAtPath(root: unknown, path: string): unknown | undefined {
  if (path === '$') return root;
  const tail = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : null;
  if (tail === null || tail === '') return undefined;

  let current: unknown = root;
  const segments = tail.match(/[^.[\]]+|\[\d+\]/g);
  if (!segments) return undefined;

  for (const segment of segments) {
    if (segment.startsWith('[')) {
      const index = Number.parseInt(segment.slice(1, -1), 10);
      if (!Array.isArray(current) || index < 0 || index >= current.length) return undefined;
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function arrayMultisetEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const item of a) {
    const key = stableStringify(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const item of b) {
    const key = stableStringify(item);
    const next = (counts.get(key) ?? 0) - 1;
    if (next < 0) return false;
    if (next === 0) counts.delete(key);
    else counts.set(key, next);
  }
  return counts.size === 0;
}

const PREFERRED_ARRAY_ID_KEYS = ['id', 'uuid', 'key', '_id', 'slug', 'code'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitiveIdValue(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

/** True when every item has `key` with unique primitive values across the array. */
export function isUniquePrimitiveIdKey(items: unknown[], key: string): boolean {
  if (items.length === 0 || !items.every(isPlainObject)) return false;
  const values = items.map((item) => item[key]);
  if (!values.every(isPrimitiveIdValue)) return false;
  return new Set(values.map(stableStringify)).size === values.length;
}

/** Pick a stable object id field for array reorder detection (1:1 only). */
export function detectArrayStableIdKey(items: unknown[]): string | null {
  if (items.length === 0 || !items.every(isPlainObject)) return null;

  for (const candidate of PREFERRED_ARRAY_ID_KEYS) {
    if (isUniquePrimitiveIdKey(items, candidate)) return candidate;
  }

  const sharedKeys = Object.keys(items[0]!);
  const uniqueCandidates = sharedKeys.filter((key) => items.every((item) => key in item) && isUniquePrimitiveIdKey(items, key));
  return uniqueCandidates.length === 1 ? uniqueCandidates[0]! : null;
}

/** Compare object arrays by id key — every object must match exactly once. */
export function arrayObjectsEqualById(a: unknown[], b: unknown[], idKey: string): boolean {
  if (a.length !== b.length) return false;
  if (!a.every(isPlainObject) || !b.every(isPlainObject)) return false;

  const mapB = new Map<string, Record<string, unknown>>();
  for (const item of b) {
    mapB.set(stableStringify(item[idKey]), item);
  }

  for (const itemA of a) {
    const id = stableStringify(itemA[idKey]);
    const itemB = mapB.get(id);
    if (!itemB || !valuesEqual(itemA, itemB)) return false;
  }

  return true;
}

function arrayOrderChanged(a: unknown[], b: unknown[]): boolean {
  return stableStringify(a) !== stableStringify(b);
}

function isArrayIndexLeafPath(path: string, arrayPath: string): boolean {
  return new RegExp(`^${arrayPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[\\d+\\]$`).test(path);
}

function pathsUnderArrayPrefix(items: StructuredSemanticPathChange[], arrayPath: string): StructuredSemanticPathChange[] {
  const prefix = `${arrayPath}[`;
  return items.filter((item) => item.path.startsWith(prefix));
}

function hasArrayStructuralChange(
  arrayPath: string,
  added: StructuredSemanticPathChange[],
  removed: StructuredSemanticPathChange[],
): boolean {
  const prefix = `${arrayPath}[`;
  return (
    added.some((item) => item.path.startsWith(prefix)) ||
    removed.some((item) => item.path.startsWith(prefix))
  );
}

function tryCollapsePrimitiveArrayReorder(
  parent: string,
  changed: StructuredSemanticPathChange[],
  added: StructuredSemanticPathChange[],
  removed: StructuredSemanticPathChange[],
  rootA: unknown,
  rootB: unknown,
): StructuredSemanticOrderChange | null {
  const indexChanges = changed.filter((item) => isArrayIndexLeafPath(item.path, parent));
  if (indexChanges.length === 0) return null;
  if (indexChanges.length !== pathsUnderArrayPrefix(changed, parent).length) return null;
  if (hasArrayStructuralChange(parent, added, removed)) return null;

  const before = getStructuredValueAtPath(rootA, parent);
  const after = getStructuredValueAtPath(rootB, parent);
  if (!Array.isArray(before) || !Array.isArray(after)) return null;
  if (!arrayMultisetEqual(before, after)) return null;
  if (!arrayOrderChanged(before, after)) return null;

  return { path: parent, before, after };
}

function tryCollapseObjectArrayReorder(
  parent: string,
  changed: StructuredSemanticPathChange[],
  added: StructuredSemanticPathChange[],
  removed: StructuredSemanticPathChange[],
  rootA: unknown,
  rootB: unknown,
): StructuredSemanticOrderChange | null {
  if (pathsUnderArrayPrefix(changed, parent).length === 0) return null;
  if (hasArrayStructuralChange(parent, added, removed)) return null;

  const before = getStructuredValueAtPath(rootA, parent);
  const after = getStructuredValueAtPath(rootB, parent);
  if (!Array.isArray(before) || !Array.isArray(after)) return null;

  const idKeyA = detectArrayStableIdKey(before);
  const idKeyB = detectArrayStableIdKey(after);
  if (!idKeyA || idKeyA !== idKeyB) return null;
  if (!arrayObjectsEqualById(before, after, idKeyA)) return null;
  if (!arrayOrderChanged(before, after)) return null;

  return { path: parent, before, after };
}

function isPathUnderCollapsedArray(path: string, collapsedParents: Set<string>): boolean {
  for (const parent of collapsedParents) {
    if (pathIsUnder(path, parent) && path.startsWith(`${parent}[`)) return true;
  }
  return false;
}

/** Collapse index-only diffs when two arrays contain the same items in a different order. */
export function collapseArrayOrderOnlyChanges(
  changed: StructuredSemanticPathChange[],
  added: StructuredSemanticPathChange[],
  removed: StructuredSemanticPathChange[],
  rootA: unknown,
  rootB: unknown,
): {
  changed: StructuredSemanticPathChange[];
  reordered: StructuredSemanticOrderChange[];
} {
  const arrayParents = new Set<string>();
  for (const item of changed) {
    const match = item.path.match(/^(.*)\[\d+\]/);
    if (match) arrayParents.add(match[1] || '$');
  }

  const reordered: StructuredSemanticOrderChange[] = [];
  const collapsedParents = new Set<string>();

  for (const parent of arrayParents) {
    if (collapsedParents.has(parent)) continue;

    const collapsed =
      tryCollapsePrimitiveArrayReorder(parent, changed, added, removed, rootA, rootB) ??
      tryCollapseObjectArrayReorder(parent, changed, added, removed, rootA, rootB);

    if (!collapsed) continue;

    reordered.push(collapsed);
    collapsedParents.add(parent);
  }

  reordered.sort((a, b) => a.path.localeCompare(b.path));

  return {
    reordered,
    changed: changed.filter((item) => !isPathUnderCollapsedArray(item.path, collapsedParents)),
  };
}

export function computeStructuredSemanticDiff(
  textA: string,
  textB: string,
  language: StructuredTextLanguage,
): StructuredSemanticDiffResult {
  const parsedA = parseStructuredDocumentValue(textA, language);
  if (!parsedA.ok) return parsedA;
  const parsedB = parseStructuredDocumentValue(textB, language);
  if (!parsedB.ok) return parsedB;

  const pathsA = flattenStructuredPaths(parsedA.value);
  const pathsB = flattenStructuredPaths(parsedB.value);

  const added: StructuredSemanticPathChange[] = [];
  const removed: StructuredSemanticPathChange[] = [];
  const changed: StructuredSemanticPathChange[] = [];

  for (const [path, after] of pathsB) {
    if (!pathsA.has(path)) {
      added.push({ path, after });
    } else if (!valuesEqual(pathsA.get(path), after)) {
      changed.push({ path, before: pathsA.get(path), after });
    }
  }

  for (const [path, before] of pathsA) {
    if (!pathsB.has(path)) {
      removed.push({ path, before });
    }
  }

  const leafPaired = pairSemanticRenames(removed, added);
  const subtreePaired = pairSubtreeRenames(
    leafPaired.removed,
    leafPaired.added,
    changed,
    parsedA.value,
    parsedB.value,
  );

  const renamed = [...leafPaired.renamed, ...subtreePaired.renamed].sort((a, b) =>
    a.fromPath.localeCompare(b.fromPath),
  );

  const byPath = (a: StructuredSemanticPathChange, b: StructuredSemanticPathChange) =>
    a.path.localeCompare(b.path);

  subtreePaired.added.sort(byPath);
  subtreePaired.removed.sort(byPath);
  changed.sort(byPath);

  const orderCollapsed = collapseArrayOrderOnlyChanges(
    changed,
    subtreePaired.added,
    subtreePaired.removed,
    parsedA.value,
    parsedB.value,
  );

  return {
    ok: true,
    added: subtreePaired.added,
    removed: subtreePaired.removed,
    changed: orderCollapsed.changed,
    renamed,
    reordered: orderCollapsed.reordered,
  };
}

export function formatStructuredValue(value: unknown): string {
  if (value === undefined) return '—';
  if (typeof value === 'string') return JSON.stringify(value);
  return stableStringify(value);
}

/** Human-readable field label from a dotted path (tooltip keeps full path). */
export function semanticPathDisplayName(path: string): string {
  const arrayMatch = path.match(/\[(\d+)\]$/);
  if (arrayMatch) {
    const parent = path.replace(/\[\d+\]$/, '').replace(/^\$\.?/, '');
    return parent ? `${parent}[${arrayMatch[1]}]` : `[${arrayMatch[1]}]`;
  }
  const dot = path.lastIndexOf('.');
  const segment = dot >= 0 ? path.slice(dot + 1) : path.replace(/^\$\.?/, '');
  return segment || path;
}

/** Ordered search needles for scrolling an editor to a semantic path. */
export function semanticPathToSearchHints(path: string): string[] {
  if (path === '$') return [];
  const tail = path.startsWith('$.') ? path.slice(2) : path.startsWith('$') ? path.slice(1) : '';
  if (!tail) return [];
  const segments = tail.match(/[^.[\]]+|\[\d+\]/g) ?? [];
  return segments.map((segment) => {
    if (segment.startsWith('[')) return segment;
    if (/^[A-Za-z_][\w-]*$/.test(segment)) return `"${segment}"`;
    return segment;
  });
}

/** Last segment of a path — useful for scrolling the editor to a key line. */
export function semanticPathSearchHint(path: string): string {
  const hints = semanticPathToSearchHints(path);
  return hints.at(-1) ?? path;
}

export type StructuredSemanticDiffFilter = 'all' | 'keys' | 'values';

export function semanticDiffCounts(diff: StructuredSemanticDiff): {
  added: number;
  removed: number;
  changed: number;
  renamed: number;
  reordered: number;
  keys: number;
  values: number;
  total: number;
} {
  const added = diff.added.length;
  const removed = diff.removed.length;
  const changed = diff.changed.length;
  const renamed = diff.renamed.length;
  const reordered = diff.reordered.length;
  return {
    added,
    removed,
    changed,
    renamed,
    reordered,
    keys: added + removed + renamed,
    values: changed + reordered,
    total: added + removed + changed + renamed + reordered,
  };
}
