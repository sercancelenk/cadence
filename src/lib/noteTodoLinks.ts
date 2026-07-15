import type { NoteTodoLink } from '../core/model';

export function noteTodoLinksOf(links: NoteTodoLink[] | undefined): NoteTodoLink[] {
  return links ?? [];
}

export function linksForNote(
  links: NoteTodoLink[] | undefined,
  noteId: string,
): NoteTodoLink[] {
  return noteTodoLinksOf(links).filter((l) => l.noteId === noteId);
}

export function linksForTodo(
  links: NoteTodoLink[] | undefined,
  todoId: string,
): NoteTodoLink[] {
  return noteTodoLinksOf(links).filter((l) => l.todoId === todoId);
}

export function todoIdsLinkedToNote(
  links: NoteTodoLink[] | undefined,
  noteId: string,
): string[] {
  return linksForNote(links, noteId).map((l) => l.todoId);
}

export function noteIdsLinkedToTodo(
  links: NoteTodoLink[] | undefined,
  todoId: string,
): string[] {
  return linksForTodo(links, todoId).map((l) => l.noteId);
}

/** Truncate pill labels — parent controls content; this is a shared helper. */
export function truncateEntityLinkLabel(label: string, max = 28): string {
  const t = label.trim() || 'Untitled';
  if (t.length <= max) return t;
  return `${t.slice(0, Math.max(1, max - 1))}…`;
}
