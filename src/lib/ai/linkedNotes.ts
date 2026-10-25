import type { AppData } from '../../model';
import { noteIdsLinkedToTodo } from '../noteTodoLinks';
import { plainTextFromBodyFields } from '../richTextBody';
import { clip } from './prompts/shared';

export type LinkedNote = { title: string; text: string };

const MAX_NOTES = 2;
const MAX_NOTE_CHARS = 600;

/**
 * The notes a task is linked to (the link table, and the older `sourceNoteId`), as a title and the
 * start of the text. A locked or archived note is never read, and a link to a deleted note is ignored.
 */
export function linkedNotesFor(
  data: Pick<AppData, 'notes' | 'noteTodoLinks' | 'todoItems'>,
  todoId: string,
): LinkedNote[] {
  const ids = noteIdsLinkedToTodo(data.noteTodoLinks, todoId);
  const legacy = data.todoItems.find((t) => t.id === todoId)?.sourceNoteId;
  if (legacy) ids.push(legacy);
  const out: LinkedNote[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (out.length === MAX_NOTES) break;
    if (seen.has(id)) continue;
    seen.add(id);
    const note = (data.notes ?? []).find((n) => n.id === id);
    if (!note || note.locked || note.archived) continue;
    const text = clip(plainTextFromBodyFields(note).replace(/\s+/g, ' ').trim(), MAX_NOTE_CHARS);
    out.push({ title: clip(note.title.trim(), 120), text });
  }
  return out;
}
