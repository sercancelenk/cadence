import type { Note, NoteGroup } from '../../model';

/** Sidebar display order: grouped notes (by list) then ungrouped. */
export function flatSidebarNoteIds(groups: NoteGroup[], notes: Note[]): string[] {
  const sortedGroups = [...groups].sort((a, b) => a.sortOrder - b.sortOrder);
  const byGroup = new Map<string, Note[]>();
  for (const g of sortedGroups) byGroup.set(g.id, []);
  const ungrouped: Note[] = [];
  for (const n of notes) {
    if (n.groupId && byGroup.has(n.groupId)) {
      byGroup.get(n.groupId)!.push(n);
    } else {
      ungrouped.push(n);
    }
  }
  const ids: string[] = [];
  for (const g of sortedGroups) {
    for (const n of byGroup.get(g.id) ?? []) ids.push(n.id);
  }
  for (const n of ungrouped) ids.push(n.id);
  return ids;
}
