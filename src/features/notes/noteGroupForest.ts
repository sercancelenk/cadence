import type { Note, NoteGroup } from '../../model';
import {
  MAX_NOTE_GROUP_DEPTH,
  effectiveParentId,
  groupAncestors,
  groupDepth,
  groupDescendantIds,
  groupSubtreeHeight,
  isGroupEffectivelyArchived,
} from '../../model';
import type { NoteViewMode } from './notePreferences';

/**
 * What the sidebar draws for nested lists. Pure, so the rules (what shows in
 * Active vs Archived, what can be restored) are tested without rendering.
 */
export type GroupNode = {
  group: NoteGroup;
  children: GroupNode[];
  /** Notes filed directly in this list (already filtered to the current view). */
  notes: Note[];
  /** Notes in this list and every sub-list shown under it. */
  noteCount: number;
  /** "Parent / Child" context for a list shown as a root although it has ancestors. */
  pathLabel?: string;
  canRestore: boolean;
  canArchive: boolean;
  canAddSubList: boolean;
};

export type GroupForest = { roots: GroupNode[]; ungrouped: Note[] };

const byOrder = (a: NoteGroup, b: NoteGroup) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

export function buildGroupForest(input: {
  groups: NoteGroup[];
  notes: Note[];
  viewMode: NoteViewMode;
}): GroupForest {
  const { groups, notes, viewMode } = input;
  const archivedView = viewMode === 'archived';
  const names = new Map(groups.map((g) => [g.id, g.name]));

  const directNotes = new Map<string, Note[]>();
  for (const note of notes) {
    if (!note.groupId) continue;
    const list = directNotes.get(note.groupId);
    if (list) list.push(note);
    else directNotes.set(note.groupId, [note]);
  }

  // Active: everything not archived. Archived: archived lists, plus live lists
  // that hold a note archived on its own — so that note keeps its context.
  const visible = new Set(
    groups
      .filter((g) => {
        const archived = isGroupEffectivelyArchived(groups, g.id);
        return archivedView ? archived || (directNotes.get(g.id)?.length ?? 0) > 0 : !archived;
      })
      .map((g) => g.id),
  );

  const archivedById = new Map(groups.map((g) => [g.id, g.archived === true]));
  const nodes = new Map<string, GroupNode>();
  for (const g of groups) {
    if (!visible.has(g.id)) continue;
    const ancestors = groupAncestors(groups, g.id);
    nodes.set(g.id, {
      group: g,
      children: [],
      notes: directNotes.get(g.id) ?? [],
      noteCount: 0,
      canRestore:
        archivedView && g.archived === true && !ancestors.some((a) => archivedById.get(a) === true),
      canArchive: !archivedView,
      canAddSubList: !archivedView && groupDepth(groups, g.id) < MAX_NOTE_GROUP_DEPTH,
    });
  }

  const roots: GroupNode[] = [];
  for (const g of [...groups].sort(byOrder)) {
    const node = nodes.get(g.id);
    if (!node) continue;
    const ancestors = groupAncestors(groups, g.id);
    const parentId = ancestors.find((a) => visible.has(a));
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      if (ancestors.length > 0) {
        node.pathLabel = [...ancestors].reverse().map((a) => names.get(a) ?? a).join(' / ');
      }
      roots.push(node);
    }
  }

  const count = (node: GroupNode): number => {
    node.noteCount = node.notes.length + node.children.reduce((sum, c) => sum + count(c), 0);
    return node.noteCount;
  };
  roots.forEach(count);

  const ungrouped = notes.filter((n) => !n.groupId || !nodes.has(n.groupId));
  return { roots, ungrouped };
}

/** Note ids in the order the sidebar draws them (sub-lists, own notes, then ungrouped). */
export function flattenForestNoteIds(forest: GroupForest): string[] {
  const out: string[] = [];
  const walk = (node: GroupNode) => {
    node.children.forEach(walk);
    for (const n of node.notes) out.push(n.id);
  };
  forest.roots.forEach(walk);
  for (const n of forest.ungrouped) out.push(n.id);
  return out;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What deleting a list does to its contents — shown in the confirmation. */
export function describeGroupDeletion(
  groups: NoteGroup[],
  notes: Note[],
  groupId: string,
): { noteCount: number; subListCount: number; destinationName?: string; message: string } {
  const noteCount = notes.filter((n) => n.groupId === groupId).length;
  const subListCount = groups.filter((g) => g.parentId === groupId).length;
  const destinationId = effectiveParentId(groups, groupId);
  const destinationName = destinationId ? groups.find((g) => g.id === destinationId)?.name : undefined;

  const parts: string[] = [];
  if (noteCount > 0) parts.push(plural(noteCount, 'note', 'notes'));
  if (subListCount > 0) parts.push(plural(subListCount, 'sub-list', 'sub-lists'));
  if (parts.length === 0) return { noteCount, subListCount, destinationName, message: 'This list is empty.' };

  const where = destinationName ? `“${destinationName}”` : 'the top level';
  return {
    noteCount,
    subListCount,
    destinationName,
    message: `${parts.join(' and ')} will move to ${where}. Nothing else is deleted.`,
  };
}

/** Valid "Move to…" destinations for a list; `id: undefined` is the top level. */
export function moveTargets(
  groups: NoteGroup[],
  groupId: string,
): { id: string | undefined; label: string }[] {
  const target = groups.find((g) => g.id === groupId);
  if (!target) return [];
  const blocked = new Set([groupId, ...groupDescendantIds(groups, groupId)]);
  const height = groupSubtreeHeight(groups, groupId);
  const names = new Map(groups.map((g) => [g.id, g.name]));

  const out: { id: string | undefined; label: string }[] = [];
  if (target.parentId !== undefined) out.push({ id: undefined, label: 'Top level' });
  for (const g of groups) {
    if (blocked.has(g.id) || g.id === target.parentId) continue;
    if (groupDepth(groups, g.id) + height > MAX_NOTE_GROUP_DEPTH) continue;
    const path = [...groupAncestors(groups, g.id)].reverse().map((a) => names.get(a) ?? a);
    out.push({ id: g.id, label: [...path, g.name].join(' / ') });
  }
  return out.sort((a, b) => (a.id === undefined ? -1 : b.id === undefined ? 1 : a.label.localeCompare(b.label)));
}
