import type { ItemKind } from '../model';

const labels: Record<ItemKind, string> = {
  task: 'Task',
  note: 'Note',
  goal: 'Goal',
  document: 'Document',
};

export function kindLabel(k: ItemKind): string {
  return labels[k] ?? k;
}
