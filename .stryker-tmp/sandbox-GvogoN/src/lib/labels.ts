// @ts-nocheck
import type { ItemKind } from '../model';

const labels: Record<ItemKind, string> = {
  task: 'Task',
  note: 'Note',
  goal: 'Goal',
  document: 'Document',
  feedback: 'Feedback',
};

export function kindLabel(k: ItemKind): string {
  return labels[k] ?? k;
}
