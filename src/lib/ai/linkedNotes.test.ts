import { describe, expect, it } from 'vitest';
import type { AppData, Note, NoteTodoLink, TodoItem } from '../../model';
import { linkedNotesFor } from './linkedNotes';

const AT = '2026-10-25T09:00:00.000Z';
const note = (id: string, title: string, text: string, over: Partial<Note> = {}): Note =>
  ({ id, title, body: '', bodyFormat: 'markdown', bodyPlainText: text, createdAt: AT, updatedAt: AT, ...over }) as Note;
const link = (noteId: string, todoId: string): NoteTodoLink => ({ id: `${noteId}-${todoId}`, noteId, todoId, createdAt: AT });
const todo = (id: string, over: Partial<TodoItem> = {}): TodoItem => ({ id, groupId: 'g', title: id, status: 'todo', done: false, createdAt: AT, updatedAt: AT, ...over }) as TodoItem;
const data = (notes: Note[], links: NoteTodoLink[], todos: TodoItem[]): Pick<AppData, 'notes' | 'noteTodoLinks' | 'todoItems'> =>
  ({ notes, noteTodoLinks: links, todoItems: todos });

describe('linkedNotesFor', () => {
  it('returns the title and the start of the text of each linked note', () => {
    const d = data([note('n1', 'Vendor call', 'We agreed on Friday as the cut-off.')], [link('n1', 't1')], [todo('t1')]);
    expect(linkedNotesFor(d, 't1')).toEqual([{ title: 'Vendor call', text: 'We agreed on Friday as the cut-off.' }]);
  });

  it('also follows the older sourceNoteId, without listing the same note twice', () => {
    const d = data([note('n1', 'A', 'x'), note('n2', 'B', 'y')], [link('n1', 't1')], [todo('t1', { sourceNoteId: 'n1' }), todo('t2', { sourceNoteId: 'n2' })]);
    expect(linkedNotesFor(d, 't1').map((n) => n.title)).toEqual(['A']);
    expect(linkedNotesFor(d, 't2').map((n) => n.title)).toEqual(['B']);
  });

  it('never reads a locked or archived note, and ignores a link to a note that is gone', () => {
    const d = data(
      [note('n1', 'Locked', 'secret', { locked: true }), note('n2', 'Old', 'z', { archived: true }), note('n3', 'Open', 'fine')],
      [link('n1', 't1'), link('n2', 't1'), link('n3', 't1'), link('gone', 't1')],
      [todo('t1')],
    );
    expect(linkedNotesFor(d, 't1')).toEqual([{ title: 'Open', text: 'fine' }]);
  });

  it('keeps at most two notes and clips long text', () => {
    const d = data(
      [note('n1', 'A', 'a'.repeat(5000)), note('n2', 'B', 'b'), note('n3', 'C', 'c')],
      [link('n1', 't1'), link('n2', 't1'), link('n3', 't1')],
      [todo('t1')],
    );
    const out = linkedNotesFor(d, 't1');
    expect(out).toHaveLength(2);
    expect(out[0]!.text.length).toBeLessThanOrEqual(600);
  });

  it('is empty for a task with no link', () => {
    expect(linkedNotesFor(data([], [], [todo('t1')]), 't1')).toEqual([]);
  });
});
