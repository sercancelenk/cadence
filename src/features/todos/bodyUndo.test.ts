import { describe, expect, it } from 'vitest';
import { addTodoGroup, addTodoItem, updateTodoItem } from '../../core/actions';
import { emptyData } from '../../core/model';
import type { AppData, TodoItem } from '../../core/model';
import { appendChecklistToBodyFields, appendPlainTextToBodyFields } from '../../lib/richTextBody';
import { serializeRichDoc } from '../../lib/richText';
import { bodyRestorePatch } from './bodyUndo';
import { todoBodyPatchFromFields } from './todoBody';

function withTask(extras: Parameters<typeof addTodoItem>[3]): { data: AppData; task: TodoItem } {
  let data = addTodoGroup(emptyData(), 'Work', 'g1');
  data = addTodoItem(data, 'g1', 'Ship it', extras);
  return { data, task: data.todoItems[0] };
}
const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Already here' }] }] };
const bodyOf = (t: TodoItem) => ({ body: t.body, bodyFormat: t.bodyFormat, bodyPlainText: t.bodyPlainText });

describe('bodyRestorePatch', () => {
  it.each([
    ['an empty body', undefined],
    ['a markdown body', { body: 'Notes', bodyFormat: 'markdown' as const, bodyPlainText: 'Notes' }],
    ['a ProseMirror body', { body: serializeRichDoc(doc), bodyFormat: 'prosemirror' as const, bodyPlainText: 'Already here' }],
    ['a legacy body with no format flag', { body: serializeRichDoc(doc), bodyPlainText: 'Already here' }],
  ])('puts %s back exactly after a checklist was added', (_n, extras) => {
    let { data, task } = withTask(extras);
    const before = bodyOf(task);
    const applied = appendChecklistToBodyFields(task, ['One', 'Two']);
    data = updateTodoItem(data, task.id, todoBodyPatchFromFields(applied));
    const r = bodyRestorePatch(data.todoItems[0], applied, task);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    data = updateTodoItem(data, task.id, r.patch);
    expect(bodyOf(data.todoItems[0])).toEqual(before);
  });

  it('puts the task back after a reply was appended to it', () => {
    let { data, task } = withTask({ body: 'Notes', bodyFormat: 'markdown', bodyPlainText: 'Notes' });
    const applied = appendPlainTextToBodyFields(task, 'The answer');
    data = updateTodoItem(data, task.id, todoBodyPatchFromFields(applied));
    const r = bodyRestorePatch(data.todoItems[0], applied, task);
    if (!r.ok) throw new Error('expected a patch');
    data = updateTodoItem(data, task.id, r.patch);
    expect(data.todoItems[0].body).toBe('Notes');
  });

  it('refuses when the task was edited after the change, so the newer text is never overwritten', () => {
    let { data, task } = withTask({ body: 'Notes', bodyFormat: 'markdown', bodyPlainText: 'Notes' });
    const applied = appendChecklistToBodyFields(task, ['One']);
    data = updateTodoItem(data, task.id, todoBodyPatchFromFields(applied));
    data = updateTodoItem(data, task.id, { body: 'Typed afterwards', bodyFormat: 'markdown', bodyPlainText: 'Typed afterwards' });
    expect(bodyRestorePatch(data.todoItems[0], applied, task)).toEqual({ ok: false, reason: 'changed' });
  });

  it('refuses when the task is gone', () => {
    const { task } = withTask(undefined);
    expect(bodyRestorePatch(undefined, { body: 'x' }, task)).toEqual({ ok: false, reason: 'missing' });
  });
});
