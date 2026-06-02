import type { CSSProperties } from 'react';
import type { Priority, TodoGroup } from '../../model';

export function hashHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h) % 360;
}

export function tagColor(groupId: string): string {
  return `hsl(${hashHue(groupId)} 58% 40%)`;
}

export function ringStyle(groupId: string): CSSProperties {
  return { ['--todo-ring' as string]: `hsl(${hashHue(groupId)} 62% 46%)` };
}

export function priorityShort(p: Priority): string {
  switch (p) {
    case 'urgent':
      return 'U';
    case 'high':
      return 'H';
    case 'normal':
      return 'N';
    case 'low':
      return 'L';
    default:
      return '';
  }
}

/** Pinned → unpinned → archived, each tier by sortOrder. */
export function sortGroups(groups: TodoGroup[]): TodoGroup[] {
  return [...groups].sort((a, b) => {
    const ap = !!a.pinned;
    const bp = !!b.pinned;
    const aa = !!a.archived;
    const ba = !!b.archived;
    if (aa !== ba) return aa ? 1 : -1;
    if (ap !== bp) return ap ? -1 : 1;
    return a.sortOrder - b.sortOrder;
  });
}
