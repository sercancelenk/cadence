/**
 * Nested note lists. `NoteGroup.parentId` is optional and read defensively:
 * a missing, dangling, self-referencing or cyclic parent makes the list a
 * root — the list and its notes are always kept, never dropped or rewritten.
 *
 * Archiving is a single flag on a list. Its sub-lists and notes are archived
 * by derivation (see {@link isGroupEffectivelyArchived}), so restoring the flag
 * puts everything back exactly where it was and no note's own `archived`
 * value is ever touched.
 */

import type { Note, NoteGroup } from './index';

export const MAX_NOTE_GROUP_DEPTH = 5;

type GroupLike = Pick<NoteGroup, 'id' | 'parentId' | 'archived'>;
type GroupIndex = Map<string, GroupLike>;

function indexGroups(groups: readonly GroupLike[]): GroupIndex {
  return new Map(groups.map((g) => [g.id, g]));
}

function effectiveParent(index: GroupIndex, id: string): string | undefined {
  const parentId = index.get(id)?.parentId;
  if (!parentId || parentId === id || !index.has(parentId)) return undefined;
  // A list that can reach itself through its parents is part of a cycle:
  // detach it (root) rather than loop. Branches hanging off the cycle stay.
  const seen = new Set<string>([id]);
  let cur: string | undefined = parentId;
  while (cur) {
    if (cur === id) return undefined;
    if (seen.has(cur)) break;
    seen.add(cur);
    const next: string | undefined = index.get(cur)?.parentId;
    if (!next || !index.has(next)) break;
    cur = next;
  }
  return parentId;
}

function childrenIndex(index: GroupIndex): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const id of index.keys()) {
    const parent = effectiveParent(index, id);
    if (!parent) continue;
    const list = children.get(parent);
    if (list) list.push(id);
    else children.set(parent, [id]);
  }
  return children;
}

/** The parent that actually applies, or undefined when the list is a root. */
export function effectiveParentId(groups: readonly GroupLike[], id: string): string | undefined {
  return effectiveParent(indexGroups(groups), id);
}

/** Ancestor ids, nearest first. */
export function groupAncestors(groups: readonly GroupLike[], id: string): string[] {
  const index = indexGroups(groups);
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let cur = effectiveParent(index, id);
  while (cur && !seen.has(cur)) {
    out.push(cur);
    seen.add(cur);
    cur = effectiveParent(index, cur);
  }
  return out;
}

/** Root lists have depth 1. */
export function groupDepth(groups: readonly GroupLike[], id: string): number {
  return groupAncestors(groups, id).length + 1;
}

export function groupDescendantIds(groups: readonly GroupLike[], id: string): string[] {
  const children = childrenIndex(indexGroups(groups));
  const out: string[] = [];
  const queue = [...(children.get(id) ?? [])];
  const seen = new Set<string>([id]);
  while (queue.length > 0) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    out.push(next);
    queue.push(...(children.get(next) ?? []));
  }
  return out;
}

/** Levels in the subtree rooted at `id`; a list with no sub-lists is 1. */
export function groupSubtreeHeight(groups: readonly GroupLike[], id: string): number {
  const children = childrenIndex(indexGroups(groups));
  const height = (node: string, seen: Set<string>): number => {
    if (seen.has(node)) return 0;
    const next = new Set(seen).add(node);
    let tallest = 0;
    for (const child of children.get(node) ?? []) tallest = Math.max(tallest, height(child, next));
    return 1 + tallest;
  };
  return height(id, new Set());
}

/** Archived itself, or inside an archived list. */
export function isGroupEffectivelyArchived(groups: readonly GroupLike[], id: string): boolean {
  const index = indexGroups(groups);
  if (index.get(id)?.archived === true) return true;
  return groupAncestors(groups, id).some((a) => index.get(a)?.archived === true);
}

export function isNoteEffectivelyArchived(
  note: Pick<Note, 'archived' | 'groupId'>,
  groups: readonly GroupLike[],
): boolean {
  if (note.archived === true) return true;
  return note.groupId ? isGroupEffectivelyArchived(groups, note.groupId) : false;
}

/** Top-most archived lists: the ones the Archived view shows (with their subtree). */
export function archivedRootGroupIds(groups: readonly GroupLike[]): string[] {
  const index = indexGroups(groups);
  return groups
    .filter(
      (g) =>
        g.archived === true &&
        !groupAncestors(groups, g.id).some((a) => index.get(a)?.archived === true),
    )
    .map((g) => g.id);
}
