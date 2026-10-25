import { describe, expect, it } from 'vitest';
import { addTodoGroup, addTodoItem } from '../../core/actions';
import { emptyData } from '../../core/model';
import { stepsForTopInsert } from './breakdownTasks';

describe('stepsForTopInsert', () => {
  const steps = [{ title: 'First' }, { title: 'Second', detail: 'd' }, { title: 'Third' }];

  it('makes tasks added one by one to the top of a list end up in the order of the steps', () => {
    let data = addTodoGroup(emptyData(), 'Work', 'g1');
    for (const step of stepsForTopInsert(steps)) data = addTodoItem(data, 'g1', step.title);
    const shown = [...data.todoItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((t) => t.title);
    expect(shown).toEqual(['First', 'Second', 'Third']);
  });

  it('does not change the list it is given', () => {
    const copy = [...steps];
    stepsForTopInsert(steps);
    expect(steps).toEqual(copy);
  });
});
