import type { AppData } from '../model';
import { isNoteArchived, isTodoItemArchived } from '../model';

export type WorkspaceStorageBreakdown = {
  /** UTF-8 byte estimate of the full workspace JSON. */
  totalBytes: number;
  notesBytes: number;
  notesArchivedBytes: number;
  todoItemsBytes: number;
  todoItemsArchivedBytes: number;
  teamsAndPeopleBytes: number;
  teamItemsBytes: number;
  otherBytes: number;
  counts: {
    notes: number;
    notesArchived: number;
    todoItems: number;
    todoItemsArchived: number;
    teamItems: number;
  };
};

function utf8ByteLength(text: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  return text.length;
}

function jsonBytes(value: unknown): number {
  try {
    return utf8ByteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

/** Rough in-memory size estimate by domain — helps spot notes/todo body bloat. */
export function estimateWorkspaceStorage(data: AppData): WorkspaceStorageBreakdown {
  const activeNotes = data.notes.filter((n) => !isNoteArchived(n));
  const archivedNotes = data.notes.filter((n) => isNoteArchived(n));
  const activeTodos = data.todoItems.filter((t) => !isTodoItemArchived(t));
  const archivedTodos = data.todoItems.filter((t) => isTodoItemArchived(t));

  const notesBytes = jsonBytes(activeNotes);
  const notesArchivedBytes = jsonBytes(archivedNotes);
  const todoItemsBytes = jsonBytes(activeTodos);
  const todoItemsArchivedBytes = jsonBytes(archivedTodos);
  const teamsAndPeopleBytes = jsonBytes({ teams: data.teams, people: data.people, profile: data.profile });
  const teamItemsBytes = jsonBytes(data.items);
  const otherBytes = jsonBytes({
    todoGroups: data.todoGroups,
    aiSettings: data.aiSettings,
    utilityDocument: data.utilityDocument,
    utilityStructuredText: data.utilityStructuredText,
    notesLock: data.notesLock,
    notifiedReminderIds: data.notifiedReminderIds,
    lastTeamId: data.lastTeamId,
    version: data.version,
  });

  const totalBytes =
    notesBytes +
    notesArchivedBytes +
    todoItemsBytes +
    todoItemsArchivedBytes +
    teamsAndPeopleBytes +
    teamItemsBytes +
    otherBytes;

  return {
    totalBytes,
    notesBytes,
    notesArchivedBytes,
    todoItemsBytes,
    todoItemsArchivedBytes,
    teamsAndPeopleBytes,
    teamItemsBytes,
    otherBytes,
    counts: {
      notes: activeNotes.length,
      notesArchived: archivedNotes.length,
      todoItems: activeTodos.length,
      todoItemsArchived: archivedTodos.length,
      teamItems: data.items.length,
    },
  };
}

export function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
