import type { AppData } from '../../model';

/**
 * Merge reminder-related fields from disk into in-memory AppData without
 * stomping unsaved local edits (title, body, status, etc.).
 *
 * Used when Electron main fires a reminder and pushes persisted state back
 * via `onReminderEvent` — a full `replaceAll` would discard pending edits
 * still in the renderer debounce window.
 */
export function mergeReminderEventIntoAppData(prev: AppData, disk: AppData): AppData {
  const diskTodoById = new Map(disk.todoItems.map((t) => [t.id, t]));
  const diskItemById = new Map(disk.items.map((i) => [i.id, i]));

  return {
    ...prev,
    notifiedReminderIds: disk.notifiedReminderIds,
    todoItems: prev.todoItems.map((t) => {
      const d = diskTodoById.get(t.id);
      if (!d) return t;
      if (t.remindAt === d.remindAt && t.remindRepeat === d.remindRepeat) return t;
      return { ...t, remindAt: d.remindAt, remindRepeat: d.remindRepeat };
    }),
    items: prev.items.map((it) => {
      const d = diskItemById.get(it.id);
      if (!d) return it;
      if (it.remindAt === d.remindAt && it.remindRepeat === d.remindRepeat) return it;
      return { ...it, remindAt: d.remindAt, remindRepeat: d.remindRepeat };
    }),
  };
}
